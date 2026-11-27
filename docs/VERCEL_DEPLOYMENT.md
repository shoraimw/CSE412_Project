# DRIVE Vercel deployment

## Project settings

Connect the GitHub repository:

`shoraimw/CSE412_Project`

Use these settings:

| Setting | Value |
|---|---|
| Production Branch | `main` |
| Root Directory | `./` (repository root) |
| Framework Preset | `Other` |
| Build Command | `cd backend && npm install && npm run build` |
| Output Directory | `frontend` |
| Node.js | 22.x |
| API entrypoint | `api/[...path].js` |

The checked-in `vercel.json` is the configuration source of truth for the build command, output directory and serverless function bundle.

Do not set the Root Directory to `backend`: the frontend, API gateway and Vercel configuration live at repository root.

## Environment variables

Add the following variables in Vercel → Project Settings → Environment Variables:

| Name | Value |
|---|---|
| `SUPABASE_URL` | The DRIVE Supabase project URL |
| `SUPABASE_ANON_KEY` | The Supabase publishable key (or legacy anon key) |

Configure the variables for Preview and Production. Development may also be configured if using Vercel's development environment.

Never add a Supabase service-role key to browser-exposed variables or frontend source.

For stronger isolation, use a separate Supabase development project for Preview. Until that exists, do not run destructive tests or test-data cleanup against the production database.

## Deployment behavior

- A push to `main` may trigger a Production deployment.
- Pull Requests should use Vercel Preview deployments when PR workflow is used.
- Do not call a deployment production-ready merely because the build succeeded.
- Verify the deployment URL and API endpoints after each first deployment.

## Smoke tests

After deployment, verify:

1. `/` loads the DRIVE landing page and its CSS/JavaScript assets.
2. `/api/health` returns HTTP 200.
3. `/api/health/ready` returns ready only when both Supabase Auth and the DRIVE `profiles` table are reachable.
4. Authentication routes return expected validation errors for invalid requests.
5. No service-role key appears in downloaded frontend assets.
6. Browser console and Vercel function logs contain no unhandled startup errors.

## Rollback

Use Vercel's deployment rollback/promote controls if a release breaks the application. Do not reset Git history or force-push `main` to roll back a deployment.
