async function login(e) {
  e.preventDefault();
  const msg = $("loginMsg");
  const enteredEmail = $("email").value.trim();
  const enteredPassword = $("password").value;
  msg.textContent = "";
  msg.classList.remove("error-msg");

  try {
    const data = await api("/api/login", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:enteredEmail,password:enteredPassword})
    });
    showAdmin(data.email);
    return;
  } catch (serverErr) {
    msg.classList.add("error-msg");
    msg.textContent = serverErr.message || "メールアドレスまたはパスワードが正しくありません。";
  }
}

async function check() {
  try { const me = await api("/api/admin/me"); showAdmin(me.email); } catch {}
}

function showAdmin(email) {
  $("loginView").classList.add("hidden");
  $("adminView").classList.remove("hidden");
  $("adminUser").textContent = "ログイン中: " + email;
  loadAdminProducts();
}

async function logout() {
  try { await api("/api/logout", {method:"POST"}); } catch {}
  location.reload();
}

async function loadAdminProducts() {
  try { currentProducts = cleanLegacyProducts(await api("/api/admin/products")); }
  catch (_) { currentProducts = demoProducts(); }
  suggestedKeys = new Set();
  currentProducts.forEach(p => (p.specs || []).forEach(s => { if(s.key) suggestedKeys.add(s.key); }));
  renderAdmin();
}

function statusRank(s){ return ({published:0,draft:1,sold:2}[s] ?? 9); }
function renderAdmin() {
  currentProducts.sort((a,b)=>statusRank(a.status)-statusRank(b.status));
  $("machineList").innerHTML = currentProducts.map(p => `
    <div class="machine-row ${p.status==='sold'?'sold-admin-row':''}">
      <img src="${escAttr((p.images||[])[0]||'/assets/kubota-kh012.jpg')}" onerror="this.src='/assets/kubota-kh012.jpg'" alt="">
      <div class="grow"><b>${esc(p.title)}</b><div class="muted">${esc(p.category||'')} • ${esc(statusLabel(p.status))}</div></div>
      <span class="badge ${esc(p.status)}">${esc(statusLabel(p.status))}</span>
      ${p.featured && p.status==='published'?`<span class="badge featured-badge">ホーム掲載</span>`:''}
      ${p.status==='published'?`<button type="button" class="btn sold-action" data-action="sold" data-id="${escAttr(p.id)}">売約済みにする</button>`:''}
      ${p.status==='sold'?`<button type="button" class="btn" data-action="unsold" data-id="${escAttr(p.id)}">販売中に戻す</button>`:''}
      <button type="button" class="btn" data-action="edit" data-id="${escAttr(p.id)}">編集</button>
      <button type="button" class="btn" data-action="delete" data-id="${escAttr(p.id)}">削除</button>
    </div>`).join("") || "<div class='notice'>機械はまだ登録されていません。</div>";
}
function statusLabel(s){ return ({published:"販売中",draft:"下書き",sold:"売約済み"}[s] || s || ""); }

