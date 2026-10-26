const DEMO_PRODUCTS = [];

function legacyClean(products){
 return (Array.isArray(products)?products:[]).filter(p=>p&&p.id!=="sold-mini-excavator-example");
}
const DEMO_IMAGE="/assets/image-placeholder.svg";
function safeImage(value){try{const u=new URL(String(value),location.origin);return u.origin===location.origin&&(u.pathname.startsWith('/media/')||u.pathname.startsWith('/assets/'))?u.href:DEMO_IMAGE}catch{return DEMO_IMAGE}}
async function getJSON(url){const r=await fetch(url);if(!r.ok)throw new Error("読み込みに失敗しました");return r.json()}
function money(p){return p.priceMode==="show"&&p.price?p.price:"価格はお問い合わせください";}
function card(p){
 const img=(p.images&&p.images[0])||DEMO_IMAGE;
 const chips=(p.specs||[]).slice(0,3).map(s=>`<span class="chip">${escapeHtml(s.key)}: ${escapeHtml(s.value)}</span>`).join("");
 const sold=p.status==="sold";
 return `<a class="product-card ${sold?"sold-card":""}" href="/product.html?id=${encodeURIComponent(p.id)}"><div class="product-image-wrap"><img class="product-img" src="${escapeHtml(safeImage(img))}" onerror="this.onerror=null;this.src=DEMO_IMAGE" alt="${escapeHtml(p.title)}">${sold?'<span class="sold-ribbon">売約済み</span>':''}</div><div class="product-body"><div class="product-meta">${escapeHtml(p.category||"機械")}</div><div class="product-title">${escapeHtml(p.title)}</div><div class="spec-chips">${chips}</div><strong>${escapeHtml(sold?"売約済み":money(p))}</strong></div></a>`;
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function featuredProducts(ps){return ps.filter(p=>p.status==="published"&&p.featured).slice(0,1);}
function heroCard(p){
 const img=(p.images&&p.images[0])||DEMO_IMAGE;
 return `<a class="hero-card" href="/product.html?id=${encodeURIComponent(p.id)}"><img src="${escapeHtml(safeImage(img))}" onerror="this.onerror=null;this.src=DEMO_IMAGE" alt="${escapeHtml(p.title)}"><div class="hero-card-body"><span class="pill">おすすめの機械</span><h3 style="font-size:22px;margin-top:9px">${escapeHtml(p.title)}</h3><div class="muted">${escapeHtml(p.category||"機械")}</div></div></a>`;
}
async function loadHomeFeatures(){
 const hero=document.querySelector("#heroFeature"); const featured=document.querySelector("#featured");
 try{
  const ps=await getJSON("/api/products");
  const selected=featuredProducts(ps);
  if(hero) hero.outerHTML=selected[0]?heroCard(selected[0]):`<div class="hero-card empty-feature"><div class="hero-card-body"><span class="pill">おすすめ</span><h3 style="font-size:22px;margin-top:9px">現在、掲載中の機械はありません</h3><div class="muted">在庫が登録されると、こちらに掲載されます。</div></div></div>`;
  if(featured) featured.innerHTML=selected.map(card).join("")||"<p class='muted'>現在、おすすめの機械を掲載していません。</p>";
 }catch(e){
  if(hero) hero.outerHTML=`<div class="hero-card empty-feature"><div class="hero-card-body"><span class="pill">機械一覧</span><h3 style="font-size:22px;margin-top:9px">在庫情報をご覧いただけます</h3></div></div>`;
  if(featured) featured.innerHTML="<p class='muted'>機械情報を読み込めませんでした。</p>";
 }
}
let allProducts=[];
function sortProducts(ps){return [...ps].sort((a,b)=>{const rank={published:0,draft:1,sold:2};return (rank[a.status]??9)-(rank[b.status]??9);});}
async function loadProductsPage(){try{allProducts=sortProducts(await getJSON("/api/products"));renderProducts(allProducts)}catch(e){document.querySelector("#products").innerHTML="<p>機械情報を読み込めませんでした。</p>"}}
function renderProducts(ps){
 const root=document.querySelector("#products");if(!ps.length&&document.querySelector("#search")?.value.trim()){root.innerHTML='<div class="notice">条件に一致する機械がありません。検索語を変えてお試しください。</div>';return;}
 const active=sortProducts(ps.filter(p=>p.status==="published"));
 const sold=sortProducts(ps.filter(p=>p.status==="sold"));
 const activeHtml=active.length?`<section class="catalog-group"><div class="catalog-group-head"><div><div class="eyebrow">販売中</div><h2>販売中の機械</h2></div><span class="catalog-count">${active.length}台</span></div><div class="products-grid">${active.map(card).join("")}</div></section>`:`<section class="catalog-group"><div class="catalog-group-head"><div><div class="eyebrow">販売中</div><h2>販売中の機械</h2></div></div><div class="notice">現在、販売中の機械はありません。</div></section>`;
 const soldHtml=sold.length?`<section class="catalog-group sold-group"><div class="catalog-group-head"><div><div class="eyebrow">販売終了</div><h2>売約済みの機械</h2></div><span class="catalog-count">${sold.length}台</span></div><div class="products-grid">${sold.map(card).join("")}</div></section>`:"";
 root.innerHTML=activeHtml+soldHtml;
}
function filterProducts(){const q=document.querySelector("#search").value.toLowerCase();renderProducts(sortProducts(allProducts.filter(p=>JSON.stringify(p).toLowerCase().includes(q))));}
function ytId(url){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '';let id='';if(u.hostname==='youtu.be')id=u.pathname.slice(1);if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname))id=u.searchParams.get('v')||u.pathname.split('/').pop();return /^[A-Za-z0-9_-]{11}$/.test(id)?id:''}catch{return ''}}
function lineMailUrl(){return "https://line.me/ti/p/bVD6urhT66"}
async function loadProductDetail(){
 const id=new URLSearchParams(location.search).get("id"); const el=document.querySelector("#detail");
 if(!id){el.innerHTML='<div class="container section"><h2>機械が指定されていません</h2><a class="btn" href="/products.html">機械一覧に戻る</a></div>';return;}
 try{
  const p=await getJSON("/api/products/"+encodeURIComponent(id)); document.title=p.title+" | 株式会社 山本オート";
  const main=(p.images&&p.images[0])||DEMO_IMAGE;
  const thumbs=(p.images||[]).map((im,i)=>`<button type="button" class="thumb ${i===0?'active':''}" data-image="${escapeHtml(safeImage(im))}" aria-label="写真${i+1}を表示" aria-pressed="${i===0}"><img src="${escapeHtml(safeImage(im))}" alt="" loading="lazy"></button>`).join("");
  const rows=(p.specs||[]).map(s=>`<div class="spec-row"><b>${escapeHtml(s.key)}</b><span>${escapeHtml(s.value)}</span></div>`).join("");
  const video=ytId(p.videoUrl)?`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${ytId(p.videoUrl)}" title="機械動画" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`:"<div class='notice'>動画はまだ登録されていません。</div>";
  const sold=p.status==="sold";
  const contactBox=sold?`<div class="contact-box sold-contact"><h3>この機械は売約済みです</h3><p class="muted">現在、こちらの機械は販売を終了しています。</p></div>`:`<div class="contact-box"><h3>この機械について</h3><p class="muted">商品名を添えて、LINEでお気軽にお問い合わせください。</p><a class="btn line" href="${lineMailUrl(p)}" target="_blank" rel="noopener">LINEで問い合わせる</a></div>`;
  el.innerHTML=`<section class="detail"><div class="container"><a class="muted" href="/products.html">← すべての機械</a><div class="detail-grid" style="margin-top:22px"><div><img id="mainImg" class="gallery-main" src="${escapeHtml(safeImage(main))}" onerror="this.onerror=null;this.src=DEMO_IMAGE" alt="${escapeHtml(p.title)}"><div class="thumbs">${thumbs}</div></div><div><div class="eyebrow">${escapeHtml(p.category||"機械")}</div><h1>${escapeHtml(p.title)}</h1><p class="lead">${escapeHtml(p.description||"")}</p><div class="price">${escapeHtml(sold?"売約済み":money(p))}</div>${contactBox}</div></div>
  <div style="margin-top:55px"><div class="eyebrow">仕様</div><h2>主要仕様</h2><div class="spec-table">${rows||"<div class='notice'>仕様情報は順次掲載します。</div>"}</div></div>
  <div style="margin-top:55px"><div class="eyebrow">動画</div><h2>機械動画</h2>${video}</div></div></section>`;
 el.querySelectorAll('.thumb').forEach(button=>button.addEventListener('click',()=>{el.querySelector('#mainImg').src=button.dataset.image;el.querySelectorAll('.thumb').forEach(x=>{x.classList.toggle('active',x===button);x.setAttribute('aria-pressed',String(x===button))})}));
 }catch(e){el.innerHTML='<div class="container section"><h2>機械情報を表示できません</h2><p class="muted">通信環境をご確認のうえ、もう一度お試しください。掲載が終了している場合もあります。</p><a class="btn" href="/products.html">機械一覧に戻る</a></div>'}
}

