const SESSION_COOKIE = "yamamoto_admin_session";
const SESSION_TTL = 60 * 60 * 24 * 7;
const DEFAULT_LINE_ID = "yamamotoauto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function nowIso() { return new Date().toISOString(); }

function getCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

async function pbkdf2(password, salt, iterations = 120000) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function productView(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category || "ミニショベル",
    description: row.description || "",
    videoUrl: row.video_url || "",
    priceMode: row.price_mode || "contact",
    price: row.price || "",
    status: row.status || "draft",
    featured: Boolean(row.featured),
    images: parseJson(row.images_json, []),
    specs: parseJson(row.specs_json, []),
    lineId: row.line_id || DEFAULT_LINE_ID,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getProduct(env, id, includeDraft = false) {
  const row = await env.DB.prepare("SELECT * FROM yamamoto_products_v2 WHERE id=?").bind(id).first();
  if (!row || (!includeDraft && !["published", "sold"].includes(row.status))) return null;
  return productView(row);
}

async function listProducts(env, includeDraft = false) {
  const sql = includeDraft
    ? "SELECT * FROM yamamoto_products_v2 ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'sold' THEN 2 ELSE 9 END, updated_at DESC"
    : "SELECT * FROM yamamoto_products_v2 WHERE status IN ('published','sold') ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'sold' THEN 1 ELSE 9 END, updated_at DESC";
  const { results } = await env.DB.prepare(sql).all();
  return (results || []).map(productView);
}

async function verifyAdmin(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT a.email,a.email AS name,s.expires_at FROM yamamoto_sessions_v2 s JOIN yamamoto_admins_v2 a ON a.email=s.email WHERE s.token=? AND s.expires_at>?"
  ).bind(tokenHash, Date.now()).first();
  return row || null;
}

async function requireAdmin(request, env) {
  const admin = await verifyAdmin(request, env);
  return admin ? { admin } : { response: json({ error: "ログインが必要です。" }, 401) };
}

function slugify(title) {
  const s = String(title || "machine").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return (s || "machine") + "-" + Date.now().toString(36);
}

function payload(body) {
  body = body || {};
  return {
    title: String(body.title || "").trim(),
    category: String(body.category || "ミニショベル").trim() || "ミニショベル",
    description: String(body.description || "").trim(),
    videoUrl: String(body.videoUrl || "").trim(),
    priceMode: ["show", "contact"].includes(body.priceMode) ? body.priceMode : "contact",
    price: String(body.price || "").trim(),
    status: ["published", "draft", "sold"].includes(body.status) ? body.status : "draft",
    featured: Boolean(body.featured),
    images: Array.isArray(body.images) ? body.images.filter(x => typeof x === "string").slice(0, 20) : [],
    specs: Array.isArray(body.specs)
      ? body.specs.filter(x => x && x.key).slice(0, 40).map(x => ({ key: String(x.key).trim(), value: String(x.value || "").trim() })).filter(x => x.key)
      : [],
    lineId: String(body.lineId || DEFAULT_LINE_ID).trim() || DEFAULT_LINE_ID,
  };
}

