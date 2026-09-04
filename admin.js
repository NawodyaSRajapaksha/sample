const DEMO_ADMIN_ACCOUNTS = [
  { email: "admin1@example.jp", password: "Preview123!" },
  { email: "admin2@example.jp", password: "Preview456!" }
];
const DEMO_STORAGE_KEY = "jmm_demo_products_v1";
const DEMO_SESSION_KEY = "jmm_demo_admin_v1";
const DEMO_PRODUCTS = [{
 id:"kubota-kh-012", title:"クボタ KH-012 ミニショベル", category:"ミニショベル",
 description:"日本で取り扱うクボタ KH-012。1tクラスのコンパクトなミニショベルです。写真・動画・主要仕様をご確認いただけます。",
 videoUrl:"https://youtu.be/JqDzWHW0vWM", priceMode:"show", price:"¥1,500,000", status:"published", images:["/assets/kubota-kh012.jpg"],
 specs:[{key:"メーカー",value:"クボタ"},{key:"型式",value:"KH-012"},{key:"クラス",value:"1tクラス"},{key:"機械種類",value:"ミニショベル"},{key:"燃料",value:"ディーゼル"}]
},{
 id:"mini-excavator-contact", title:"小型ミニショベル", category:"ミニショベル",
 description:"在庫・仕様・状態に応じて価格をご案内する商品です。詳しい価格はLINEよりお問い合わせください。",
 videoUrl:"https://youtu.be/JqDzWHW0vWM", priceMode:"contact", price:"", status:"published", images:["/assets/kubota-kh012.jpg"],
 specs:[{key:"機械種類",value:"ミニショベル"},{key:"価格",value:"お問い合わせ"}]
}];


let currentProducts = [], editing = null, suggestedKeys = new Set();
const $ = (id) => document.getElementById(id);

async function api(url, options={}) {
  const r = await fetch(url, options);
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

function demoProducts() {
  try {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return JSON.parse(JSON.stringify(DEMO_PRODUCTS));
}
function saveDemoProducts(products) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(products));
}
function isDemoLoggedIn() { return localStorage.getItem(DEMO_SESSION_KEY) === "1"; }
function setDemoLogin(email) {
  localStorage.setItem(DEMO_SESSION_KEY, "1");
  localStorage.setItem("jmm_demo_admin_email", email);
}
function demoEmail() { return localStorage.getItem("jmm_demo_admin_email") || "admin1@example.jp"; }

async function login(e) {
  e.preventDefault();
  const msg = $("loginMsg");
  const enteredEmail = $("email").value.trim();
  const enteredPassword = $("password").value;
  msg.textContent = "";
  msg.classList.remove("error-msg");

  // Free owner-preview mode: works on static hosting without a backend.
  const accountByEmail = DEMO_ADMIN_ACCOUNTS.find(a => a.email.toLowerCase() === enteredEmail.toLowerCase());
  const demo = accountByEmail && accountByEmail.password === enteredPassword ? accountByEmail : null;
  if (demo) {
    setDemoLogin(demo.email);
    showAdmin(demo.email);
    msg.textContent = "プレビューモードでログインしました。";
    return;
  }

  // Real-server mode (used later in production).
  try {
    const data = await api("/api/login", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:enteredEmail,password:enteredPassword})
    });
    showAdmin(data.email);
    return;
  } catch (_) {}

  msg.classList.add("error-msg");
  if (accountByEmail) msg.textContent = "パスワードが正しくありません。もう一度入力してください。";
  else msg.textContent = "メールアドレスまたはパスワードが正しくありません。";
}

async function check() {
  if (isDemoLoggedIn()) {
    showAdmin(demoEmail());
    return;
  }
  try {
    const me = await api("/api/admin/me");
    showAdmin(me.email);
  } catch {}
}

function showAdmin(email) {
  $("loginView").classList.add("hidden");
  $("adminView").classList.remove("hidden");
  $("adminUser").textContent = "ログイン中: " + email;
  loadAdminProducts();
}

async function logout() {
  try { await api("/api/logout", {method:"POST"}); } catch {}
  localStorage.removeItem(DEMO_SESSION_KEY);
  localStorage.removeItem("jmm_demo_admin_email");
  location.reload();
}

async function loadAdminProducts() {
  try {
    currentProducts = await api("/api/admin/products");
  } catch (_) {
    currentProducts = demoProducts();
  }
  suggestedKeys = new Set();
  currentProducts.forEach(p => (p.specs || []).forEach(s => suggestedKeys.add(s.key)));
  renderAdmin();
}

function renderAdmin() {
  $("machineList").innerHTML = currentProducts.map(p => `
    <div class="machine-row">
      <img src="${escapeAttr((p.images||[])[0]||'/assets/kubota-kh012.jpg')}" onerror="this.src='/assets/kubota-kh012.jpg'">
      <div class="grow"><b>${esc(p.title)}</b><div class="muted">${esc(p.category)} • ${esc(statusLabel(p.status))}</div></div>
      <span class="badge ${esc(p.status)}">${esc(statusLabel(p.status))}</span>
      <button class="btn" onclick="editMachine('${escapeAttr(p.id)}')">編集</button>
      <button class="btn" onclick="deleteMachine('${escapeAttr(p.id)}')">削除</button>
    </div>`).join("") || "<div class='notice'>機械はまだ登録されていません。</div>";
}
function statusLabel(s){ return ({published:"公開",draft:"下書き",sold:"売約済み"}[s] || s || ""); }

