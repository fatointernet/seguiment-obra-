-- Migració de seguretat per a bases de dades creades abans de l'11/11/2026.
-- Enganxa-la a Supabase > SQL Editor > New query i prem Run. Es pot executar més d'una vegada.

-- 1. Columnes noves: qui ha escrit cada resposta/foto (professional verificat o clau del dispositiu del client).
alter table public.entries add column if not exists by_owner boolean not null default false;
alter table public.entries add column if not exists author_key text;
alter table public.photos  add column if not exists by_owner boolean not null default false;
alter table public.photos  add column if not exists author_key text;
create index if not exists entries_item_idx on public.entries (item_id);
create index if not exists photos_item_idx on public.photos (item_id);

-- Les fotos antigues pujades a la carpeta del professional es marquen com a seves.
update public.photos set by_owner = true where not by_owner and author_key is null and split_part(path, '/', 2) = 'owner';

-- Una mateixa foto no pot estar registrada dues vegades.
delete from public.photos a using public.photos b where a.path = b.path and a.created_at > b.created_at;
create unique index if not exists photos_path_idx on public.photos (path);

-- 2. Les funcions que canvien de paràmetres s'han d'esborrar abans de tornar-les a crear.
drop function if exists public.get_board(uuid, uuid);
drop function if exists public.add_entry(uuid, text, text, uuid);
drop function if exists public.delete_entry(uuid, text, uuid);
drop function if exists public.add_photo(uuid, text, text, uuid);
drop function if exists public.delete_photo(uuid, text, uuid);

-- ============ FUNCIONS, LÍMITS I FOTOS ============
-- Tot aquest bloc es pot executar més d'una vegada (és el mateix que porten les migracions).

-- ---- ajudes internes (no es poden cridar des de fora) ----
create or replace function public._h(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

create or replace function public._keyhash(p_key text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when char_length(p_key) between 20 and 200 then public._h(p_key) end
$$;

create or replace function public._is_owner(p_project uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from projects p where p.id = p_project and p.owner_id = auth.uid())
$$;

-- Un client amb enllaç no pot signar amb el nom del professional.
create or replace function public._name_ok(p_project uuid, p_author text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select char_length(btrim(coalesce(p_author, ''))) between 1 and 40
     and not exists (
       select 1 from projects p
       where p.id = p_project and p.owner_id is distinct from auth.uid()
         and lower(btrim(p.owner_name)) = lower(btrim(p_author)))
$$;

create or replace function public._project_of_item(p_item uuid, p_token uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select i.project_id
  from items i join projects p on p.id = i.project_id
  where i.id = p_item
    and (p.owner_id = auth.uid()
         or (p_token is not null and p.share_enabled and p.share_token = p_token))
$$;

-- ---- límits contra l'abús (algú amb l'enllaç o un compte no pot omplir la base de dades) ----
create or replace function public._limits()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; lim int;
begin
  if tg_table_name = 'projects' then
    select count(*) into n from projects where owner_id = new.owner_id; lim := 300;
  elsif tg_table_name = 'items' then
    select count(*) into n from items where project_id = new.project_id; lim := 1000;
  elsif tg_table_name = 'entries' then
    select count(*) into n from entries where item_id = new.item_id; lim := 300;
  else
    select count(*) into n from photos where item_id = new.item_id; lim := 40;
  end if;
  if n >= lim then raise exception 'limit_reached' using errcode = 'P0003'; end if;
  return new;
end $$;

drop trigger if exists projects_limit on public.projects;
drop trigger if exists items_limit on public.items;
drop trigger if exists entries_limit on public.entries;
drop trigger if exists photos_limit on public.photos;
create trigger projects_limit before insert on public.projects for each row execute function public._limits();
create trigger items_limit before insert on public.items for each row execute function public._limits();
create trigger entries_limit before insert on public.entries for each row execute function public._limits();
create trigger photos_limit before insert on public.photos for each row execute function public._limits();

-- ---- funcions que fa servir la web (professional i client amb enllaç) ----
-- p_key és una clau secreta que cada navegador de client genera i guarda: serveix per saber
-- quines respostes i fotos són seves («mine») sense haver de crear cap compte.
create or replace function public.get_board(p_project uuid default null, p_token uuid default null, p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v projects%rowtype; v_h text := _keyhash(p_key);
begin
  if p_token is not null then
    select * into v from projects where share_token = p_token and share_enabled;
  elsif auth.uid() is not null then
    select * into v from projects where id = p_project and owner_id = auth.uid();
  end if;
  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'project', jsonb_build_object('id', v.id, 'name', v.name, 'client_name', v.client_name,
                                  'owner_name', v.owner_name, 'is_owner', coalesce(v.owner_id = auth.uid(), false)),
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'created_at' order by i.position, i.created_at)
                       from items i where i.project_id = v.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'item_id', e.item_id, 'author', e.author,
                           'body', e.body, 'created_at', e.created_at, 'by_owner', e.by_owner,
                           'legacy', e.author_key is null and not e.by_owner,
                           'mine', coalesce(e.author_key = v_h, false)) order by e.created_at)
                         from entries e where e.project_id = v.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'item_id', ph.item_id, 'author', ph.author,
                          'path', ph.path, 'created_at', ph.created_at, 'by_owner', ph.by_owner,
                          'legacy', ph.author_key is null and not ph.by_owner,
                          'mine', coalesce(ph.author_key = v_h, false)) order by ph.created_at)
                        from photos ph where ph.project_id = v.id), '[]'::jsonb)
  );
