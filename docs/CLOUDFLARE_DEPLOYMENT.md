# Archived deployment notes — Cloudflare

Cloudflare Pages and the DRIVE Worker were used by an earlier deployment iteration. They are not the selected target for the current Vercel-first release.

- Historical Pages project: `drive-ewu` (repository: `shoraimw/CSE412_Project`, production branch: `main`).
- Historical Worker: `cse412-project`.
- Historical Pages API adapter: `functions/api/[[path]].js`.
- Current application host: Vercel.
- Current application database/auth: Supabase project `CSE412_Project`.

Do not run `wrangler deploy` as part of the current release. Do not delete the historical Cloudflare project or Worker until the Vercel deployment is verified and any required redirect/domain transition has been tested.

The old Cloudflare Pages project used path-based build filters. Commits that changed only backend or deployment files could be marked skipped, leaving an older successful frontend deployment as the canonical `drive-ewu.pages.dev` site. This is a known historical stale-deployment cause; the Vercel release uses explicit no-cache response headers and a single GitHub validation workflow.
