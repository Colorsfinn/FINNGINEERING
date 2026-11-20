begin;

create or replace function public.fin_verify_pdf(project_code text, pdf_hash text)
returns boolean language sql stable security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.projects p
        where p.id::text = project_code
          and pdf_hash ~ '^[a-f0-9]{64}$'
          and lower(p.hash) = pdf_hash
    );
$$;

revoke all on function public.fin_verify_pdf(text, text) from public, anon, authenticated;
grant execute on function public.fin_verify_pdf(text, text) to anon, authenticated;

-- Cached versions of the verification page must fail closed.
revoke execute on function public.fin_verify_qr(text) from public, anon, authenticated;

commit;
