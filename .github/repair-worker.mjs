import fs from 'node:fs';
const file = 'japan-yamamoto-auto-website-professional-home/src/worker.js';
let s = fs.readFileSync(file, 'utf8');
s = s.replace('slice(0,20):[]', 'slice(0,30):[]');
s = s.replace('files.slice(0,20)', 'files.slice(0,30)');
if (!s.includes('async function deleteMediaObjects')) {
  const helper = `function mediaKey(url){try{const path=new URL(String(url),"https://yamamoto-auto.local").pathname;return path.startsWith("/media/")?decodeURIComponent(path.slice(7)):null}catch{return null}}\nasync function deleteMediaObjects(env,urls){if(!env.IMAGES||!Array.isArray(urls))return;for(const url of urls){const key=mediaKey(url);if(!key)continue;try{await env.IMAGES.delete(key)}catch(error){console.error("image cleanup failed",key,error)}}}\n`;
  s = s.replace('async function saveProduct', helper + 'async function saveProduct');
}
const start = s.indexOf('async function saveProduct(request,env,id=null){');
const end = s.indexOf('async function upload', start);
if (start < 0 || end < 0) throw new Error('saveProduct/upload boundaries not found');
const fn = `async function saveProduct(request,env,id=null){const auth=await requireAdmin(request,env);if(auth.response)return auth.response;const p=payload(await request.json().catch(()=>({})));if(!p.title)return json({error:"機械タイトルを入力してください。"},400);const now=nowIso(),productId=id||slugify(p.title);let imagesToDelete=[];if(p.status==="sold"&&p.images.length>5){imagesToDelete=p.images.slice(5);p.images=p.images.slice(0,5)}if(p.featured)await env.DB.prepare("UPDATE yamamoto_products_v2 SET featured=0 WHERE id<>?").bind(productId).run();if(id){const exists=await env.DB.prepare("SELECT id FROM yamamoto_products_v2 WHERE id=?").bind(id).first();if(!exists)return json({error:"機械が見つかりません。"},404);await env.DB.prepare("UPDATE yamamoto_products_v2 SET title=?,category=?,description=?,video_url=?,price_mode=?,price=?,status=?,featured=?,images_json=?,specs_json=?,line_id=?,updated_at=? WHERE id=?").bind(p.title,p.category,p.description,p.videoUrl,p.priceMode,p.price,p.status,p.featured?1:0,JSON.stringify(p.images),JSON.stringify(p.specs),p.lineId,now,id).run()}else{await env.DB.prepare("INSERT INTO yamamoto_products_v2(id,title,category,description,video_url,price_mode,price,status,featured,images_json,specs_json,line_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(productId,p.title,p.category,p.description,p.videoUrl,p.priceMode,p.price,p.status,p.featured?1:0,JSON.stringify(p.images),JSON.stringify(p.specs),p.lineId,now,now).run()}await deleteMediaObjects(env,imagesToDelete);return json({product:await getProduct(env,productId,true)},id?200:201)}\n`;
s = s.slice(0,start) + fn + s.slice(end);
fs.writeFileSync(file, s);
console.log('Worker repaired');
