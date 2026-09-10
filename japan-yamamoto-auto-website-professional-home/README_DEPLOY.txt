YAMAMOTO AUTO — CLOUDFLARE DEPLOYMENT

This build uses Cloudflare Workers + D1.

Wrangler config:
- Worker name: yamamoto-auto
- D1 database: yamamoto-auto-db
- D1 ID: ebd61331-322e-4aa0-983d-63ee9e201dd7

Deploy command:
npx wrangler d1 migrations apply yamamoto-auto-db --remote && npx wrangler deploy

Important:
1. Run the deploy from the repository root containing wrangler.jsonc.
2. After deploy, test: /api/health
3. Then open /admin and log in with an admin account seeded by the Worker.

The v2 auth/catalog tables deliberately use new names so an older D1 schema cannot break the login flow.
The current preview admin accounts are still the two accounts in src/worker.js; replace these with production credentials before launch.
