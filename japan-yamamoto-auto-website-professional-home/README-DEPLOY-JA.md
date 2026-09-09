# 株式会社 山本オート — Production deployment

このフォルダは、Cloudflare Workers + D1 + R2 で本番運用するための構成です。

## 1. GitHub
GitHub の `NawodyaSRajapaksha/sample` リポジトリ内で、このプロジェクトフォルダを使用します。
推奨フォルダ名：`japan-yamamoto-auto-website-professional-home`

## 2. Cloudflare D1
既に作成済みの D1：`yamamoto-auto-db`

Wrangler 設定には既存の database ID が入っています。

## 3. Cloudflare R2（必須）
Cloudflare Dashboard → R2 Object Storage → Create bucket

Bucket name:
`yamamoto-auto-images`

作成後、Worker の R2 binding を追加します。
Binding name:
`IMAGES`
Bucket:
`yamamoto-auto-images`

## 4. D1 binding
Worker → Settings → Bindings → Add binding → D1 database

Variable name:
`DB`

Database:
`yamamoto-auto-db`

## 5. 初回設定キー
Worker → Settings → Variables and Secrets → Add → Secret

Name:
`SETUP_TOKEN`

Value:
自分で作る長くランダムな文字列（12文字以上推奨）。この値は GitHub に入れないでください。

## 6. GitHub Build settings
Production branch:
`main`

Root directory:
`japan-yamamoto-auto-website-professional-home`

Build command:
空欄

Deploy command:
`npx wrangler d1 migrations apply yamamoto-auto-db --remote && npx wrangler deploy`

Version command:
`npx wrangler versions upload`

## 7. 初回デプロイ後
`/admin` を開き、「初回設定・管理者アカウント作成」を選択します。

Cloudflare Secret `SETUP_TOKEN` と、2名分の Mail・名前・パスワードを入力します。

パスワードは12文字以上。2名の Mail は別々にしてください。

## 8. 本番でできること
- 管理者2名のみ
- サーバー側でパスワードをPBKDF2-SHA-256でハッシュ化
- HttpOnly + Secure session cookie
- 自分のパスワード変更
- 商品の追加・編集・削除
- 販売中 / 下書き / 売約済み
- YouTube URL
- 価格 / 価格お問い合わせ
- 複数写真をR2へアップロード
- 仕様項目の候補表示
- 商品ページのLINEボタンは商品名を含むメッセージを作成

## 9. 注意
現在の Worker 名は既存URLを維持するため `sample` のままです。

このプロジェクトの `src/index.js` が本番のバックエンドです。`admin.js` にパスワードを保存していません。
Production deployment refresh
