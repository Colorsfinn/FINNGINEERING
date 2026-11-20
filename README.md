admin.html "is where new project info is created pdf is uploaded qr is added
verify.html "is when someone scans the qr code it verify the record "VERIFIED" or "NOT Verified"

## Supabase deployment

- Configure Supabase Auth to send email sign-in links. Allow redirects to the deployed
  `admin.html` and `verify.html?admin=1` URLs. For the default GitHub Pages deployment,
  the base URL is `https://colorsfinn.github.io/FINNGINEERING/`.
- Review existing grants, views, functions, and bucket policies for alternate paths to
  project data. Apply the SQL migration from a privileged Supabase session. Before
  the migration's final `commit`, seed the initial accounts in the same transaction:
  `insert into public.fin_admins (email) values ('first-admin@example.com'), ('second-admin@example.com') on conflict do nothing;`
  Substitute the two approved email addresses. Keep real addresses out of the public repository.
- Coordinate the migration and site deployment. Older site code depends on public
  reads and will stop working once the migration takes effect.
- Test an existing QR link with a signed-out browser. It should show only a
  verification status. Test an invalid QR, direct project and PDF access while signed
  out, both initial admin logins, granting another admin, and upload and PDF access
  from the signed-in admin pages.