end $$;

create or replace function public.add_entry(p_item uuid, p_author text, p_body text, p_token uuid default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project uuid; v_id uuid; v_own boolean;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not _name_ok(v_project, p_author) then raise exception 'name_taken' using errcode = 'P0004'; end if;
  v_own := _is_owner(v_project);
  insert into entries (item_id, project_id, author, body, by_owner, author_key)
  values (p_item, v_project, btrim(p_author), btrim(p_body), v_own, case when v_own then null else _keyhash(p_key) end)
  returning id into v_id;
  return v_id;
end $$;

-- El professional pot esborrar qualsevol entrada de les seves obres. El client, només les que ha escrit
-- des del seu dispositiu (clau); les antigues sense clau, pel nom. Mai les del professional.
create or replace function public.delete_entry(p_entry uuid, p_author text, p_token uuid default null, p_key text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from entries e using projects p
  where e.id = p_entry and p.id = e.project_id
    and (p.owner_id = auth.uid()
         or (p_token is not null and p.share_enabled and p.share_token = p_token and not e.by_owner
             and case when e.author_key is not null then e.author_key = _keyhash(p_key)
                      else lower(e.author) = lower(btrim(p_author)) and lower(e.author) <> lower(btrim(p.owner_name)) end));
end $$;

create or replace function public.add_item(p_project uuid, p_section text, p_title text, p_question text, p_position int, p_token uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from projects p
    where p.id = p_project
      and (p.owner_id = auth.uid() or (p_token is not null and p.share_enabled and p.share_token = p_token))
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into items (project_id, section, position, title, question, status)
  values (p_project, btrim(p_section), p_position, btrim(p_title), btrim(p_question), 'open')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.add_photo(p_item uuid, p_author text, p_path text, p_token uuid default null, p_key text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project uuid; v_id uuid; v_own boolean; v_token uuid; v_folder text;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not _name_ok(v_project, p_author) then raise exception 'name_taken' using errcode = 'P0004'; end if;
  v_own := _is_owner(v_project);
  select share_token into v_token from projects where id = v_project;
  -- La ruta ha de ser <obra>/<carpeta>/<punt>/<fitxer>; la carpeta «owner» només la pot fer servir el professional.
  if p_path !~ ('^' || v_project::text || '/(owner|[0-9a-f]{64})/' || p_item::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'bad_path';
  end if;
  v_folder := split_part(p_path, '/', 2);
  if not ((v_folder = 'owner' and v_own) or v_folder = _h(v_token::text)) then
    raise exception 'bad_path';
  end if;
  insert into photos (item_id, project_id, author, path, by_owner, author_key)
  values (p_item, v_project, btrim(p_author), p_path, v_own, case when v_own then null else _keyhash(p_key) end)
  returning id into v_id;
  return v_id;
end $$;

-- Retorna la ruta del fitxer esborrat (o null si no s'ha esborrat res) perquè el navegador pugui treure'l del magatzem.
create or replace function public.delete_photo(p_photo uuid, p_author text, p_token uuid default null, p_key text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_path text;
begin
  delete from photos ph using projects p
  where ph.id = p_photo and p.id = ph.project_id
    and (p.owner_id = auth.uid()
         or (p_token is not null and p.share_enabled and p.share_token = p_token and not ph.by_owner
             and case when ph.author_key is not null then ph.author_key = _keyhash(p_key)
                      else lower(ph.author) = lower(btrim(p_author)) and lower(ph.author) <> lower(btrim(p.owner_name)) end))
  returning ph.path into v_path;
  return v_path;
end $$;

create or replace function public.set_flag(p_item uuid, p_flag boolean, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project uuid;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not _name_ok(v_project, p_author) then raise exception 'name_taken' using errcode = 'P0004'; end if;
  update items set flag = coalesce(p_flag, false), flag_by = btrim(p_author), flag_at = now() where id = p_item;
end $$;

create or replace function public.set_status(p_item uuid, p_status text, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project uuid;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not _name_ok(v_project, p_author) then raise exception 'name_taken' using errcode = 'P0004'; end if;
  if p_status is null or p_status not in ('done', 'client', 'pro', 'open', 'info') then raise exception 'bad_status'; end if;
  update items set status = p_status, status_by = btrim(p_author), status_at = now() where id = p_item;
end $$;

-- ---- fotos: magatzem (storage) ----
-- Les fotos es pujen directament des del navegador al bucket «photos», públic només per a lectura.
-- Rutes: <obra>/owner/<punt>/<fitxer> (professional) o <obra>/<sha256 del token>/<punt>/<fitxer> (client).
-- Es fa servir el hash i no el token perquè l'adreça d'una foto reenviada no doni accés a l'obra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Les polítiques s'executen amb els permisos de qui fa la petició; el client sense compte no pot llegir
-- la taula projects, per això les comprovacions van dins de funcions security definer.
create or replace function public._guest_photo_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from projects p
    where p.share_enabled
      and p.id::text = split_part(p_name, '/', 1)
      and _h(p.share_token::text) = split_part(p_name, '/', 2)
  )
$$;

create or replace function public._owner_photo_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from projects p where p.owner_id = auth.uid() and p.id::text = split_part(p_name, '/', 1))
$$;

-- Un client només pot esborrar un fitxer que ja no surt a cap punt (la fila s'esborra abans amb delete_photo,
-- que comprova de qui és). Així ningú amb l'enllaç pot esborrar les fotos d'un altre.
create or replace function public._guest_photo_del_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select _guest_photo_ok(p_name) and not exists (select 1 from photos ph where ph.path = p_name)
$$;

-- Format del nom i màxim de fitxers per obra (contra qui volgués omplir el magatzem).
create or replace function public._photo_upload_ok(p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if p_name !~ '^[0-9a-f-]{36}/(owner|[0-9a-f]{64})/[0-9a-f-]{36}/[0-9]{10,16}-[a-z0-9]{4,16}\.(jpg|png|webp|gif)$' then
    return false;
  end if;
  begin
    select count(*) into n from storage.objects o
    where o.bucket_id = 'photos' and o.name like split_part(p_name, '/', 1) || '/%';
  exception when others then
    n := 0;
  end;
  return n < 3000;
end $$;

drop policy if exists photos_owner_insert on storage.objects;
drop policy if exists photos_owner_delete on storage.objects;
drop policy if exists photos_owner_select on storage.objects;
drop policy if exists photos_guest_insert on storage.objects;
drop policy if exists photos_guest_delete on storage.objects;
drop policy if exists photos_guest_select on storage.objects;

create policy photos_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public._owner_photo_ok(name) and public._photo_upload_ok(name));

create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public._owner_photo_ok(name));

create policy photos_guest_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'photos' and public._guest_photo_ok(name) and public._photo_upload_ok(name));

create policy photos_guest_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'photos' and public._guest_photo_del_ok(name));

-- Supabase demana permís de lectura per poder esborrar fitxers (remove fa DELETE ... RETURNING).
create policy photos_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public._owner_photo_ok(name));

create policy photos_guest_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos' and public._guest_photo_ok(name));

-- ---- permisos d'execució ----
-- Supabase dona permís d'execució per defecte a anon i authenticated: es treu de tot i es dona només el que cal.
revoke all on function public._h(text), public._keyhash(text), public._is_owner(uuid), public._name_ok(uuid, text),
  public._project_of_item(uuid, uuid), public._limits() from public, anon, authenticated;
revoke all on function public.get_board(uuid, uuid, text), public.add_entry(uuid, text, text, uuid, text),
  public.delete_entry(uuid, text, uuid, text), public.add_item(uuid, text, text, text, int, uuid),
  public.add_photo(uuid, text, text, uuid, text), public.delete_photo(uuid, text, uuid, text),
  public.set_flag(uuid, boolean, text, uuid), public.set_status(uuid, text, text, uuid),
  public._guest_photo_ok(text), public._owner_photo_ok(text), public._guest_photo_del_ok(text),
  public._photo_upload_ok(text) from public, anon, authenticated;
grant execute on function public.get_board(uuid, uuid, text), public.add_entry(uuid, text, text, uuid, text),
  public.delete_entry(uuid, text, uuid, text), public.add_item(uuid, text, text, text, int, uuid),
  public.add_photo(uuid, text, text, uuid, text), public.delete_photo(uuid, text, uuid, text),
  public.set_flag(uuid, boolean, text, uuid), public.set_status(uuid, text, text, uuid),
  public._guest_photo_ok(text), public._guest_photo_del_ok(text), public._photo_upload_ok(text) to anon, authenticated;
grant execute on function public._owner_photo_ok(text) to authenticated;
