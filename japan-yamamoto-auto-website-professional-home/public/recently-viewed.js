(function(){
  const KEY = 'yamamotoAutoRecentlyViewed';
  const MAX = 6;

  function getItems(){
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch(e){ return []; }
  }

  function saveItems(items){
    try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX))); }
    catch(e){}
  }

  function recordRecentlyViewed(){
    const detail = document.getElementById('detail');
    if(!detail) return;

    const titleEl = detail.querySelector('h1, h2');
    const imageEl = detail.querySelector('img');
    const title = titleEl ? titleEl.textContent.trim() : '';
    if(!title) return;

    const item = {
      url: window.location.href,
      title: title,
      image: imageEl ? imageEl.getAttribute('src') : ''
    };

    const items = getItems().filter(x => x.url !== item.url);
    items.unshift(item);
    saveItems(items);
  }

  function renderRecentlyViewed(){
    const section = document.getElementById('recentlyViewedSection');
    const container = document.getElementById('recentlyViewed');
    if(!section || !container) return;

    const items = getItems();
    if(!items.length){
      section.hidden = true;
      return;
    }

    section.hidden = false;
    container.innerHTML = items.map(item => `
      <a class="product-card" href="${escapeHtml(item.url)}">
        ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">` : ''}
        <div class="product-card-body">
          <h3>${escapeHtml(item.title)}</h3>
          <span class="muted">最近見た機械 →</span>
        </div>
      </a>
    `).join('');
  }

  function escapeHtml(value){
    return String(value || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  window.recordRecentlyViewed = recordRecentlyViewed;
  window.renderRecentlyViewed = renderRecentlyViewed;
})();
