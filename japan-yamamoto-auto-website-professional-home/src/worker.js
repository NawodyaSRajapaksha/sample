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
function nowIso(){ return new Date().toISOString(); }
function parseJson(v,fallback){ try{return JSON.parse(v)}catch{return fallback} }
function getCookie(request,name){
  const raw=request.headers.get("Cookie")||"";
  for(const part of raw.split(";")){const [k,...rest]=part.trim().split("=");if(k===name)return decodeURIComponent(rest.join("="));}
  return null;
}
function slugify(title){
  const ascii=String(title||"machine").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();
  return (ascii||"machine")+"-"+Date.now().toString(36);
}
async function sha256Bytes(input){return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input)))}
function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function sha256B64(input){return b64(await sha256Bytes(input))}
async function pbkdf2Hex(password,salt,iterations=120000){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations,hash:"SHA-256"},key,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function safeProduct(row, images, specs){
  return {id:row.id,title:row.title,category:row.category||"ミニショベル",description:row.description||"",videoUrl:row.youtube_url||"",priceMode:row.price_type||"contact",price:row.price||"",status:row.status||"draft",featured:Boolean(row.featured),images:images||[],specs:specs||[],lineId:row.line_id||DEFAULT_LINE_ID,createdAt:row.created_at,updatedAt:row.updated_at};
}
async function productWithChildren(env,row){
  const {results:imgs}=await env.DB.prepare("SELECT image_url,is_thumbnail,sort_order FROM product_images WHERE product_id=? ORDER BY sort_order,id").bind(row.id).all();
  const {results:specs}=await env.DB.prepare("SELECT spec_name AS key,spec_value AS value,sort_order FROM product_specs WHERE product_id=? ORDER BY sort_order,id").bind(row.id).all();
  const ordered=(imgs||[]).sort((a,b)=>(Number(b.is_thumbnail)-Number(a.is_thumbnail))||((a.sort_order||0)-(b.sort_order||0))).map(x=>x.image_url);
  return safeProduct(row,ordered,specs||[]);
}
async function verifyAdmin(request,env){
  const token=getCookie(request,SESSION_COOKIE); if(!token)return null;
  const hash=await sha256B64(token);
  const row=await env.DB.prepare("SELECT a.id,a.email,a.name,s.expires_at FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.id=? AND s.expires_at>? ").bind(hash,nowIso()).first();
  return row||null;
}
async function requireAdmin(request,env){const admin=await verifyAdmin(request,env);return admin?{admin}:{response:json({error:"ログインが必要です。"},401)};}
async function handleLogin(request,env){
  const body=await request.json().catch(()=>({}));
  const email=String(body.email||"").trim().toLowerCase(); const password=String(body.password||"");
  if(!email||!password)return json({error:"メールアドレスとパスワードを入力してください。"},400);
  const admin=await env.DB.prepare("SELECT id,email,name,password_hash,salt FROM admins WHERE lower(email)=? LIMIT 1").bind(email).first();
  if(!admin)return json({error:"メールアドレスまたはパスワードが正しくありません。"},401);
  const hash=await pbkdf2Hex(password,admin.salt); if(hash!==admin.password_hash)return json({error:"パスワードが正しくありません。もう一度入力してください。"},401);
  const token=crypto.randomUUID()+crypto.randomUUID().replace(/-/g,""); const tokenHash=await sha256B64(token); const expires=new Date(Date.now()+SESSION_TTL*1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions(id,admin_id,expires_at) VALUES(?,?,?)").bind(tokenHash,admin.id,expires).run();
  return json({email:admin.email,name:admin.name||""},200,{"Set-Cookie":`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`});
}
async function listProducts(env,includeDraft=false){
  const sql=includeDraft?"SELECT * FROM products ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 WHEN 'sold' THEN 2 ELSE 9 END, updated_at DESC":"SELECT * FROM products WHERE status IN ('published','sold') ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'sold' THEN 1 ELSE 9 END, updated_at DESC";
  const {results}=await env.DB.prepare(sql).all(); return Promise.all(results.map(r=>productWithChildren(env,r)));
}
async function getProduct(env,id,includeDraft=false){
  const row=await env.DB.prepare("SELECT * FROM products WHERE id=?").bind(id).first(); if(!row)return null;
  if(!includeDraft&&!['published','sold'].includes(row.status))return null; return productWithChildren(env,row);
}
function productPayload(body){
  const p=body||{}; return {title:String(p.title||"").trim(),category:String(p.category||"ミニショベル").trim(),description:String(p.description||"").trim(),videoUrl:String(p.videoUrl||"").trim(),priceMode:["show","contact"].includes(p.priceMode)?p.priceMode:"contact",price:String(p.price||"").trim(),status:["published","draft","sold"].includes(p.status)?p.status:"draft",featured:Boolean(p.featured),images:Array.isArray(p.images)?p.images.filter(x=>typeof x==="string").slice(0,20):[],specs:Array.isArray(p.specs)?p.specs.filter(x=>x&&x.key).slice(0,40).map(x=>({key:String(x.key).trim(),value:String(x.value||"").trim()})).filter(x=>x.key):[],lineId:String(p.lineId||DEFAULT_LINE_ID).trim()||DEFAULT_LINE_ID};
}
async function replaceChildren(env,id,images,specs){
  await env.DB.prepare("DELETE FROM product_images WHERE product_id=?").bind(id).run();
  await env.DB.prepare("DELETE FROM product_specs WHERE product_id=?").bind(id).run();
  for(let i=0;i<images.length;i++)await env.DB.prepare("INSERT INTO product_images(product_id,image_url,sort_order,is_thumbnail) VALUES(?,?,?,?)").bind(id,images[i],i,i===0?1:0).run();
  for(let i=0;i<specs.length;i++){
    await env.DB.prepare("INSERT OR IGNORE INTO spec_names(name) VALUES(?)").bind(specs[i].key).run();
    await env.DB.prepare("INSERT INTO product_specs(product_id,spec_name,spec_value,sort_order) VALUES(?,?,?,?)").bind(id,specs[i].key,specs[i].value,i).run();
  }
}
async function createProduct(request,env){
  const auth=await requireAdmin(request,env);if(auth.response)return auth.response;
  const p=productPayload(await request.json().catch(()=>({})));if(!p.title)return json({error:"機械タイトルを入力してください。"},400);
  const id=slugify(p.title),now=nowIso();
  if(p.featured)await env.DB.prepare("UPDATE products SET featured=0").run();
  await env.DB.prepare("INSERT INTO products(id,title,description,price,price_type,youtube_url,phone,mail,line_id,status,featured,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,p.title,p.description,p.price,p.priceMode,p.videoUrl,"0544-78-0595","Fujim2021@gmail.com",p.lineId,p.status,p.featured?1:0,now,now).run();
  await replaceChildren(env,id,p.images,p.specs); return json({product:await getProduct(env,id,true)},201);
}
async function updateProduct(request,env,id){
  const auth=await requireAdmin(request,env);if(auth.response)return auth.response;
  const existing=await getProduct(env,id,true);if(!existing)return json({error:"機械が見つかりません。"},404);
  const p=productPayload(await request.json().catch(()=>({})));if(!p.title)return json({error:"機械タイトルを入力してください。"},400);
  if(p.featured)await env.DB.prepare("UPDATE products SET featured=0 WHERE id<>?").bind(id).run();
  const now=nowIso();
  await env.DB.prepare("UPDATE products SET title=?,description=?,price=?,price_type=?,youtube_url=?,line_id=?,status=?,featured=?,updated_at=? WHERE id=?").bind(p.title,p.description,p.price,p.priceMode,p.videoUrl,p.lineId,p.status,p.featured?1:0,now,id).run();
  await replaceChildren(env,id,p.images,p.specs); return json({product:await getProduct(env,id,true)});
}
async function deleteProduct(request,env,id){const auth=await requireAdmin(request,env);if(auth.response)return auth.response;const r=await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();return r.meta?.changes?json({ok:true}):json({error:"機械が見つかりません。"},404)}
async function uploadImages(request,env){
  const auth=await requireAdmin(request,env);if(auth.response)return auth.response;
  if(!env.IMAGES)return json({error:"画像ストレージが設定されていません。"},500);
  const form=await request.formData();const files=form.getAll("images").filter(x=>x instanceof File);const urls=[];
  for(const file of files.slice(0,20)){
    if(!file.type.startsWith("image/"))continue;if(file.size>10*1024*1024)continue;
    const ext=(file.name.split(".").pop()||"jpg").replace(/[^a-zA-Z0-9]/g,"").toLowerCase()||"jpg";const key=`products/${crypto.randomUUID()}.${ext}`;
    await env.IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:"public, max-age=31536000, immutable"}});urls.push(`/images/${key}`);
  }
  return json({urls});
}
async function ownerAccounts(request,env){
  if(!env.OWNER_PIN)return json({error:"OWNER_PINがCloudflareに設定されていません。"},500);
  if(request.method==="GET"){
    const auth=await requireAdmin(request,env);if(auth.response)return auth.response;
    const {results}=await env.DB.prepare("SELECT id,email,name FROM admins ORDER BY id LIMIT 2").all();return json({accounts:results||[]});
  }
  const body=await request.json().catch(()=>({}));if(String(body.pin||"")!==String(env.OWNER_PIN))return json({error:"オーナーPINが正しくありません。"},403);
  const accounts=Array.isArray(body.accounts)?body.accounts.slice(0,2):[];if(accounts.length!==2)return json({error:"管理者アカウントを2件入力してください。"},400);
  const emails=accounts.map(a=>String(a.email||"").trim().toLowerCase());if(!emails[0]||!emails[1]||emails[0]===emails[1])return json({error:"2つの異なるメールアドレスを入力してください。"},400);
  const existing=await env.DB.prepare("SELECT id,email FROM admins ORDER BY id LIMIT 2").all();
  const rows=existing.results||[];
  for(let i=0;i<2;i++){
    const email=emails[i],pw=String(accounts[i].password||"");
    if(rows[i]){
      if(pw){if(pw.length<12)return json({error:`管理者${i+1}のパスワードは12文字以上にしてください。`},400);const salt=crypto.randomUUID();const hash=await pbkdf2Hex(pw,salt);await env.DB.prepare("UPDATE admins SET email=?,password_hash=?,salt=? WHERE id=?").bind(email,hash,salt,rows[i].id).run();}
      else await env.DB.prepare("UPDATE admins SET email=? WHERE id=?").bind(email,rows[i].id).run();
    }else{
      if(pw.length<12)return json({error:`管理者${i+1}のパスワードを12文字以上入力してください。`},400);const salt=crypto.randomUUID();const hash=await pbkdf2Hex(pw,salt);await env.DB.prepare("INSERT INTO admins(email,password_hash,salt,name) VALUES(?,?,?,?)").bind(email,hash,salt,`管理者${i+1}`).run();
    }
  }
  return json({ok:true,message:"管理者設定を保存しました。"});
}
async function handleApi(request,env,url){
  const path=url.pathname;
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
  if(path==="/api/health"&&request.method==="GET"){try{await env.DB.prepare("SELECT 1 AS ok").first();return json({ok:true,database:"connected"})}catch(e){return json({ok:false,database:"error"},500)}}
  if(path==="/api/login"&&request.method==="POST")return handleLogin(request,env);
  if(path==="/api/logout"&&request.method==="POST"){const token=getCookie(request,SESSION_COOKIE);if(token)await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(await sha256B64(token)).run();return json({ok:true},200,{"Set-Cookie":`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`})}
  if(path==="/api/admin/me"&&request.method==="GET"){const a=await verifyAdmin(request,env);return a?json({email:a.email,name:a.name||""}):json({error:"ログインが必要です。"},401)}
  if(path==="/api/products"&&request.method==="GET")return json(await listProducts(env,false));
  const pm=path.match(/^\/api\/products\/([^/]+)$/);if(pm&&request.method==="GET"){const p=await getProduct(env,decodeURIComponent(pm[1]),false);return p?json(p):json({error:"機械が見つかりません。"},404)}
  if(path==="/api/admin/products"&&request.method==="GET"){const a=await requireAdmin(request,env);if(a.response)return a.response;return json(await listProducts(env,true))}
  if(path==="/api/admin/products"&&request.method==="POST")return createProduct(request,env);
  if(path==="/api/admin/upload"&&request.method==="POST")return uploadImages(request,env);
  if(path==="/api/owner/accounts"&&(request.method==="GET"||request.method==="POST"))return ownerAccounts(request,env);
  const am=path.match(/^\/api\/admin\/products\/([^/]+)$/);if(am){const id=decodeURIComponent(am[1]);if(request.method==="PUT")return updateProduct(request,env,id);if(request.method==="DELETE")return deleteProduct(request,env,id)}
  return json({error:"Not Found"},404);
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith("/images/")){if(!env.IMAGES)return new Response("Not Found",{status:404});const key=url.pathname.slice("/images/".length);const obj=await env.IMAGES.get(key);if(!obj)return new Response("Not Found",{status:404});return new Response(obj.body,{headers:{"Content-Type":obj.httpMetadata?.contentType||"application/octet-stream","Cache-Control":"public, max-age=31536000, immutable"}})}if(url.pathname.startsWith("/api/")){try{return await handleApi(request,env,url)}catch(e){console.error(e);return json({error:"サーバー側でエラーが発生しました。"},500)}}const routeMap={"/":"/index.html","/products":"/products.html","/product":"/product.html","/admin":"/admin.html"};if(routeMap[url.pathname])return env.ASSETS.fetch(new Request(new URL(routeMap[url.pathname],url),request));return env.ASSETS.fetch(request)}};
