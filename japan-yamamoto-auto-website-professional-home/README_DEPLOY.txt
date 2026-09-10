Cloudflare deployment package for 株式会社 山本オート

Database:
- Name: yamamoto-auto-db
- ID: ebd61331-322e-4aa0-983d-63ee9e201dd7

Deploy command:
npx wrangler d1 migrations apply yamamoto-auto-db --remote && npx wrangler deploy

The package includes:
- wrangler.jsonc
- src/worker.js
- migrations/0001_yamamoto.sql
- public/ (website)

Admin bootstrap accounts currently seeded on first API request:
admin1@example.jp / Preview123!
admin2@example.jp / Preview456!

For production, change these credentials before public launch.
