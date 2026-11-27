# Vercel configuration — future migration only

DRIVE is currently deployed on Cloudflare Pages + Workers. No Vercel project is currently linked to `shoraimw/CSE412_Project`.

The root `vercel.json` and `api/[...path].js` adapter are retained as an optional future hosting configuration. They are not the active production deployment.

A Vercel team-access approval is required before a Vercel project can be created or connected. Do not switch production traffic, remove Cloudflare bindings, or claim a Vercel release until:

1. The owner approves the Vercel team access request.
2. A Vercel project is linked to the repository and `main`.
3. Required Supabase environment variables are configured.
4. A Preview build and API smoke test pass.
5. A production deployment is verified.
6. Domain and rollback behavior are tested.

See [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) for the active hosting decision.
