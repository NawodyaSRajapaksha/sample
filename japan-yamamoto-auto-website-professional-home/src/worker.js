const SESSION_COOKIE = "yamamoto_admin_session_v2";
const SESSION_TTL = 60 * 60 * 24;
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

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function nowIso() { return new Date().toISOString(); }

function normalizeProduct(row) {
  if (!row) return null;
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

function slugify(title) {
  const ascii = String(title || "machine")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (ascii || "machine") + "-" + Date.now().toString(36);
}

function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// PBKDF2 verifier. Passwords are stored only as salted hashes in D1.
async function pbkdf2Hex(password, salt, iterations = 120000) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyAdmin(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    "SELECT s.email, s.expires_at FROM yamamoto_sessions_v2 s WHERE s.token = ?"
  ).bind(token).first();
  if (!row || Number(row.expires_at) <= Math.floor(Date.now() / 1000)) return null;
  const admin = await env.DB.prepare("SELECT email FROM yamamoto_admins_v2 WHERE email = ?").bind(row.email).first();
  return admin || null;
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "メールアドレスまたはパスワードが正しくありません。" }, 401);

  const admin = await env.DB.prepare("SELECT email, password_hash, salt FROM yamamoto_admins_v2 WHERE lower(email)=? LIMIT 1")
    .bind(email).first();
  if (!admin) return json({ error: "メールアドレスまたはパスワードが正しくありません。" }, 401);

  const hash = await pbkdf2Hex(password, admin.salt);
  if (hash !== admin.password_hash) return json({ error: "パスワードが正しくありません。もう一度入力してください。" }, 401);

  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const now = Math.floor(Date.now() / 1000);
  const expires = now + SESSION_TTL;
  await env.DB.prepare(
    "INSERT INTO yamamoto_sessions_v2(token,email,expires_at,created_at) VALUES (?,?,?,?)"
  ).bind(token, admin.email, expires, nowIso()).run();

  return json({ email: admin.email }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
  });
}

async function ensureBootstrapAdmins(env) {
  // Existing preview credentials are seeded only as salted hashes in D1.
  // Change these two passwords after connecting the site to a production account.
  const accounts = [
    ["admin1@example.jp", "Preview123!"],
    ["admin2@example.jp", "Preview456!"]
  ];
  for (const [email, password] of accounts) {
    const exists = await env.DB.prepare("SELECT email FROM yamamoto_admins_v2 WHERE email=?").bind(email).first();
    if (exists) continue;
    const salt = crypto.randomUUID();
    const hash = await pbkdf2Hex(password, salt);
    await env.DB.prepare(
      "INSERT INTO yamamoto_admins_v2(email,password_hash,salt,created_at) VALUES (?,?,?,?)"
    ).bind(email, hash, salt, nowIso()).run();
  }
}

async function listProducts(env, includeDraft = false) {
  const sql = includeDraft
    ? "SELECT * FROM yamamoto_products_v2 ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'sold' THEN 2 ELSE 9 END, updated_at DESC"
    : "SELECT * FROM yamamoto_products_v2 WHERE status IN ('published','sold') ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'sold' THEN 1 ELSE 9 END, updated_at DESC";
  const { results } = await env.DB.prepare(sql).all();
  return results.map(normalizeProduct);
}

async function getProduct(env, id, includeDraft = false) {
  const row = await env.DB.prepare("SELECT * FROM yamamoto_products_v2 WHERE id=?").bind(id).first();
  if (!row) return null;
  const p = normalizeProduct(row);
  if (!includeDraft && !["published", "sold"].includes(p.status)) return null;
  return p;
}

function validStatus(status) { return ["published", "draft", "sold"].includes(status); }
function validPriceMode(mode) { return ["show", "contact"].includes(mode); }

function productPayload(body) {
  const p = body || {};
  const images = Array.isArray(p.images) ? p.images.filter(x => typeof x === "string").slice(0, 12) : [];
  const specs = Array.isArray(p.specs) ? p.specs.filter(x => x && x.key && x.value).slice(0, 30).map(x => ({ key: String(x.key), value: String(x.value) })) : [];
  return {
    title: String(p.title || "").trim(),
    category: String(p.category || "ミニショベル").trim(),
    description: String(p.description || "").trim(),
    videoUrl: String(p.videoUrl || "").trim(),
    priceMode: validPriceMode(p.priceMode) ? p.priceMode : "contact",
    price: String(p.price || "").trim(),
    status: validStatus(p.status) ? p.status : "draft",
    featured: Boolean(p.featured),
    images,
    specs,
    lineId: String(p.lineId || DEFAULT_LINE_ID).trim() || DEFAULT_LINE_ID,
  };
}

