-- Migració per a bases de dades creades abans del 8/11/2026.
-- Enganxa-la a Supabase > SQL Editor > New query i prem Run. Es pot executar més d'una vegada.

-- 1. El professional pot esborrar qualsevol entrada de les seves obres; el client, només les del seu nom.
create or replace function public.delete_entry(p_entry uuid, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from entries e using projects p
  where e.id = p_entry and p.id = e.project_id
    and (p.owner_id = auth.uid()
         or (lower(e.author) = lower(btrim(p_author))
             and p_token is not null and p.share_enabled and p.share_token = p_token));
end $$;

-- 2. Només s'accepten rutes de foto amb el format esperat.
create or replace function public.add_photo(p_item uuid, p_author text, p_path text, p_token uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_id uuid;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_path !~ ('^' || v_project::text || '/[a-z0-9]{5,64}/' || p_item::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'bad_path';
  end if;
  insert into photos (item_id, project_id, author, path)
  values (p_item, v_project, btrim(p_author), p_path) returning id into v_id;
  return v_id;
end $$;

-- 3. delete_photo retorna la ruta esborrada; el professional pot esborrar qualsevol foto de les seves obres.
drop function if exists public.delete_photo(uuid, text, uuid);
create function public.delete_photo(p_photo uuid, p_author text, p_token uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  delete from photos ph using projects p
  where ph.id = p_photo and p.id = ph.project_id
    and (p.owner_id = auth.uid()
         or (lower(ph.author) = lower(btrim(p_author))
             and p_token is not null and p.share_enabled and p.share_token = p_token))
  returning ph.path into v_path;
  return v_path;
end $$;
revoke all on function public.delete_photo(uuid, text, uuid) from public;
grant execute on function public.delete_photo(uuid, text, uuid) to anon, authenticated;

-- 4. El bucket només accepta imatges de fins a 10 MB.
update storage.buckets
  set file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  where id = 'photos';

-- 5. Pujades del client: la carpeta és el sha256 del token (no el token), i la comprovació
--    es fa en una funció security definer perquè el client sense compte no pot llegir projects.
create or replace function public._guest_photo_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    where p.share_enabled
      and p.id::text = split_part(p_name, '/', 1)
      and encode(sha256(convert_to(p.share_token::text, 'UTF8')), 'hex') = split_part(p_name, '/', 2)
  )
$$;
revoke all on function public._guest_photo_ok(text) from public;
grant execute on function public._guest_photo_ok(text) to anon, authenticated;

-- 6. Pujades del professional: la política antiga comparava amb projects.name (el nom de l'obra)
--    en lloc de la ruta del fitxer, i per tant no deixava pujar res.
create or replace function public._owner_photo_ok(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects p where p.owner_id = auth.uid() and p.id::text = split_part(p_name, '/', 1))
$$;
revoke all on function public._owner_photo_ok(text) from public;
grant execute on function public._owner_photo_ok(text) to authenticated;

drop policy if exists photos_owner_insert on storage.objects;
drop policy if exists photos_owner_delete on storage.objects;
drop policy if exists photos_guest_insert on storage.objects;
drop policy if exists photos_guest_delete on storage.objects;
drop policy if exists photos_owner_select on storage.objects;
drop policy if exists photos_guest_select on storage.objects;

-- Supabase demana permís de lectura per poder esborrar fitxers (remove fa DELETE ... RETURNING).
create policy photos_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public._owner_photo_ok(name));

create policy photos_guest_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'photos' and public._guest_photo_ok(name));

create policy photos_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public._owner_photo_ok(name));

create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public._owner_photo_ok(name));

create policy photos_guest_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'photos' and public._guest_photo_ok(name));

create policy photos_guest_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'photos' and public._guest_photo_ok(name));