function newMachine() {
  editing = null;
  $("editorTitle").textContent = "機械を追加";
  clearForm();
  $("editor").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}
function clearForm() {
  $("pid").value=""; $("ptitle").value=""; $("pcategory").value="ミニショベル";
  $("pdesc").value=""; $("pvideo").value=""; $("pstatus").value="draft";
  $("pmode").value="contact"; $("pprice").value=""; $("pimages").value="";
  $("imagePreview").innerHTML=""; $("specs").innerHTML="";
  addSpec("メーカー",""); addSpec("型式",""); addSpec("クラス","");
}
function closeEditor(){ $("editor").classList.add("hidden"); }

function refreshDatalist(){
  let dl = $("suggestedKeys");
  if (!dl) { dl = document.createElement("datalist"); dl.id="suggestedKeys"; document.body.appendChild(dl); }
  dl.innerHTML = [...suggestedKeys].sort().map(k=>`<option value="${esc(k)}">`).join("");
}
function addSpec(key="", value="") {
  const wrap=document.createElement("div");
  wrap.className="spec-editor";
  wrap.innerHTML=`<div class="spec-line"><input class="skey" list="suggestedKeys" value="${escAttr(key)}" placeholder="仕様項目名"><input class="sval" value="${escAttr(value)}" placeholder="値"><button class="btn remove" type="button" onclick="this.parentElement.parentElement.remove()">削除</button></div>`;
  $("specs").appendChild(wrap);
  refreshDatalist();
}

function editMachine(id) {
  editing=currentProducts.find(p=>p.id===id);
  if(!editing) return;
  $("editorTitle").textContent="機械を編集";
  $("pid").value=editing.id; $("ptitle").value=editing.title||""; $("pcategory").value=editing.category||"";
  $("pdesc").value=editing.description||""; $("pvideo").value=editing.videoUrl||""; $("pstatus").value=editing.status||"draft";
  $("pmode").value=editing.priceMode||"contact"; $("pprice").value=editing.price||""; $("pimages").value="";
  $("imagePreview").innerHTML=(editing.images||[]).map(i=>`<span class="chip">${esc(i)}</span>`).join("");
  $("specs").innerHTML=""; (editing.specs||[]).forEach(s=>addSpec(s.key,s.value));
  $("editor").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}

async function filesToDataUrls(files){
  const out=[];
  for(const file of files){
    out.push(await new Promise((resolve,reject)=>{
      const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
    }));
  }
  return out;
}

async function saveMachine(){
  const msg=$("saveMsg"); msg.textContent="保存中…";
  try {
    let images=editing?.images||[];
    if($("pimages").files.length){
      try {
        const fd=new FormData(); [...$("pimages").files].forEach(f=>fd.append("images",f));
        const up=await api("/api/admin/upload",{method:"POST",body:fd});
        images=[...images,...up.urls];
      } catch (_) {
        images=[...images,...await filesToDataUrls($("pimages").files)];
      }
    }
    const specsArr=[...document.querySelectorAll(".spec-editor")]
      .map(x=>({key:x.querySelector(".skey").value.trim(),value:x.querySelector(".sval").value.trim()}))
      .filter(x=>x.key&&x.value);
    specsArr.forEach(s=>suggestedKeys.add(s.key)); refreshDatalist();
    const body={
      title:$("ptitle").value.trim(), category:$("pcategory").value.trim(), description:$("pdesc").value.trim(),
      videoUrl:$("pvideo").value.trim(), priceMode:$("pmode").value, price:$("pprice").value.trim(),
      status:$("pstatus").value, images, specs:specsArr
    };

    try {
      if(editing) await api("/api/admin/products/"+encodeURIComponent(editing.id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      else await api("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    } catch (_) {
      let products=demoProducts();
      if(editing){
        const idx=products.findIndex(p=>p.id===editing.id);
        if(idx>=0) products[idx]={...products[idx],...body};
      } else {
        const base=(body.title||"machine").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"machine";
        body.id=base+"-"+Date.now(); products.push({...body,createdAt:new Date().toISOString()});
      }
      saveDemoProducts(products);
    }
    msg.textContent="保存しました。";
    await loadAdminProducts();
    setTimeout(closeEditor,500);
  } catch(e) { msg.textContent=e.message || "保存に失敗しました。"; }
}

async function deleteMachine(id){
  if(!confirm("この機械を削除しますか？")) return;
  try {
    await api("/api/admin/products/"+encodeURIComponent(id),{method:"DELETE"});
  } catch (_) {
    saveDemoProducts(demoProducts().filter(p=>p.id!==id));
  }
  await loadAdminProducts();
}

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function escAttr(s){return esc(s).replace(/`/g,"&#096;");}

check();