async function createProduct(request, env) {
  const admin = await verifyAdmin(request, env);
  if (!admin) return json({ error: "ログインが必要です。" }, 401);
  const body = productPayload(await request.json().catch(() => ({})));
  if (!body.title) return json({ error: "機械タイトルを入力してください。" }, 400);
  const id = slugify(body.title);
  const now = nowIso();
  if (body.featured) await env.DB.prepare("UPDATE yamamoto_products_v2 SET featured=0 WHERE featured=1").run();
  await env.DB.prepare(`
    INSERT INTO yamamoto_products_v2
    (id,title,category,description,video_url,price_mode,price,status,featured,images_json,specs_json,line_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(id, body.title, body.category, body.description, body.videoUrl, body.priceMode, body.price,
    body.status, body.featured ? 1 : 0, JSON.stringify(body.images), JSON.stringify(body.specs), body.lineId, now, now).run();
  return json({ product: await getProduct(env, id, true) }, 201);
}

async function updateProduct(request, env, id) {
  const admin = await verifyAdmin(request, env);
  if (!admin) return json({ error: "ログインが必要です。" }, 401);
  const existing = await getProduct(env, id, true);
  if (!existing) return json({ error: "機械が見つかりません。" }, 404);
  const body = productPayload(await request.json().catch(() => ({})));
  if (!body.title) return json({ error: "機械タイトルを入力してください。" }, 400);
  if (body.featured) await env.DB.prepare("UPDATE yamamoto_products_v2 SET featured=0 WHERE featured=1 AND id<>?").bind(id).run();
  const now = nowIso();
  await env.DB.prepare(`
    UPDATE yamamoto_products_v2 SET title=?,category=?,description=?,video_url=?,price_mode=?,price=?,status=?,featured=?,images_json=?,specs_json=?,line_id=?,updated_at=? WHERE id=?
  `).bind(body.title, body.category, body.description, body.videoUrl, body.priceMode, body.price, body.status,
    body.featured ? 1 : 0, JSON.stringify(body.images), JSON.stringify(body.specs), body.lineId, now, id).run();
  return json({ product: await getProduct(env, id, true) });
}

async function deleteProduct(request, env, id) {
  const admin = await verifyAdmin(request, env);
  if (!admin) return json({ error: "ログインが必要です。" }, 401);
  const result = await env.DB.prepare("DELETE FROM yamamoto_products_v2 WHERE id=?").bind(id).run();
  if (!result.meta?.changes) return json({ error: "機械が見つかりません。" }, 404);
  return json({ ok: true });
}

async function handleApi(request, env, url) {
  await ensureBootstrapAdmins(env);
  const path = url.pathname;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (path === "/api/health" && request.method === "GET") {
    try {
      const row = await env.DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: row?.ok === 1, database: "connected", version: "v2" });
    } catch (err) {
      console.error("DB health check failed", err);
      return json({ ok: false, database: "error" }, 500);
    }
  }

  if (path === "/api/login" && request.method === "POST") return handleLogin(request, env);
  if (path === "/api/logout" && request.method === "POST") {
    const token = getCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM yamamoto_sessions_v2 WHERE token=?").bind(token).run();
    return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
  }
  if (path === "/api/admin/me" && request.method === "GET") {
    const admin = await verifyAdmin(request, env);
    return admin ? json({ email: admin.email }) : json({ error: "ログインが必要です。" }, 401);
  }
  if (path === "/api/products" && request.method === "GET") return json(await listProducts(env, false));

  const publicMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (publicMatch && request.method === "GET") {
    const p = await getProduct(env, decodeURIComponent(publicMatch[1]), false);
    return p ? json(p) : json({ error: "機械が見つかりません。" }, 404);
  }

  if (path === "/api/admin/products" && request.method === "GET") {
    const admin = await verifyAdmin(request, env);
    if (!admin) return json({ error: "ログインが必要です。" }, 401);
    return json(await listProducts(env, true));
  }
  if (path === "/api/admin/products" && request.method === "POST") return createProduct(request, env);
  if (path === "/api/admin/upload" && request.method === "POST") {
    // Images are stored as data URLs by the front-end fallback until R2 is configured.
    return json({ error: "画像ストレージは未設定です。" }, 501);
  }
  const adminMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (adminMatch) {
    const id = decodeURIComponent(adminMatch[1]);
    if (request.method === "PUT") return updateProduct(request, env, id);
    if (request.method === "DELETE") return deleteProduct(request, env, id);
  }

  return json({ error: "Not Found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(err);
        return json({ error: "サーバー側でエラーが発生しました。" }, 500);
      }
    }

    // Friendly routes used by the public site.
    const routeMap = {
      "/": "/index.html",
      "/products": "/products.html",
      "/product": "/product.html",
      "/admin": "/admin.html",
    };
    if (routeMap[url.pathname]) {
      const rewritten = new Request(new URL(routeMap[url.pathname], url), request);
      return env.ASSETS.fetch(rewritten);
    }
    return env.ASSETS.fetch(request);
  }
};
