const DEMO_PRODUCTS = [{
 id:"kubota-kh-012",
 title:"クボタ KH-012 ミニショベル",
 category:"ミニショベル",
 description:"日本で取り扱うクボタ KH-012。1tクラスのコンパクトなミニショベルです。写真・動画・主要仕様をご確認いただけます。",
 videoUrl:"https://youtu.be/JqDzWHW0vWM",
 priceMode:"contact", price:"", status:"published",
 images:["/assets/kubota-kh012.jpg"],
 specs:[
  {key:"メーカー",value:"クボタ"},
  {key:"型式",value:"KH-012"},
  {key:"クラス",value:"1tクラス"},
  {key:"機械種類",value:"ミニショベル"},
  {key:"燃料",value:"ディーゼル"}
 ]
}];
async function getJSON(url){
 try{const r=await fetch(url);if(!r.ok)throw new Error("Request failed");return await r.json();}
 catch(e){
  let products=DEMO_PRODUCTS;
  try{const saved=localStorage.getItem("jmm_demo_products_v1");if(saved)products=JSON.parse(saved)}catch{}
  if(url==="/api/products") return products.filter(p=>p.status==="published");
  const m=url.match(/^\/api\/products\/(.+)$/);
  if(m){const id=decodeURIComponent(m[1]);const p=products.find(x=>x.id===id && x.status==="published");if(p)return p;}
  throw e;
} }
function money(p){return p.priceMode==="show"&&p.price?p.price:"価格はお問い合わせください"}
function card(p){
 const img=(p.images&&p.images[0])||"/assets/kubota-kh012.jpg";
 const chips=(p.specs||[]).slice(0,3).map(s=>`<span class="chip">${escapeHtml(s.key)}: ${escapeHtml(s.value)}</span>`).join("");
 return `<a class="product-card" href="/product.html?id=${encodeURIComponent(p.id)}"><img class="product-img" src="${img}" alt="${escapeHtml(p.title)}"><div class="product-body"><div class="product-meta">${escapeHtml(p.category||"Machine")}</div><div class="product-title">${escapeHtml(p.title)}</div><div class="spec-chips">${chips}</div><strong>${escapeHtml(money(p))}</strong></div></a>`;
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
async function loadFeatured(){try{const ps=await getJSON("/api/products");document.querySelector("#featured").innerHTML=ps.slice(0,3).map(card).join("")||"<p>機械はまだ登録されていません。</p>"}catch(e){document.querySelector("#featured").innerHTML="<p>機械情報を読み込めませんでした。</p>"}}
let allProducts=[];
async function loadProductsPage(){try{allProducts=await getJSON("/api/products");renderProducts(allProducts)}catch(e){document.querySelector("#products").innerHTML="<p>機械情報を読み込めませんでした。</p>"}}
function renderProducts(ps){document.querySelector("#products").innerHTML=ps.map(card).join("")||"<p>検索条件に一致する機械がありません。</p>"}
function filterProducts(){const q=document.querySelector("#search").value.toLowerCase();renderProducts(allProducts.filter(p=>JSON.stringify(p).toLowerCase().includes(q)))}
function ytId(url){try{const u=new URL(url); if(u.hostname==="youtu.be") return u.pathname.slice(1); if(u.hostname.includes("youtube.com")) return u.searchParams.get("v")||u.pathname.split("/").pop();}catch{} return ""}
async function loadProductDetail(){
 const id=new URLSearchParams(location.search).get("id"); const el=document.querySelector("#detail");
 if(!id){el.innerHTML='<div class="container section"><h2>機械が指定されていません</h2><a class="btn" href="/products.html">機械一覧に戻る</a></div>';return}
 try{
  const p=await getJSON("/api/products/"+encodeURIComponent(id)); document.title=p.title+" | Nippon Mini Machinery";
  const main=(p.images&&p.images[0])||"/assets/kubota-kh012.jpg";
  const thumbs=(p.images||[]).map((im,i)=>`<img class="${i===0?"active":""}" src="${im}" onclick="document.querySelector('#mainImg').src='${im}';document.querySelectorAll('.thumbs img').forEach(x=>x.classList.remove('active'));this.classList.add('active')" alt="">`).join("");
  const rows=(p.specs||[]).map(s=>`<div class="spec-row"><b>${escapeHtml(s.key)}</b><span>${escapeHtml(s.value)}</span></div>`).join("");
  const video=ytId(p.videoUrl)?`<div class="video"><iframe src="https://www.youtube.com/embed/${ytId(p.videoUrl)}" title="機械動画" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`:"<div class='notice'>動画はまだ登録されていません。</div>";
  el.innerHTML=`<section class="detail"><div class="container"><a class="muted" href="/products.html">← すべての機械</a><div class="detail-grid" style="margin-top:22px"><div><img id="mainImg" class="gallery-main" src="${main}" alt="${escapeHtml(p.title)}"><div class="thumbs">${thumbs}</div></div><div><div class="eyebrow">${escapeHtml(p.category||"Machine")}</div><h1>${escapeHtml(p.title)}</h1><p class="lead">${escapeHtml(p.description)}</p><div class="price">${escapeHtml(money(p))}</div><div class="contact-box"><h3>この機械にご興味がありますか？</h3><p class="muted">LINEから直接お問い合わせください。</p><a class="btn line" href="https://line.me/R/ti/p/@sample-machinery" target="_blank" rel="noopener">LINEで問い合わせる</a><div style="margin-top:15px"><img class="qr" src="/assets/line-qr.png" onerror="this.src='/assets/line-qr.svg'" alt="LINE QR code"></div></div></div></div>
  <div style="margin-top:55px"><div class="eyebrow">仕様</div><h2>主要仕様</h2><div class="spec-table">${rows||"<div class='notice'>仕様 will be added by the administrator.</div>"}</div></div>
  <div style="margin-top:55px"><div class="eyebrow">動画</div><h2>機械動画</h2>${video}</div></div></section>`;
 }catch(e){el.innerHTML='<div class="container section"><h2>機械が見つかりません</h2><p class="muted">この掲載は非公開になっている可能性があります。</p><a class="btn" href="/products.html">機械一覧に戻る</a></div>'}
}