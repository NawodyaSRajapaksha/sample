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

認証・商品管理には独立したD1テーブルを使用しています。
管理者アカウントは src/worker.js の初期設定です。公開前に実運用用の管理者アカウントへ変更してください。


このフォルダ名は japan-yamamoto-auto-website-professional-home のままで使用できます。
