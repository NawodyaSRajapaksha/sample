(() => {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));

  const imageOf = (product) => {
    const image = Array.isArray(product.images) ? product.images[0] : "";
    return image || "/assets/kubota-kh012.jpg";
  };

  const priceOf = (product) => {
    if (product.priceMode === "show" && product.price) return esc(product.price);
    return "価格はお問い合わせください";
  };

  const productCard = (product) => `
    <a class="product-card" href="product.html?id=${encodeURIComponent(product.id)}">
      <div class="product-image-wrap">
        <img class="product-img" src="${esc(imageOf(product))}" alt="${esc(product.title)}" onerror="this.onerror=null;this.src='/assets/kubota-kh012.jpg'">
      </div>
      <div class="product-body">
        <div class="product-meta">${esc(product.category || "ミニショベル")}</div>
        <div class="product-title">${esc(product.title)}</div>
        <div class="spec-chips">${(product.specs || []).slice(0, 3).map(s => `<span class="chip">${esc(s.key)}: ${esc(s.value)}</span>`).join("")}</div>
        <div class="muted" style="font-weight:750">${priceOf(product)}</div>
      </div>
    </a>`;

  const emptyFeature = () => `
    <div class="empty-feature">
      <div class="hero-card-body">
        <span class="pill">おすすめ</span>
        <h3 style="font-size:22px;margin-top:10px">現在、掲載中の機械はありません</h3>
        <p class="muted" style="margin:0">在庫が登録されると、こちらに掲載されます。</p>
      </div>
    </div>`;

  const featuredFeature = (product) => `
    <a href="product.html?id=${encodeURIComponent(product.id)}" style="display:block">
      <img src="${esc(imageOf(product))}" alt="${esc(product.title)}" onerror="this.onerror=null;this.src='/assets/kubota-kh012.jpg'">
      <div class="hero-card-body">
        <span class="pill">おすすめ</span>
        <h3 style="font-size:22px;margin-top:10px">${esc(product.title)}</h3>
        <p class="muted" style="margin:0">${priceOf(product)}</p>
      </div>
    </a>`;

  async function loadHomePage() {
    const hero = document.getElementById("heroFeature");
    const featured = document.getElementById("featured");
    if (!hero && !featured) return;

    try {
      const response = await fetch("/api/products", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("商品の読み込みに失敗しました。");
      const products = await response.json();
      const published = Array.isArray(products)
        ? products.filter(p => p && p.status === "published")
        : [];
      const featuredProducts = published.filter(p => p.featured);

      if (hero) hero.innerHTML = featuredProducts[0] ? featuredFeature(featuredProducts[0]) : emptyFeature();

      if (featured) {
        featured.innerHTML = featuredProducts.length
          ? featuredProducts.slice(0, 3).map(productCard).join("")
          : `<div class="notice" style="grid-column:1/-1">現在、掲載中の機械はありません。管理画面から機械を登録すると、ここに表示されます。</div>`;
      }
    } catch (error) {
      if (hero) hero.innerHTML = emptyFeature();
      if (featured) featured.innerHTML = `<div class="notice error-msg" style="grid-column:1/-1">機械情報を読み込めませんでした。しばらくしてからもう一度お試しください。</div>`;
      console.error("Home page product loading failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadHomePage, { once: true });
  } else {
    loadHomePage();
  }
})();
