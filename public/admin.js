let currentProducts=[], editing=null, suggestedKeys=new Set();

async function api(url, options={}){const r=await fetch(url,options);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"通信に失敗しました。");return data}
async function login(e){e.preventDefault();const msg=document.querySelector("#loginMsg");try{const data=await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email.value,password:password.value})});showAdmin(data.email)}catch(err){msg.textContent=err.message}}
async function check(){try{const me=await api("/api/admin/me");showAdmin(me.email)}catch{}}
function showAdmin(email){loginView.classList.add("hidden");adminView.classList.remove("hidden");adminUser.textContent="Signed in as "+email;loadAdminProducts()}
async function logout(){await api("/api/logout",{method:"POST"});location.reload()}
async function loadAdminProducts(){currentProducts=await api("/api/admin/products");currentProducts.forEach(p=>(p.specs||[]).forEach(s=>suggestedKeys.add(s.key)));renderAdmin()}
function renderAdmin(){machineList.innerHTML=currentProducts.map(p=>`<div class="machine-row"><img src="${(p.images||[])[0]||'/assets/kubota-kh012.jpg'}"><div class="grow"><b>${esc(p.title)}</b><div class="muted">${esc(p.category)} • ${p.status}</div></div><span class="badge ${p.status}">${p.status}</span><button class="btn" onclick="edit機械('${p.id}')">Edit</button><button class="btn" onclick="delete機械('${p.id}')">Delete</button></div>`).join("")||"<div class='notice'>No machines yet.</div>"}
function new機械(){editing=null;editorTitle.textContent="Add machine";clearForm();editor.classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"})}
function clearForm(){pid.value="";ptitle.value="";pcategory.value="Mini Excavator";pdesc.value="";pvideo.value="";pstatus.value="draft";pmode.value="contact";pprice.value="";pimages.value="";imagePreview.innerHTML="";specs.innerHTML="";addSpec("Manufacturer","Kubota");addSpec("Model","");addSpec("Class","");}
function closeEditor(){editor.classList.add("hidden")}
function addSpec(key="",value=""){const wrap=document.createElement("div");wrap.className="spec-editor";const options=[...suggestedKeys].sort().map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");wrap.innerHTML=`<div class="spec-line"><input class="skey" list="suggestedKeys" value="${esc(key)}" placeholder="仕様項目名"><input class="sval" value="${esc(value)}" placeholder="値"><button class="btn remove" onclick="this.parentElement.parentElement.remove()">削除</button></div>`;specs.appendChild(wrap);let dl=document.querySelector("#suggestedKeys");if(!dl){dl=document.createElement("datalist");dl.id="suggestedKeys";document.body.appendChild(dl)}dl.innerHTML=[...suggestedKeys].sort().map(k=>`<option value="${esc(k)}">`).join("")}
async function edit機械(id){editing=currentProducts.find(p=>p.id===id);if(!editing)return;editorTitle.textContent="Edit machine";pid.value=editing.id;ptitle.value=editing.title;pcategory.value=editing.category;pdesc.value=editing.description;pvideo.value=editing.videoUrl;pstatus.value=editing.status;pmode.value=editing.priceMode;pprice.value=editing.price;imagePreview.innerHTML=(editing.images||[]).map(i=>`<span class="chip">${i}</span>`).join("");specs.innerHTML="";(editing.specs||[]).forEach(s=>addSpec(s.key,s.value));editor.classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"})}
async function save機械(){
 const msg=saveMsg;msg.textContent="保存中…";
 try{
  let images=editing?.images||[]; if(pimages.files.length){const fd=new FormData();[...pimages.files].forEach(f=>fd.append("images",f));const up=await api("/api/admin/upload",{method:"POST",body:fd});images=[...images,...up.urls]}
  const specsArr=[...document.querySelectorAll(".spec-editor")].map(x=>({key:x.querySelector(".skey").value.trim(),value:x.querySelector(".sval").value.trim()})).filter(x=>x.key&&x.value);
  specsArr.forEach(s=>suggestedKeys.add(s.key));
  const body={title:ptitle.value,category:pcategory.value,description:pdesc.value,videoUrl:pvideo.value,priceMode:pmode.value,price:pprice.value,status:pstatus.value,images,specs:specsArr};
  if(editing) await api("/api/admin/products/"+editing.id,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  else await api("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  msg.textContent="保存しました。";await loadAdminProducts();setTimeout(closeEditor,500);
 }catch(e){msg.textContent=e.message}
}
async function delete機械(id){if(!confirm("この機械を削除しますか？"))return;await api("/api/admin/products/"+id,{method:"DELETE"});await loadAdminProducts()}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
check();