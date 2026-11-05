-- Seguiment d'obra: base de dades per a Supabase.
-- Enganxa tot aquest fitxer a Supabase > SQL Editor > New query i prem Run. Es pot executar una sola vegada.

-- ============ TAULES ============
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name    text not null check (char_length(btrim(owner_name)) between 1 and 40),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  client_name   text not null default '' check (char_length(client_name) <= 80),
  share_token   uuid not null default gen_random_uuid(),
  share_enabled boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index projects_share_token_idx on public.projects (share_token);
create index projects_owner_idx on public.projects (owner_id);

-- status: done = resolt, client = pendent del client, pro = pendent del professional, open = sense resposta, info = informatiu
create table public.items (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section    text not null check (char_length(btrim(section)) between 1 and 80),
  position   int  not null default 0,
  title      text not null check (char_length(btrim(title)) between 1 and 120),
  question   text not null default '' check (char_length(question) <= 4000),
  answer     text not null default '' check (char_length(answer) <= 4000),
  next_step  text not null default '' check (char_length(next_step) <= 500),
  todo       text not null default '' check (char_length(todo) <= 300),
  status     text not null default 'client' check (status in ('done','client','pro','open','info')),
  status_by  text,
  status_at  timestamptz,
  flag       boolean not null default false,
  flag_by    text,
  flag_at    timestamptz,
  created_at timestamptz not null default now()
);
create index items_project_idx on public.items (project_id, position);

create table public.entries (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author     text not null check (char_length(btrim(author)) between 1 and 40),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index entries_project_idx on public.entries (project_id, created_at);

create table public.photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author     text not null check (char_length(btrim(author)) between 1 and 40),
  path       text not null,
  created_at timestamptz not null default now()
);
create index photos_project_idx on public.photos (project_id, created_at);

-- ============ SEGURETAT PER FILES ============
alter table public.projects enable row level security;
alter table public.items    enable row level security;
alter table public.entries  enable row level security;
alter table public.photos   enable row level security;

revoke all on public.projects, public.items, public.entries, public.photos from anon;
revoke all on public.projects, public.items, public.entries, public.photos from authenticated;
grant select, insert, update, delete on public.projects, public.items to authenticated;
grant select on public.entries, public.photos to authenticated;

create policy projects_owner on public.projects
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy items_owner on public.items
  for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy entries_owner_read on public.entries
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy photos_owner_read on public.photos
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

-- ============ FUNCIONS (les que fan servir els clients amb enllaç, sense compte) ============
create or replace function public._project_of_item(p_item uuid, p_token uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select i.project_id
  from items i join projects p on p.id = i.project_id
  where i.id = p_item
    and (p.owner_id = auth.uid()
         or (p_token is not null and p.share_enabled and p.share_token = p_token))
$$;

create or replace function public.get_board(p_project uuid default null, p_token uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v projects%rowtype;
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
                                                             'body', e.body, 'created_at', e.created_at) order by e.created_at)
                         from entries e where e.project_id = v.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'item_id', ph.item_id, 'author', ph.author,
                                                            'path', ph.path, 'created_at', ph.created_at) order by ph.created_at)
                        from photos ph where ph.project_id = v.id), '[]'::jsonb)
  );
end $$;

create or replace function public.add_entry(p_item uuid, p_author text, p_body text, p_token uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_id uuid;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into entries (item_id, project_id, author, body)
  values (p_item, v_project, btrim(p_author), btrim(p_body)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_entry(p_entry uuid, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from entries e using projects p
  where e.id = p_entry and p.id = e.project_id
    and lower(e.author) = lower(btrim(p_author))
    and (p.owner_id = auth.uid() or (p_token is not null and p.share_enabled and p.share_token = p_token));
end $$;

create or replace function public.add_photo(p_item uuid, p_author text, p_path text, p_token uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_id uuid;
begin
  v_project := _project_of_item(p_item, p_token);
  if v_project is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into photos (item_id, project_id, author, path)
  values (p_item, v_project, btrim(p_author), p_path) returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_photo(p_photo uuid, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from photos ph using projects p
  where ph.id = p_photo and p.id = ph.project_id
    and lower(ph.author) = lower(btrim(p_author))
    and (p.owner_id = auth.uid() or (p_token is not null and p.share_enabled and p.share_token = p_token));
end $$;

create or replace function public.set_flag(p_item uuid, p_flag boolean, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _project_of_item(p_item, p_token) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(btrim(p_author)) not between 1 and 40 then raise exception 'bad_author'; end if;
  update items set flag = p_flag, flag_by = btrim(p_author), flag_at = now() where id = p_item;
end $$;

create or replace function public.set_status(p_item uuid, p_status text, p_author text, p_token uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _project_of_item(p_item, p_token) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if char_length(btrim(p_author)) not between 1 and 40 then raise exception 'bad_author'; end if;
  update items set status = p_status, status_by = btrim(p_author), status_at = now() where id = p_item;
end $$;

revoke all on function public._project_of_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_board(uuid, uuid) from public;
revoke all on function public.add_entry(uuid, text, text, uuid) from public;
revoke all on function public.delete_entry(uuid, text, uuid) from public;
revoke all on function public.add_photo(uuid, text, text, uuid) from public;
revoke all on function public.delete_photo(uuid, text, uuid) from public;
revoke all on function public.set_flag(uuid, boolean, text, uuid) from public;
revoke all on function public.set_status(uuid, text, text, uuid) from public;
grant execute on function public.get_board(uuid, uuid) to anon, authenticated;
grant execute on function public.add_entry(uuid, text, text, uuid) to anon, authenticated;
grant execute on function public.delete_entry(uuid, text, uuid) to anon, authenticated;
grant execute on function public.add_photo(uuid, text, text, uuid) to anon, authenticated;
grant execute on function public.delete_photo(uuid, text, uuid) to anon, authenticated;
grant execute on function public.set_flag(uuid, boolean, text, uuid) to anon, authenticated;
grant execute on function public.set_status(uuid, text, text, uuid) to anon, authenticated;

-- ============ FOTOS: MAGATZEM (storage) ============
-- Les fotos es pujen directament des del navegador a aquest bucket. És públic només per a lectura
-- (igual que l'enllaç de l'obra: qui en sap la ruta hi pot entrar), i les rutes inclouen l'identificador
-- de l'obra i el seu token, així que cal conèixer-los per poder pujar-hi res.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1])
  );

create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1])
  );

create policy photos_guest_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'photos'
    and exists (select 1 from public.projects p where p.share_enabled
                and p.id::text = (storage.foldername(name))[1] and p.share_token::text = (storage.foldername(name))[2])
  );

create policy photos_guest_delete on storage.objects
  for delete to anon
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.projects p where p.share_enabled
                and p.id::text = (storage.foldername(name))[1] and p.share_token::text = (storage.foldername(name))[2])
  );