async function setSoldStatus(id,status){
  const p=currentProducts.find(x=>x.id===id); if(!p) return;
  const label=status==='sold'?'売約済みにしますか？':'販売中に戻しますか？';
  if(!confirm(label)) return;
  const body={...p,status};
  try { await api("/api/admin/products/"+encodeURIComponent(id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); }
  catch(_){ saveDemoProducts(demoProducts().map(x=>x.id===id?body:x)); }
  await loadAdminProducts();
}


async function openOwnerSettings(){
  $("ownerSettings")?.classList.remove("hidden");
  try {
    const data=await api("/api/owner/accounts");
    if(data.accounts?.[0]?.email) $("ownerEmail1").value=data.accounts[0].email;
    if(data.accounts?.[1]?.email) $("ownerEmail2").value=data.accounts[1].email;
  } catch (_) {}
  window.scrollTo({top:0,behavior:"smooth"});
}
function closeOwnerSettings(){ $("ownerSettings")?.classList.add("hidden"); }
async function saveOwnerSettings(){
  const msg=$("ownerMsg"); msg.textContent="保存中…";
  const pin=$("ownerPin").value.trim();
  const accounts=[
    {email:$("ownerEmail1").value.trim(),password:$("ownerPassword1").value},
    {email:$("ownerEmail2").value.trim(),password:$("ownerPassword2").value}
  ];
  if(!pin){msg.textContent="オーナーPINを入力してください。";return;}
  if(!accounts[0].email || !accounts[1].email){msg.textContent="2つの管理者メールアドレスを入力してください。";return;}
  try{
    const data=await api("/api/owner/accounts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin,accounts})});
    msg.textContent=data.message||"管理者設定を保存しました。";
    $("ownerPin").value=""; $("ownerPassword1").value=""; $("ownerPassword2").value="";
  }catch(e){msg.textContent=e.message||"保存に失敗しました。";}
}

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
  $("pmode").value="contact"; $("pprice").value=""; $("pimages").value=""; $("phome").checked=false;
  imageItems=[]; selectedThumbnail=0; renderImageManager();
  $("specs").innerHTML="";
  addSpec("メーカー",""); addSpec("型式",""); addSpec("クラス","");
  refreshDatalist();
}
function closeEditor(){ $("editor").classList.add("hidden"); }

function refreshDatalist(){
  let dl = $("suggestedKeys");
  if (!dl) { dl = document.createElement("datalist"); dl.id="suggestedKeys"; document.body.appendChild(dl); }
  dl.innerHTML = [...suggestedKeys].sort().map(k=>`<option value="${escAttr(k)}">`).join("");
}
function addSpec(key="", value="") {
  const wrap=document.createElement("div");
  wrap.className="spec-editor";
  wrap.innerHTML=`<div class="spec-line"><input class="skey" list="suggestedKeys" value="${escAttr(key)}" placeholder="仕様項目名"><input class="sval" value="${escAttr(value)}" placeholder="値"><button class="btn remove remove-spec" type="button">削除</button></div>`;
  $("specs").appendChild(wrap);
}

function editMachine(id) {
  editing=currentProducts.find(p=>p.id===id); if(!editing) return;
  $("editorTitle").textContent="機械を編集";
  $("pid").value=editing.id; $("ptitle").value=editing.title||""; $("pcategory").value=editing.category||"";
  $("pdesc").value=editing.description||""; $("pvideo").value=editing.videoUrl||""; $("pstatus").value=editing.status||"draft";
  $("pmode").value=editing.priceMode||"contact"; $("pprice").value=editing.price||""; $("pimages").value=""; $("phome").checked=Boolean(editing.featured);
  imageItems=(editing.images||[]).map(url=>({type:"url",src:url,name:url}));
  selectedThumbnail=0;
  renderImageManager();
  $("specs").innerHTML=""; (editing.specs||[]).forEach(s=>addSpec(s.key,s.value));
  refreshDatalist();
  $("editor").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderImageManager(){
  const root=$("imagePreview"); if(!root) return;
  if(!imageItems.length){ root.innerHTML='<div class="notice">まだ写真が選択されていません。</div>'; return; }
  root.innerHTML=imageItems.map((item,i)=>`
    <div class="image-item ${i===selectedThumbnail?'selected':''}">
      <img src="${escAttr(item.preview||item.src)}" alt="">
      <label><input type="radio" name="thumbnailChoice" value="${i}" ${i===selectedThumbnail?'checked':''}> サムネイルに設定</label>
      <div class="image-name">${esc(item.name||'写真')}</div>
    </div>`).join('');
}

async function buildImageItemsFromInput(){
  const files=[...($("pimages")?.files||[])];
  if(!files.length) return;
  imageItems=imageItems.concat(files.map(file=>({type:"file",file,src:"",preview:URL.createObjectURL(file),name:file.name})));
  if(imageItems.length && !Number.isInteger(selectedThumbnail)) selectedThumbnail=0;
  renderImageManager();
}

async function filesToDataUrls(files){
  const out=[];
  for(const file of files){ out.push(await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); })); }
  return out;
}