async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "メールアドレスとパスワードを入力してください。" }, 400);

  const admin = await env.DB.prepare("SELECT email,password_hash,salt FROM yamamoto_admins_v2 WHERE lower(email)=? LIMIT 1").bind(email).first();
  if (!admin) return json({ error: "メールアドレスまたはパスワードが正しくありません。" }, 401);
  if (await pbkdf2(password, admin.salt) !== admin.password_hash) {
    return json({ error: "パスワードが正しくありません。もう一度入力してください。" }, 401);
  }

  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const tokenHash = await sha256(token);
  const expires = Date.now() + SESSION_TTL * 1000;
  await env.DB.prepare("INSERT OR REPLACE INTO yamamoto_sessions_v2(token,email,expires_at,created_at) VALUES(?,?,?,?)")
    .bind(tokenHash, admin.email, expires, nowIso()).run();

  return json({ email: admin.email, name: admin.email }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`
  });
}

async function saveAccounts(request, env) {
  const body = await request.json().catch(() => ({}));
  const accounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 2) : [];
  if (accounts.length !== 2) return json({ error: "管理者アカウントは2件入力してください。" }, 400);

  const emails = accounts.map(x => String(x.email || "").trim().toLowerCase());
  if (!emails[0] || !emails[1] || emails[0] === emails[1]) {
    return json({ error: "2つの異なるメールアドレスを入力してください。" }, 400);
  }

  const existing = await env.DB.prepare("SELECT email FROM yamamoto_admins_v2 ORDER BY created_at LIMIT 2").all();
  const rows = existing.results || [];

  for (let i = 0; i < 2; i++) {
    const password = String(accounts[i].password || "");
    const old = rows[i];
    if (old && !password) {
      await env.DB.prepare("UPDATE yamamoto_admins_v2 SET email=? WHERE email=?").bind(emails[i], old.email).run();
      await env.DB.prepare("UPDATE yamamoto_sessions_v2 SET email=? WHERE email=?").bind(emails[i], old.email).run();
      continue;
    }
    if (password.length < 12) return json({ error: `管理者${i + 1}のパスワードは12文字以上にしてください。` }, 400);
    const salt = crypto.randomUUID();
    const hash = await pbkdf2(password, salt);
    if (old) {
      await env.DB.prepare("UPDATE yamamoto_admins_v2 SET email=?,password_hash=?,salt=? WHERE email=?")
        .bind(emails[i], hash, salt, old.email).run();
      await env.DB.prepare("UPDATE yamamoto_sessions_v2 SET email=? WHERE email=?").bind(emails[i], old.email).run();
    } else {
      await env.DB.prepare("INSERT INTO yamamoto_admins_v2(email,password_hash,salt,created_at) VALUES(?,?,?,?)")
        .bind(emails[i], hash, salt, nowIso()).run();
    }
  }
  return json({ ok: true, message: "管理者アカウントを更新しました。" });
}

async function saveProduct(request, env, id = null) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;
  const p = payload(await request.json().catch(() => ({})));
  if (!p.title) return json({ error: "機械タイトルを入力してください。" }, 400);
  const now = nowIso();
  const productId = id || slugify(p.title);

  if (p.featured) await env.DB.prepare("UPDATE yamamoto_products_v2 SET featured=0 WHERE id<>?").bind(productId).run();

  if (id) {
    const exists = await env.DB.prepare("SELECT id FROM yamamoto_products_v2 WHERE id=?").bind(id).first();
    if (!exists) return json({ error: "機械が見つかりません。" }, 404);
    await env.DB.prepare("UPDATE yamamoto_products_v2 SET title=?,category=?,description=?,video_url=?,price_mode=?,price=?,status=?,featured=?,images_json=?,specs_json=?,line_id=?,updated_at=? WHERE id=?")
      .bind(p.title,p.category,p.description,p.videoUrl,p.priceMode,p.price,p.status,p.featured?1:0,JSON.stringify(p.images),JSON.stringify(p.specs),p.lineId,now,id).run();
  } else {
    await env.DB.prepare("INSERT INTO yamamoto_products_v2(id,title,category,description,video_url,price_mode,price,status,featured,images_json,specs_json,line_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(productId,p.title,p.category,p.description,p.videoUrl,p.priceMode,p.price,p.status,p.featured?1:0,JSON.stringify(p.images),JSON.stringify(p.specs),p.lineId,now,now).run();
  }
  return json({ product: await getProduct(env, productId, true) }, id ? 200 : 201);
}

async function upload(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;
  if (!env.IMAGES) return json({ error: "画像ストレージが設定されていません。" }, 500);
  const form = await request.formData();
  const files = form.getAll("images").filter(x => x instanceof File);
  const urls = [];
  for (const file of files.slice(0, 20)) {
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) continue;
    const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const key = `products/${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public,max-age=31536000,immutable" } });
    urls.push(`/media/${encodeURIComponent(key)}`);
  }
  return json({ urls });
}

async function api(request, env, url) {
  const path = url.pathname;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (path === "/api/health") {
    const db = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: db?.ok === 1, database: "connected", storage: Boolean(env.IMAGES) });
  }

  if (path === "/api/login" && request.method === "POST") return login(request, env);
  if (path === "/api/logout" && request.method === "POST") {
    const token = getCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM yamamoto_sessions_v2 WHERE token=?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
  }
  if (path === "/api/admin/me") {
    const a = await verifyAdmin(request, env);
    return a ? json({ email: a.email, name: a.name || a.email }) : json({ error: "ログインが必要です。" }, 401);
  }

  if (path === "/api/setup/admins" && request.method === "POST") return saveAccounts(request, env);
  if (path === "/api/admin/accounts" && request.method === "POST") {
    const auth = await requireAdmin(request, env);
    if (auth.response) return auth.response;
    return saveAccounts(request, env);
  }
  if (path === "/api/admin/accounts/save" && request.method === "POST") {
    const auth = await requireAdmin(request, env);
    if (auth.response) return auth.response;
    return saveAccounts(request, env);
  }

  if (path === "/api/products" && request.method === "GET") return json(await listProducts(env));
  let match = path.match(/^\/api\/products\/([^/]+)$/);
  if (match && request.method === "GET") {
    const p = await getProduct(env, decodeURIComponent(match[1]));
    return p ? json(p) : json({ error: "機械が見つかりません。" }, 404);
  }

  if (path === "/api/admin/products" && request.method === "GET") {
    const auth = await requireAdmin(request, env);
    if (auth.response) return auth.response;
    return json(await listProducts(env, true));
  }
  if (path === "/api/admin/products" && request.method === "POST") return saveProduct(request, env);
  if (path === "/api/admin/upload" && request.method === "POST") return upload(request, env);

  match = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (request.method === "PUT") return saveProduct(request, env, id);
    if (request.method === "DELETE") {
      const auth = await requireAdmin(request, env);
      if (auth.response) return auth.response;
      const result = await env.DB.prepare("DELETE FROM yamamoto_products_v2 WHERE id=?").bind(id).run();
      return result.meta?.changes ? json({ ok: true }) : json({ error: "機械が見つかりません。" }, 404);
    }
  }

  return json({ error: "Not Found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/media/") && env.IMAGES) {
        const key = decodeURIComponent(url.pathname.slice(7));
        const object = await env.IMAGES.get(key);
        if (!object) return new Response("Not Found", { status: 404 });
        return new Response(object.body, { headers: {
          "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
          "Cache-Control": "public,max-age=31536000,immutable"
        }});
      }
      if (url.pathname.startsWith("/api/")) return await api(request, env, url);
      const routes = { "/": "/index.html", "/products": "/products.html", "/product": "/product.html", "/admin": "/admin.html" };
      return env.ASSETS.fetch(new Request(new URL(routes[url.pathname] || url.pathname, url), request));
    } catch (error) {
      console.error("Worker error:", error);
      return json({ error: "サーバー側でエラーが発生しました。" }, 500);
    }
  }
};
