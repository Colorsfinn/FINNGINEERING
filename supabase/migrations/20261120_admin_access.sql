begin;

create table if not exists public.fin_admins (
    email text primary key check (email = lower(trim(email)))
);
alter table public.fin_admins enable row level security;
revoke all on public.fin_admins from public, anon, authenticated;

create or replace function public.fin_is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
    select exists (
        select 1 from auth.users u join public.fin_admins a
            on a.email = lower(u.email)
        where u.id = auth.uid() and u.email_confirmed_at is not null
    );
$$;
revoke all on function public.fin_is_admin() from public, anon;
grant execute on function public.fin_is_admin() to authenticated;

create or replace function public.fin_grant_admin(admin_email text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
    if not public.fin_is_admin() then
        raise exception 'Administrator access required' using errcode = '42501';
    end if;
    if admin_email is null or trim(admin_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'Enter a valid email address';
    end if;
    insert into public.fin_admins(email) values (lower(trim(admin_email)))
    on conflict do nothing;
end;
$$;
revoke all on function public.fin_grant_admin(text) from public, anon;
grant execute on function public.fin_grant_admin(text) to authenticated;

alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select, insert, update on public.projects to authenticated;
drop policy if exists fin_projects_admin_boundary on public.projects;
create policy fin_projects_admin_boundary on public.projects as restrictive
    for all to authenticated using (public.fin_is_admin()) with check (public.fin_is_admin());
drop policy if exists fin_projects_admin_access on public.projects;
create policy fin_projects_admin_access on public.projects
    for all to authenticated using (public.fin_is_admin()) with check (public.fin_is_admin());

create or replace function public.fin_verify_qr(project_code text)
returns boolean language sql stable security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.projects p
        where p.id::text = project_code and p.hash ~ '^[a-fA-F0-9]{64}$'
    );
$$;
revoke all on function public.fin_verify_qr(text) from public;
grant execute on function public.fin_verify_qr(text) to anon, authenticated;

update storage.buckets set public = false where id = 'project-pdfs';
drop policy if exists fin_pdfs_public_boundary on storage.objects;
create policy fin_pdfs_public_boundary on storage.objects as restrictive
    for all to anon using (bucket_id <> 'project-pdfs') with check (bucket_id <> 'project-pdfs');
drop policy if exists fin_pdfs_admin_boundary on storage.objects;
create policy fin_pdfs_admin_boundary on storage.objects as restrictive
    for all to authenticated
    using (bucket_id <> 'project-pdfs' or public.fin_is_admin())
    with check (bucket_id <> 'project-pdfs' or public.fin_is_admin());
drop policy if exists fin_pdfs_admin_read on storage.objects;
create policy fin_pdfs_admin_read on storage.objects for select to authenticated
    using (bucket_id = 'project-pdfs' and public.fin_is_admin());
drop policy if exists fin_pdfs_admin_upload on storage.objects;
create policy fin_pdfs_admin_upload on storage.objects for insert to authenticated
    with check (bucket_id = 'project-pdfs' and public.fin_is_admin());

create table if not exists public.fin_saved_views (
    owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    project_code text not null,
    primary key (owner_id, project_code)
);
alter table public.fin_saved_views enable row level security;
revoke all on public.fin_saved_views from public, anon, authenticated;
grant select, insert, delete on public.fin_saved_views to authenticated;
drop policy if exists fin_saved_views_owner on public.fin_saved_views;
create policy fin_saved_views_owner on public.fin_saved_views
    for all to authenticated
    using (owner_id = auth.uid() and public.fin_is_admin())
    with check (owner_id = auth.uid() and public.fin_is_admin());

commit;