async function saveMachine(){
  const msg=$("saveMsg"); msg.textContent="保存中…";
  try {
    const fileItems=imageItems.filter(x=>x.type==='file');
    const existingItems=imageItems.filter(x=>x.type==='url');
    let newImages=[];
    if(fileItems.length){
      try {
        const fd=new FormData(); fileItems.forEach(x=>fd.append("images",x.file));
        const up=await api("/api/admin/upload",{method:"POST",body:fd});
        newImages=up.urls||[];
      } catch (_) { newImages=await filesToDataUrls(fileItems.map(x=>x.file)); }
    }
    const imageRefs=existingItems.map(x=>x.src).concat(newImages);
    let thumbnailIndex=selectedThumbnail;
    if(thumbnailIndex<0 || thumbnailIndex>=imageRefs.length) thumbnailIndex=0;
    if(imageRefs.length && thumbnailIndex!==0){
      const thumb=imageRefs.splice(thumbnailIndex,1)[0]; imageRefs.unshift(thumb);
    }
    const images=imageRefs;
    const specsArr=[...document.querySelectorAll(".spec-editor")]
      .map(x=>({key:x.querySelector(".skey").value.trim(),value:x.querySelector(".sval").value.trim()}))
      .filter(x=>x.key&&x.value);
    specsArr.forEach(s=>suggestedKeys.add(s.key)); refreshDatalist();
    const body={
      title:$("ptitle").value.trim(), category:$("pcategory").value.trim(), description:$("pdesc").value.trim(),
      videoUrl:$("pvideo").value.trim(), priceMode:$("pmode").value, price:$("pprice").value.trim(),
      status:$("pstatus").value, featured:Boolean($("phome").checked), images, specs:specsArr
    };
    if(!body.title){ throw new Error("機械タイトルを入力してください。"); }

    let savedId=editing?.id||null;
    let usedApi=true;
    try {
      if(editing) await api("/api/admin/products/"+encodeURIComponent(editing.id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      else {
        const created=await api("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        savedId=created.id||created.product?.id||null;
      }
    } catch (_) {
      usedApi=false;
      let products=demoProducts();
      if(editing){
        const idx=products.findIndex(p=>p.id===editing.id);
        if(idx>=0) products[idx]={...products[idx],...body};
      } else {
        const base=(body.title||"machine").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"machine";
        body.id=base+"-"+Date.now(); savedId=body.id; products.push({...body,createdAt:new Date().toISOString()});
      }
      if(body.featured) products=products.map(p=>({...p,featured:p.id===savedId}));
      saveDemoProducts(products);
    }

    // The Home page has space for one featured machine, so selecting one removes the Home selection from all others.
    if(body.featured && usedApi){
      try {
        const latest=cleanLegacyProducts(await api("/api/admin/products"));
        const target=savedId||latest.find(p=>p.title===body.title && p.status===body.status)?.id;
        await Promise.all(latest.filter(p=>p.id!==target && p.featured).map(p=>api("/api/admin/products/"+encodeURIComponent(p.id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...p,featured:false})})));
      } catch (_) {}
    }
    msg.textContent="保存しました。";
    await loadAdminProducts();
    setTimeout(closeEditor,500);
  } catch(e) { msg.textContent=e.message || "保存に失敗しました。"; }
}

async function deleteMachine(id){
  if(!confirm("この機械を削除しますか？")) return;
  try { await api("/api/admin/products/"+encodeURIComponent(id),{method:"DELETE"}); }
  catch (_) { saveDemoProducts(demoProducts().filter(p=>p.id!==id)); }
  await loadAdminProducts();
}

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function escAttr(s){return esc(s).replace(/`/g,"&#096;");}

// Use delegated event handlers so controls keep working even when the catalogue is rerendered.
function initAdminControls(){
  $("addMachineBtn")?.addEventListener("click", newMachine);
  $("closeEditorBtn")?.addEventListener("click", closeEditor);
  $("cancelEditorBtn")?.addEventListener("click", closeEditor);
  $("saveMachineBtn")?.addEventListener("click", saveMachine);
  $("addSpecBtn")?.addEventListener("click", () => addSpec());
  $("specs")?.addEventListener("click", e => {
    const btn=e.target.closest(".remove-spec");
    if(btn) btn.closest(".spec-editor")?.remove();
  });
  $("pimages")?.addEventListener("change", buildImageItemsFromInput);
  $("imagePreview")?.addEventListener("change", e => {
    if(e.target.name === "thumbnailChoice"){ selectedThumbnail=Number(e.target.value)||0; renderImageManager(); }
  });
  $("machineList")?.addEventListener("click", e => {
    const btn=e.target.closest("[data-action]"); if(!btn) return;
    const id=btn.dataset.id;
    if(btn.dataset.action==="edit") editMachine(id);
    if(btn.dataset.action==="delete") deleteMachine(id);
    if(btn.dataset.action==="sold") setSoldStatus(id,"sold");
    if(btn.dataset.action==="unsold") setSoldStatus(id,"published");
  });
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAdminControls, {once:true});
else initAdminControls();
check();
