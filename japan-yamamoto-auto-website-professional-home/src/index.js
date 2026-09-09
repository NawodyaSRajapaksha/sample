const SESSION_COOKIE = "yamamoto_session";
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 310000;
const LINE_ID = "yamamotoauto";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra }
  });
}

function nowIso() { return new Date().toISOString(); }

function base64url(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

async function sha256Bytes(value) {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, 256);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${base64url(salt)}$${base64url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iterText, saltText, hashText] = String(stored).split("$");
    if (scheme !== "pbkdf2-sha256") return false;
    const iterations = Number(iterText);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
    const salt = fromBase64url(saltText);
    const expected = fromBase64url(hashText);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" }, key, expected.length * 8);
    return timingSafeEqual(new Uint8Array(bits), expected);
  } catch { return false; }
}

function cookieOptions(maxAge = SESSION_DAYS * 86400) {
  return `Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function parseCookies(request) {
  const raw = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function slugId(title) {
  const ascii = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (ascii || "machine") + "-" + crypto.randomUUID().slice(0, 8);
}

function normalizeProduct(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    videoUrl: row.video_url,
    priceMode: row.price_mode,
    price: row.price,
    status: row.status,
    images: safeJson(row.images_json, []),
    specs: safeJson(row.specs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }

async function getProduct(db, id, includeDraft = false) {
  const row = await db.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!row || (!includeDraft && !["published", "sold"].includes(row.status))) return null;
  return normalizeProduct(row);
}

async function getAdmin(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const hash = base64url(await sha256Bytes(token));
  const row = await env.DB.prepare(`SELECT a.id,a.email,a.name FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>?`).bind(hash, nowIso()).first();
  return row || null;
}

async function requireAdmin(request, env) {
  const admin = await getAdmin(request, env);
  return admin ? { admin } : { response: json({ error: "ログインが必要です。" }, 401) };
}

async function cleanupSessions(env) {
  try { await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(nowIso()).run(); } catch {}
}

async function handleApi(request, env, url) {
  const method = request.method;

  if (url.pathname === "/api/products" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM products WHERE status IN ('published','sold') ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'sold' THEN 1 ELSE 2 END, updated_at DESC").all();
    return json(results.map(normalizeProduct));
  }

  if (url.pathname.startsWith("/api/products/") && method === "GET") {
    const p = await getProduct(env.DB, decodeURIComponent(url.pathname.slice("/api/products/".length)));
    return p ? json(p) : json({ error: "商品が見つかりません。" }, 404);
  }

  if (url.pathname === "/api/login" && method === "POST") {
    await cleanupSessions(env);
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return json({ error: "メールアドレスとパスワードを入力してください。" }, 400);
    const row = await env.DB.prepare("SELECT id,email,name,password_hash FROM admins WHERE lower(email)=?").bind(email).first();
    if (!row || !(await verifyPassword(password, row.password_hash))) return json({ error: "メールアドレスまたはパスワードが正しくありません。" }, 401);
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = base64url(tokenBytes);
    const tokenHash = base64url(await sha256Bytes(token));
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.prepare("INSERT INTO sessions(token_hash,admin_id,expires_at,created_at) VALUES(?,?,?,?)").bind(tokenHash,row.id,expires,nowIso()).run();
    return json({ email: row.email, name: row.name }, 200, { "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions()}` });
  }

  if (url.pathname === "/api/logout" && method === "POST") {
    const token = parseCookies(request)[SESSION_COOKIE];
    if (token) {
      const hash = base64url(await sha256Bytes(token));
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hash).run();
    }
    return json({ ok: true }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; ${cookieOptions(0)}` });
  }

  if (url.pathname === "/api/admin/me" && method === "GET") {
    const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
    return json({ email: auth.admin.email, name: auth.admin.name });
  }

  if (url.pathname === "/api/setup" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const setupToken = String(body.setupToken || body.setup_token || body.setupKey || body.key || "").trim();
    const envToken = String(env.SETUP_TOKEN || "").trim();

    if (!envToken || !setupToken || !timingSafeEqual(new TextEncoder().encode(setupToken), new TextEncoder().encode(envToken))) {
      return json({ error: "初回設定キーが正しくありません。" }, 403);
    }

    const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM admins").first();
    if (Number(countRow?.count || 0) >= 2) return json({ error: "管理者アカウントは2件までです。" }, 409);
    
    const accounts = Array.isArray(body.accounts) ? body.accounts : [];
    if (accounts.length !== 2) return json({ error: "管理者アカウントを2件入力してください。" }, 400);

    const emails = accounts.map(a => String(a.email || "").trim().toLowerCase());
    const names = accounts.map(a => String(a.name || "").trim());
    const passwords = accounts.map(a => String(a.password || ""));

    if (emails.some(e => !/^\S+@\S+\.\S+$/.test(e)) || new Set(emails).size !== 2) return json({ error: "2件のメールアドレスを正しく入力してください。" }, 400);
    if (passwords.some(p => p.length < 12)) return json({ error: "パスワードは12文字以上にしてください。" }, 400);

    const hashes = await Promise.all(passwords.map(hashPassword));
    const batch = accounts.map((_,i) => env.DB.prepare("INSERT INTO admins(email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)").bind(emails[i],names[i],hashes[i],nowIso(),nowIso()));
    try { await env.DB.batch(batch); } catch { return json({ error: "管理者アカウントを作成できませんでした。メールアドレスが既に登録されている可能性があります。" }, 409); }
    return json({ ok: true, message: "管理者アカウントを2件作成しました。" });
  }

  if (url.pathname === "/api/setup/status" && method === "GET") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM admins").first();
    return json({ configured: Number(row?.count || 0) >= 2, count: Number(row?.count || 0) });
  }

  if (url.pathname === "/api/admin/change-password" && method === "POST") {
    const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const current = String(body.currentPassword || "");
    const next = String(body.newPassword || "");
    if (next.length < 12) return json({ error: "新しいパスワードは12文字以上にしてください。" }, 400);
    const row = await env.DB.prepare("SELECT password_hash FROM admins WHERE id=?").bind(auth.admin.id).first();
    if (!row || !(await verifyPassword(current, row.password_hash))) return json({ error: "現在のパスワードが正しくありません。" }, 400);
    const newHash = await hashPassword(next);
    await env.DB.prepare("UPDATE admins SET password_hash=?,updated_at=? WHERE id=?").bind(newHash,nowIso(),auth.admin.id).run();
    return json({ ok: true, message: "パスワードを変更しました。" });
  }

  if (url.pathname === "/api/admin/products" && method === "GET") {
    const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
    const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'sold' THEN 2 ELSE 3 END, updated_at DESC").all();
    return json(results.map(normalizeProduct));
  }

  if (url.pathname === "/api/admin/products" && method === "POST") {
    const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));
    const product = validateProduct(body);
    if (product.error) return json({ error: product.error }, 400);
    const id = slugId(product.title), now = nowIso();
    await env.DB.prepare("INSERT INTO products(id,title,category,description,video_url,price_mode,price,status,images_json,specs_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,product.title,product.category,product.description,product.videoUrl,product.priceMode,product.price,product.status,JSON.stringify(product.images),JSON.stringify(product.specs),now,now).run();
    return json(await getProduct(env.DB,id,true), 201);
  }

  const productMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (productMatch && ["PUT","DELETE"].includes(method)) {
    const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
    const id = decodeURIComponent(productMatch[1]);
    if (method === "DELETE") {
      const existing = await getProduct(env.DB,id,true); if (!existing) return json({error:"商品が見つかりません。"},404);
      await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
      return json({ok:true});
    }
    const body = await request.json().catch(() => ({}));
    const product = validateProduct(body);
    if (product.error) return json({ error: product.error }, 400);
    const now = nowIso();
    await env.DB.prepare("UPDATE products SET title=?,category=?,description=?,video_url=?,price_mode=?,price=?,status=?,images_json=?,specs_json=?,updated_at=? WHERE id=?").bind(product.title,product.category,product.description,product.videoUrl,product.priceMode,product.price,product.status,JSON.stringify(product.images),JSON.stringify(product.specs),now,id).run();
    return json(await getProduct(env.DB,id,true));
  }

  if (url.pathname === "/api/admin/upload" && method === "POST") {
    const auth = await requireAdmin(request, env); if (auth.response) return auth.response;
    if (!env.IMAGES) return json({ error: "画像ストレージがまだ設定されていません。" }, 503);
    const form = await request.formData();
    const files = form.getAll("images").filter(x => x && typeof x.arrayBuffer === "function");
    if (!files.length) return json({error:"画像を選択してください。"},400);
    if (files.length > 10) return json({error:"一度にアップロードできる画像は10枚までです。"},400);
    const urls = [];
    for (const file of files) {
      if (!String(file.type || "").startsWith("image/")) return json({error:"画像ファイルのみアップロードできます。"},400);
      if (file.size > 10 * 1024 * 1024) return json({error:"1枚10MB以下の画像を選択してください。"},400);
      const ext = (String(file.name || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0,6) || "jpg";
      const key = `products/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}.${ext}`;
      await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type || "image/jpeg", cacheControl: "public, max-age=31536000, immutable" } });
      urls.push(`/media/${encodeURIComponent(key).replace(/%2F/g,"/")}`);
    }
    return json({ urls });
  }

  if (url.pathname.startsWith("/api/")) return json({ error: "API endpoint not found." }, 404);
  return null;
}

function validateProduct(body) {
  const title = String(body.title || "").trim();
  if (!title) return { error: "機械タイトルを入力してください。" };
  const category = String(body.category || "ミニショベル").trim();
  const description = String(body.description || "").trim();
  const videoUrl = String(body.videoUrl || "").trim();
  const priceMode = body.priceMode === "show" ? "show" : "contact";
  const price = String(body.price || "").trim();
  const status = ["published","draft","sold"].includes(body.status) ? body.status : "draft";
  const images = Array.isArray(body.images) ? body.images.filter(x => typeof x === "string" && x.length < 2000).slice(0,20) : [];
  const specs = Array.isArray(body.specs) ? body.specs.map(s => ({key:String(s?.key||"").trim(),value:String(s?.value||"").trim()})).filter(s=>s.key&&s.value).slice(0,50) : [];
  return { title,category,description,videoUrl,priceMode,price,status,images,specs };
}

async function mediaResponse(request, env, key) {
  if (!env.IMAGES) return new Response("Not configured", {status:503});
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response("Not found", {status:404});
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, {headers});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (url.pathname.startsWith("/media/")) {
        const key = decodeURIComponent(url.pathname.slice("/media/".length));
        return await mediaResponse(request, env, key);
      }
      if (request.method === "GET") {
        const routeMap = { "/products": "/products.html", "/product": "/product.html", "/admin": "/admin.html" };
        const target = routeMap[url.pathname];
        if (target) return env.ASSETS.fetch(new Request(new URL(target, request.url), request));
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return url.pathname.startsWith("/api/") ? json({error:"サーバーエラーが発生しました。"},500) : new Response("Server error",{status:500});
    }
  }
};
