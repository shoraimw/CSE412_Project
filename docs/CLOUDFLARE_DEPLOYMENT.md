# DRIVE Cloudflare production deployment

## Active architecture

- Cloudflare Pages project: `drive-ewu`
- Production site: https://drive-ewu.pages.dev
- GitHub repository: `shoraimw/CSE412_Project`
- Production branch: `main`
- Pages output directory: `frontend`
- API Pages Function: `functions/api/[[path]].js`
- Service binding: `DRIVE_API` → Worker `cse412-project`
- Worker entrypoint: `backend/src/worker.ts`
- Worker configuration: `wrangler.jsonc`
- Database/Auth: Supabase project `CSE412_Project`

## Stale build issue and fix

The previous Pages project watched only selected paths:

- `frontend/*`
- `frontend/css/*`
- `frontend/js/*`
- `functions/api/*`

Backend, database and deployment changes were skipped. The canonical production site could therefore continue serving an older successful deployment.

The Pages project is now configured with `path_includes: ["*"]` and no path exclusions. All commits to `main` trigger a Pages production build.

The new deployment from commit `8e1c67c25b4e863f294dbf065923d00c69ab4aa2` completed successfully and became the canonical deployment.

## Worker deployment

Pages and the API Worker deploy separately. Pages build success does not prove the API Worker was updated.

GitHub Actions workflow `.github/workflows/cloudflare-deploy.yml` deploys the Worker when backend/config files change on `main`. It needs a repository secret:

- Name: `CLOUDFLARE_API_TOKEN`
- Scope: the Cloudflare account hosting `cse412-project`
- Permission: Workers Scripts:Edit

If this secret is absent, the workflow will explicitly warn that Worker deployment was skipped. Do not report the API as deployed based only on a Pages build.

The Worker currently has secret bindings for `SUPABASE_URL` and `SUPABASE_ANON_KEY`; secret values are not displayed or stored in Git.

## Build commands

- Install: `npm install`
- Development: `npm run dev`
- Full Worker build validation: `npm run build`
- Deploy Worker after validation: `npm run deploy`

## Production release checks

1. Confirm the latest Pages deployment is not skipped and has completed all stages.
2. Confirm the Pages canonical deployment commit matches the expected `main` commit.
3. Confirm Worker deployment is updated for backend changes.
4. Confirm Worker secrets exist (never print secret values).
5. Verify `/api/health` and `/api/health/ready`.
6. Verify signup/login, profile, ride, rental, driver, admin, safety and notification workflows.
7. Test cross-user isolation and mobile browser GPS.
8. Inspect Pages and Worker logs for runtime errors.

## Preview

The project currently uses a custom preview-branch allow-list. Production changes must be tested on the production branch only after validation. Do not delete historical deployments until the replacement has been verified.

## Preview and production data boundary

- Cloudflare Pages production deploys from `main`; branch previews are created for the configured preview branches.
- Both Pages production and preview currently use the same `DRIVE_API` service binding to the `cse412-project` Worker and the same Supabase project.
- Therefore, ride bookings, profiles, payment intents and other writes performed from a Pages preview are stored in the connected project database. Do not use real customer data while testing a preview.
- A separate preview Worker and isolated Supabase project are required before previews can be treated as a safe staging environment.
- `.github/workflows/cloudflare-deploy.yml` is the only active production Worker deployment workflow. `.github/workflows/deploy-worker.yml` is retired to prevent duplicate deployments on a `main` push.

