/* ============================================================
   boost.js : growth features for ShopEase
   Loads after app.js (store pages), after account.html's script,
   and after admin.js (admin page).
   ============================================================ */
(function () {
  const $b = id => document.getElementById(id);
  const LS = {
    coupons: "shop_coupons",
    applied: "shop_coupon",
    flash: "shop_flash",
    stock: "shop_stock",
    reviews: "shop_reviews",
    recent: "shop_recent",
    news: "shop_newsletter",
    openCart: "shop_open_cart"
  };
  const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const jset = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const pad = n => String(n).padStart(2, "0");
  const isAdmin = !!$b("loginForm") && !!document.querySelector(".tabs");
  const isAccount = location.pathname.endsWith("account.html");

  /* ---------- helpers ---------- */
  const findProduct = id => getProducts().find(p => p.id === id);
  const currentPid = () => +new URLSearchParams(location.search).get("id");
  const reviewsAll = () => jget(LS.reviews, []);
  const reviewsFor = id => reviewsAll().filter(r => r.productId === id);
  const avg = list => (list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0);
  const stars = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  const wishKey = () => "shop_wish_" + (getCurrentUser() ? "u" + getCurrentUser().id : "guest");
  const wishList = () => jget(wishKey(), []);
  const stat = (label, value) => `<div class="stat"><small>${label}</small><strong>${value}</strong></div>`;

  /* ---------- stock ---------- */
  const stockMap = () => jget(LS.stock, {});
  function stockLeft(id) {
    const m = stockMap();
    return id in m ? m[id] : null; // null = not tracked (unlimited)
  }
  // Called by app.js after each order is saved
  window.reserveStock = function (order) {
    const m = stockMap();
    order.items.forEach(i => {
      const p = getProducts().find(x => x.name === i.name);
      if (p && p.id in m) m[p.id] = Math.max(0, m[p.id] - i.qty);
    });
    jset(LS.stock, m);
  };

  /* ---------- coupons ---------- */
  const coupons = () => jget(LS.coupons, []);
  function checkCoupon(code, subtotal) {
    const c = coupons().find(x => x.code === code);
    if (!c || !c.active) return { error: "Invalid coupon code." };
    if (c.expires && new Date(c.expires + "T23:59:59") < new Date()) return { error: "This coupon has expired." };
    if (subtotal < (c.minOrder || 0)) return { error: `This coupon needs a minimum order of ${money(c.minOrder)}.` };
    const discount = c.type === "percent" ? round2(subtotal * c.value / 100) : Math.min(c.value, subtotal);
    return { coupon: c, discount };
  }

  /* ---------- flash sale ---------- */
  function renderFlash() {
    const bar = $b("flashBar");
    if (!bar) return;
    const f = jget(LS.flash, null);
    const end = f ? new Date(f.end).getTime() : 0;
    if (!end || end <= Date.now()) {
      bar.innerHTML = "";
      bar.classList.add("hidden");
      return;
    }
    bar.classList.remove("hidden");
    const left = end - Date.now();
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);
    bar.innerHTML = `<div class="flash-in"><strong>⚡ ${esc(f.title)}</strong>
      <span>Ends in</span><span class="cd">${pad(h)}:${pad(m)}:${pad(s)}</span></div>`;
  }

  /* ---------- cart: coupons, free delivery bar ---------- */
  function freeDeliveryBar(d) {
    if (!d.lines.length) return "";
    const left = round2(CONFIG.freeDeliveryAbove - d.subtotal);
    const pct = clamp(d.subtotal / CONFIG.freeDeliveryAbove * 100, 0, 100);
    return `<div class="fd-bar"><div>${left > 0
      ? `Add <strong>${money(left)}</strong> more for FREE delivery`
      : "🎉 You get FREE delivery!"}</div>
      <div class="fd-track"><div style="width:${pct}%"></div></div></div>`;
  }

  function drawCouponBox() {
    const btn = $b("checkoutBtn");
    if (!btn) return;
    if (!$b("couponBox")) btn.insertAdjacentHTML("beforebegin", `<div id="couponBox" class="coupon-box"></div>`);
    const box = $b("couponBox");
    const code = localStorage.getItem(LS.applied);
    box.innerHTML = code
      ? `<div class="cp-applied">🏷️ <strong>${esc(code)}</strong> applied
           <button class="link" id="removeCoupon" type="button">Remove</button></div>`
      : `<div class="cp-row">
           <input id="couponInput" placeholder="Have a coupon code?" maxlength="20">
           <button class="btn" id="applyCoupon" type="button">Apply</button>
         </div>`;
  }

  function applyCoupon() {
    const input = $b("couponInput");
    const code = (input ? input.value : "").trim().toUpperCase();
    if (!code) return toast("Enter a coupon code.");
    const d = window.cartDetails();
    if (!d.lines.length) return toast("Add items to your cart first.");
    const r = checkCoupon(code, d.subtotal);
    if (r.error) return toast(r.error);
    localStorage.setItem(LS.applied, code);
    toast(`Coupon ${code} applied. You save ${money(r.discount)}.`);
    window.renderCart();
  }

  function setupCart() {
    // Wrap cartDetails so the coupon and recalculated totals flow into checkout and orders
    const baseDetails = window.cartDetails;
    window.cartDetails = function () {
      const d = baseDetails();
      const code = localStorage.getItem(LS.applied);
      if (code && d.lines.length) {
        const r = checkCoupon(code, d.subtotal);
        if (r.coupon) {
          d.couponCode = code;
          d.couponDiscount = r.discount;
          d.subtotal = round2(d.subtotal - r.discount);
        } else {
          localStorage.removeItem(LS.applied); // conditions no longer met
        }
      }
      if (d.lines.length) {
        d.tax = round2(d.subtotal * CONFIG.taxRate);
        d.delivery = d.subtotal >= CONFIG.freeDeliveryAbove ? 0 : CONFIG.deliveryFee;
        d.total = round2(d.subtotal + d.tax + d.delivery);
      }
      return d;
    };

    const baseRender = window.renderCart;
    window.renderCart = function () {
      baseRender();
      const d = window.cartDetails();
      if (!d.lines.length) localStorage.removeItem(LS.applied);
      const summary = $b("summary");
      if (summary) {
        if (d.couponDiscount) {
          const t = summary.querySelector(".total");
          if (t) t.insertAdjacentHTML("beforebegin",
            `<div class="save"><span>Coupon ${esc(d.couponCode)}</span><span>−${money(d.couponDiscount)}</span></div>`);
        }
        summary.insertAdjacentHTML("afterbegin", freeDeliveryBar(d));
      }
      drawCouponBox();
    };

    // Block adding more than the stock available
    const baseAdd = window.addToCart;
    window.addToCart = function (id, qty = 1) {
      const left = stockLeft(id);
      const inCart = ((getCart().find(l => l.id === id)) || {}).qty || 0;
      if (left !== null && inCart + qty > left) {
        return toast(left > 0 ? `Only ${left} left in stock.` : "Sorry, this item is out of stock.");
      }
      return baseAdd(id, qty);
    };
  }

  /* ---------- product cards: wishlist, stars, stock tags ---------- */
  function decorateCards() {
    document.querySelectorAll(".card:not([data-bx])").forEach(card => {
      const addBtn = card.querySelector("[data-add]");
      if (!addBtn) return;
      card.dataset.bx = "1";
      const id = +addBtn.dataset.add;
      const p = findProduct(id);
      if (!p) return;

      const wrap = card.querySelector(".img-wrap");
      const on = wishList().includes(id);
      if (wrap) wrap.insertAdjacentHTML("beforeend",
        `<button class="wish-btn ${on ? "on" : ""}" type="button" data-wish="${id}" aria-label="Wishlist">${on ? "♥" : "♡"}</button>`);

      const rs = reviewsFor(id);
      if (rs.length) {
        const h3 = card.querySelector(".card-body h3");
        if (h3) h3.insertAdjacentHTML("afterend",
          `<div class="mini-rate"><span class="stars">${stars(avg(rs))}</span> ${avg(rs).toFixed(1)} (${rs.length})</div>`);
      }

      const left = stockLeft(id);
      if (left !== null && wrap) {
        if (left <= 0) {
          addBtn.disabled = true;
          addBtn.textContent = "Sold out";
          wrap.insertAdjacentHTML("beforeend", `<span class="stock-tag out">Out of stock</span>`);
        } else if (left <= 5) {
          wrap.insertAdjacentHTML("beforeend", `<span class="stock-tag">Only ${left} left</span>`);
        }
      }
    });
  }

  function toggleWish(id) {
    if (!getCurrentUser()) return toast("Please log in to save items to your wishlist.");
    let list = wishList();
    const on = !list.includes(id);
    list = on ? [...list, id] : list.filter(x => x !== id);
    jset(wishKey(), list);
    document.querySelectorAll(`[data-wish="${id}"]`).forEach(b => {
      b.classList.toggle("on", on);
      b.textContent = b.classList.contains("wish-big")
        ? (on ? "♥ Saved" : "♡ Wishlist")
        : (on ? "♥" : "♡");
    });
    toast(on ? "Saved to your wishlist ♥" : "Removed from wishlist");
    renderWishSection();
  }

  function addLine(id, qty) {
    if (typeof window.addToCart === "function" && $b("cartDrawer")) return window.addToCart(id, qty);
    const cart = getCart();
    const line = cart.find(l => l.id === id);
    if (line) line.qty += qty; else cart.push({ id, qty });
    saveCart(cart);
    toast("Added to cart");
  }

  /* ---------- search suggestions ---------- */
  function setupSearch() {
    const input = $b("search");
    const form = $b("searchForm");
    if (!input || !form) return;
    const box = document.createElement("div");
    box.id = "sugBox";
    box.className = "sug hidden";
    form.appendChild(box);

    input.addEventListener("input", () => {
      const term = input.value.trim();
      if (!term) return box.classList.add("hidden");
      const q = term.toLowerCase();
      const list = getProducts()
        .filter(p => isOn(p) && `${p.name} ${p.category}`.toLowerCase().includes(q))
        .slice(0, 6);
      box.innerHTML = (list.length
        ? list.map(p => `<a href="product.html?id=${p.id}">
            <img src="${esc(p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
            <span><strong>${esc(p.name)}</strong><small>${esc(p.category)} · ${money(finalPrice(p))}</small></span></a>`).join("")
        : `<div class="sug-none">No matches</div>`) +
        `<a class="sug-all" href="shop.html?q=${encodeURIComponent(term)}">See all results →</a>`;
      box.classList.remove("hidden");
    });
    document.addEventListener("click", e => {
      if (!form.contains(e.target)) box.classList.add("hidden");
    });
  }

  /* ---------- product page: reviews, frequently bought together, recent ---------- */
  function avgRatingText(pid) { return reviewsFor(pid).length; }

  function fbtFor(p) {
    const counts = {};
    getOrders().forEach(o => {
      const names = o.items.map(i => i.name);
      if (!names.includes(p.name)) return;
      names.forEach(n => { if (n !== p.name) counts[n] = (counts[n] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => getProducts().find(x => x.name === name))
      .filter(x => x && isOn(x));
  }

  function fbtBlock(p) {
    const items = fbtFor(p);
    if (!items.length) return "";
    const all = [p, ...items];
    const total = all.reduce((s, x) => s + finalPrice(x), 0);
    return `
      <div class="fbt">
        <h3>Frequently bought together</h3>
        <div class="fbt-row">
          ${all.map(x => `<a href="product.html?id=${x.id}"><img src="${esc(x.image)}" alt=""><small>${esc(x.name)}</small></a>`)
            .join(`<span class="plus">+</span>`)}
        </div>
        <p>Total for all: <strong>${money(total)}</strong>
          <button class="btn primary small" id="fbtAdd" type="button" data-ids="${all.map(x => x.id).join(",")}">Add all to cart</button></p>
      </div>`;
  }

  function submitReview(pid) {
    const u = getCurrentUser();
    if (!u) return;
    const text = ($b("revText").value || "").trim();
    if (text.length < 5) return toast("Please write at least a few words.");
    const list = reviewsAll();
    list.push({
      id: Date.now(),
      productId: pid,
      userId: u.id,
      userName: u.name.split(" ")[0],
      rating: +$b("revRating").value,
      text,
      date: new Date().toISOString()
    });
    jset(LS.reviews, list);
    toast("Thanks for your review!");
    window.renderProduct();
  }

  function addRecent(id) {
    jset(LS.recent, [id, ...jget(LS.recent, []).filter(x => x !== id)].slice(0, 8));
  }

  function productExtras() {
    const view = $b("productView");
    const pid = currentPid();
    const p = findProduct(pid);
    if (!view || !p) return;
    addRecent(pid);

    const acts = view.querySelector(".pd-actions");
    const onList = wishList().includes(pid);
    if (acts) acts.insertAdjacentHTML("beforeend",
      `<button class="btn big wish-big ${onList ? "on" : ""}" type="button" data-wish="${pid}">${onList ? "♥ Saved" : "♡ Wishlist"}</button>`);

    const rs = reviewsFor(pid);
    const u = getCurrentUser();
    const already = u && rs.some(r => r.userId === u.id);
    const sec = document.createElement("div");
    sec.className = "pd-section";
    sec.innerHTML = `
      <h2>Customer reviews</h2>
      <div class="rev-sum">${rs.length
        ? `<span class="stars big">${stars(avg(rs))}</span> <strong>${avg(rs).toFixed(1)}</strong> out of 5 · ${rs.length} review${rs.length === 1 ? "" : "s"}`
        : "No reviews yet. Be the first to review this product."}</div>
      ${rs.slice().reverse().map(r => `
        <div class="rev">
          <div><span class="stars">${stars(r.rating)}</span> <strong>${esc(r.userName)}</strong>
            <small class="muted">${new Date(r.date).toLocaleDateString()}</small></div>
          <p>${esc(r.text)}</p>
        </div>`).join("")}
      ${u
        ? (already
          ? `<p class="muted">You have already reviewed this product.</p>`
          : `<div class="rev-form">
               <select id="revRating">
                 <option value="5">5 ★ Excellent</option><option value="4">4 ★ Good</option>
                 <option value="3">3 ★ Average</option><option value="2">2 ★ Poor</option>
                 <option value="1">1 ★ Bad</option>
               </select>
               <textarea id="revText" rows="2" placeholder="Share your experience"></textarea>
               <button class="btn primary" id="revSubmit" type="button" data-pid="${pid}">Submit review</button>
             </div>`)
        : `<p class="muted"><a href="login.html?next=${encodeURIComponent("product.html?id=" + pid)}">Login</a> to write a review.</p>`}
      ${fbtBlock(p)}`;
    view.appendChild(sec);
  }

  /* ---------- homepage: recently viewed and recommendations ---------- */
  function recommended(viewed) {
    const u = getCurrentUser();
    const viewedIds = viewed.map(p => p.id);
    let cat = viewed.length ? viewed[0].category : null;
    if (!cat && u) {
      const counts = {};
      getOrders().filter(o => o.userId === u.id).forEach(o =>
        o.items.forEach(i => { counts[i.category] = (counts[i.category] || 0) + i.qty; }));
      cat = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [])[0] || null;
    }
    const pool = getProducts().filter(p => isOn(p) && !viewedIds.includes(p.id));
    const sorted = cat
      ? pool.filter(p => p.category === cat).concat(pool.filter(p => p.category !== cat))
      : pool;
    return sorted.slice(0, 4);
  }

  function renderHomeExtras() {
    const box = $b("homeExtras");
    if (!box) return;
    const recent = jget(LS.recent, []).map(findProduct).filter(p => p && isOn(p)).slice(0, 4);
    const rec = recommended(recent);
    box.innerHTML = `
      ${recent.length ? `<section class="section"><div class="sec-head"><h2>🕘 Recently viewed</h2></div>
        <div class="menu-grid">${recent.map(productCard).join("")}</div></section>` : ""}
      ${rec.length ? `<section class="section"><div class="sec-head"><h2>✨ Recommended for you</h2></div>
        <div class="menu-grid">${rec.map(productCard).join("")}</div></section>` : ""}`;
  }

  /* ---------- trust badges and newsletter (footer area) ---------- */
  function addTrustAndNewsletter() {
    const footer = document.querySelector(".site-footer");
    if (!footer || $b("trustStrip")) return;
    footer.insertAdjacentHTML("beforebegin", `
      <section class="trust" id="trustStrip">
        <div>🔒<strong>Secure payment</strong><small>Encrypted checkout via Razorpay</small></div>
        <div>↩<strong>Easy returns</strong><small>Hassle-free return policy</small></div>
        <div>✔<strong>Genuine products</strong><small>100% authentic items</small></div>
        <div>🚚<strong>Track delivery</strong><small>Live status in My Account</small></div>
      </section>
      <section class="news">
        <div><strong>Get deals in your inbox</strong><small>Subscribe for offers and new arrivals.</small></div>
        <form id="newsForm"><input name="email" type="email" placeholder="Your email" required>
          <button class="btn primary" type="submit">Subscribe</button></form>
      </section>`);
  }

  /* ---------- account page: loyalty points, wishlist, buy again ---------- */
  function renderWishSection() {
    const sec = $b("bxWish");
    if (!sec) return;
    const list = wishList().map(findProduct).filter(Boolean);
    sec.innerHTML = `<h2>♡ My wishlist (${list.length})</h2>` + (list.length
      ? list.map(p => `
        <div class="wish-row">
          <img src="${esc(p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
          <div class="grow"><a href="product.html?id=${p.id}"><strong>${esc(p.name)}</strong></a><br>
            <small>${money(finalPrice(p))}</small></div>
          <button class="btn small primary" type="button" data-wadd="${p.id}" ${isOn(p) ? "" : "disabled"}>Add to cart</button>
          <button class="btn small" type="button" data-wrm="${p.id}">Remove</button>
        </div>`).join("")
      : `<p class="muted">Your wishlist is empty. Tap ♡ on any product to save it.</p>`);
  }

  function renderAccountExtras() {
    const main = document.querySelector(".acc-page");
    const u = getCurrentUser();
    if (!main || !u) return;
    if (!$b("bxPoints")) {
      main.insertAdjacentHTML("beforeend",
        `<section class="acc-card" id="bxPoints"></section><section class="acc-card" id="bxWish"></section>`);
    }
    const points = getOrders()
      .filter(o => o.userId === u.id && normStatus(o.status) !== "cancelled")
      .reduce((s, o) => s + Math.floor(o.totals.total / 10), 0);
    $b("bxPoints").innerHTML = `<h2>⭐ Loyalty points</h2>
      <p>You have <strong>${points}</strong> points. You earn 1 point for every 10 units you spend on orders.</p>`;
    renderWishSection();
  }

  function addBuyAgain() {
    document.querySelectorAll("[data-view]").forEach(b => {
      const row = b.parentElement;
      if (row && !row.querySelector("[data-reorder]")) {
        row.insertAdjacentHTML("beforeend",
          ` <button class="btn small" type="button" data-reorder="${b.dataset.view}">Buy again</button>`);
      }
    });
  }

  function reorder(orderId) {
    const o = getOrders().find(x => x.id === orderId);
    if (!o) return;
    let added = 0;
    o.items.forEach(i => {
      const p = getProducts().find(x => x.name === i.name);
      if (p && isOn(p)) { addLine(p.id, i.qty); added++; }
    });
    if (!added) return toast("These items are no longer available.");
    if ($b("cartDrawer")) return window.openCart();
    sessionStorage.setItem(LS.openCart, "1");
    location.href = "shop.html";
  }

  /* ---------- live homepage refresh ---------- */
  function setupCustomerEvents() {
    document.addEventListener("click", e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.id === "applyCoupon") return applyCoupon();
      if (t.id === "removeCoupon") {
        localStorage.removeItem(LS.applied);
        toast("Coupon removed.");
        return window.renderCart && window.renderCart();
      }
      if (t.id === "fbtAdd") return t.dataset.ids.split(",").map(Number).forEach(id => addLine(id, 1));
      if (t.id === "revSubmit") return submitReview(+t.dataset.pid);
      const w = t.closest("[data-wish]");
      if (w) { e.preventDefault(); return toggleWish(+w.dataset.wish); }
      const wr = t.closest("[data-wrm]");
      if (wr) return toggleWish(+wr.dataset.wrm);
      const wa = t.closest("[data-wadd]");
      if (wa) return addLine(+wa.dataset.wadd, 1);
      const ro = t.closest("[data-reorder]");
      if (ro) return reorder(ro.dataset.reorder);
    });

    document.addEventListener("submit", e => {
      if (e.target.id !== "newsForm") return;
      e.preventDefault();
      const email = e.target.email.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Enter a valid email.");
      const list = jget(LS.news, []);
      if (!list.includes(email)) list.push(email);
      jset(LS.news, list);
      e.target.reset();
      toast("Thanks for subscribing!");
    });
  }

  function setupStore() {
    const page = document.body.dataset.page;
    const hasApp = typeof window.renderCart === "function" && !!$b("cartDrawer");

    setupCustomerEvents();
    addTrustAndNewsletter();

    if (hasApp) {
      setupCart();

      const baseAll = window.renderAll;
      window.renderAll = function () {
        baseAll();
        renderHomeExtras();
        renderFlash();
      };

      if (page === "product") {
        const baseProduct = window.renderProduct;
        window.renderProduct = function () { baseProduct(); productExtras(); };
      }

      if (page === "home") {
        const main = document.querySelector("main");
        if (main) {
          main.insertAdjacentHTML("afterbegin", `<div id="flashBar" class="flash hidden"></div>`);
          main.insertAdjacentHTML("beforeend", `<div id="homeExtras"></div>`);
        }
        setInterval(renderFlash, 1000);
      }

      setupSearch();
      if (sessionStorage.getItem(LS.openCart)) {
        sessionStorage.removeItem(LS.openCart);
        window.openCart();
      }
    }

    if (isAccount) {
      const baseOrders = window.renderOrders;
      window.renderOrders = function () { baseOrders(); addBuyAgain(); };
    }

    decorateCards();
    new MutationObserver(decorateCards).observe(document.body, { childList: true, subtree: true });

    if (hasApp) window.renderAll();   // draw the new features now
    if (isAccount) {
      window.renderOrders();
      renderAccountExtras();
    }
  }

  /* ================= ADMIN ================= */
  function renderDash() {
    const orders = getOrders();
    const live = orders.filter(o => normStatus(o.status) !== "cancelled");
    const revenue = live.reduce((s, o) => s + o.totals.total, 0);
    const todayStr = new Date().toDateString();
    const todayCount = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr).length;
    const pending = orders.filter(o => ["placed", "packed", "shipped", "out for delivery"]
      .includes(normStatus(o.status))).length;
    const users = getUsers();
    const news = jget(LS.news, []);

    const sold = {};
    live.forEach(o => o.items.forEach(i => { sold[i.name] = (sold[i.name] || 0) + i.qty; }));
    const top = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const stock = stockMap();
    const low = getProducts().filter(p => p.id in stock && stock[p.id] <= 5);

    const custRows = users.map(u => {
      const mine = orders.filter(o => o.userId === u.id);
      const spent = mine.filter(o => normStatus(o.status) !== "cancelled")
        .reduce((s, o) => s + o.totals.total, 0);
      return { u, count: mine.length, spent };
    }).sort((a, b) => b.spent - a.spent);

    $b("tab-dash").innerHTML = `
      <div class="stat-grid">
        ${stat("Revenue", money(revenue))}
        ${stat("Total orders", orders.length)}
        ${stat("Orders today", todayCount)}
        ${stat("Pending delivery", pending)}
        ${stat("Customers", users.length)}
        ${stat("Newsletter subscribers", news.length)}
      </div>
      <div class="two-col">
        <div class="acc-card"><h2>Best sellers</h2>
          ${top.length
            ? `<table class="table">${top.map(([n, q]) => `<tr><td>${esc(n)}</td><td><strong>${q}</strong> sold</td></tr>`).join("")}</table>`
            : `<p class="muted">No sales yet.</p>`}
        </div>
        <div class="acc-card"><h2>Low stock alerts</h2>
          ${low.length
            ? `<table class="table">${low.map(p => `<tr><td>${esc(p.name)}</td><td><strong>${stock[p.id]}</strong> left</td></tr>`).join("")}</table>`
            : `<p class="muted">No low stock items.</p>`}
        </div>
      </div>
      <div class="acc-card" style="overflow-x:auto"><h2>Customers</h2>
        ${custRows.length
          ? `<table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Spent</th></tr></thead>
             <tbody>${custRows.map(r => `<tr><td>${esc(r.u.name)}</td><td>${esc(r.u.email)}</td>
               <td>${esc(r.u.phone || "")}</td><td>${r.count}</td><td>${money(r.spent)}</td></tr>`).join("")}</tbody></table>`
          : `<p class="muted">No customers yet.</p>`}
      </div>
      <div class="acc-card"><h2>Newsletter subscribers</h2>
        ${news.length ? `<p>${news.map(e => esc(e)).join(", ")}</p>` : `<p class="muted">No subscribers yet.</p>`}
      </div>
      <div class="acc-card"><h2>Export</h2>
        <button class="btn primary" id="csvBtn" type="button">Download all orders (CSV)</button>
      </div>`;
  }

  function exportCSV() {
    const head = ["Order", "Date", "Customer", "Phone", "Email", "Items", "Total", "Status", "Payment"];
    const rows = getOrders().map(o => [
      o.id, new Date(o.createdAt).toLocaleString(), o.customer.name, o.customer.phone, o.email || "",
      o.items.map(i => `${i.qty} x ${i.name}`).join("; "), o.totals.total,
      normStatus(o.status), `${o.payment.method} (${o.payment.status})`
    ]);
    const csv = [head, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "orders.csv";
    a.click();
  }

  function renderCoupons() {
    const list = coupons();
    $b("tab-coupons").innerHTML = `
      <div class="acc-card">
        <h2>Create coupon</h2>
        <form id="cpForm" class="form-grid">
          <label>Code<input name="code" placeholder="WELCOME10" required></label>
          <label>Type<select name="type">
            <option value="percent">Percent off (%)</option>
            <option value="fixed">Fixed amount off</option>
          </select></label>
          <label>Value<input name="value" type="number" min="1" step="0.01" required></label>
          <label>Minimum order<input name="minOrder" type="number" min="0" step="0.01" value="0"></label>
          <label class="full">Expires on (optional)<input name="expires" type="date"></label>
          <div class="full"><button class="btn primary" type="submit">+ Create coupon</button></div>
        </form>
      </div>
      <div class="acc-card" style="overflow-x:auto">
        <h2>Coupons</h2>
        <table class="table">
          <thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(c => `
            <tr>
              <td><strong>${esc(c.code)}</strong></td>
              <td>${c.type === "percent" ? c.value + "%" : money(c.value)}</td>
              <td>${money(c.minOrder || 0)}</td>
              <td>${esc(c.expires || "Never")}</td>
              <td>${c.active ? "Active" : "Paused"}</td>
              <td class="actions">
                <button class="btn small" type="button" data-cptoggle="${esc(c.code)}">${c.active ? "Pause" : "Activate"}</button>
                <button class="btn small danger" type="button" data-cpdel="${esc(c.code)}">Delete</button>
              </td>
            </tr>`).join("") : `<tr><td colspan="6">No coupons yet.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function addCoupon(form) {
    const f = Object.fromEntries(new FormData(form).entries());
    const code = f.code.trim().toUpperCase().replace(/\s+/g, "");
    const value = parseFloat(f.value);
    if (!code) return toast("Enter a code.");
    if (!(value > 0)) return toast("Enter a value above 0.");
    if (f.type === "percent" && value > 100) return toast("Percent cannot be above 100.");
    const list = coupons();
    if (list.some(c => c.code === code)) return toast("This code already exists.");
    list.push({ code, type: f.type, value, minOrder: parseFloat(f.minOrder) || 0, expires: f.expires || "", active: true });
    jset(LS.coupons, list);
    toast(`Coupon ${code} created.`);
    renderCoupons();
  }

  function toggleCoupon(code) {
    const list = coupons();
    const c = list.find(x => x.code === code);
    if (c) c.active = !c.active;
    jset(LS.coupons, list);
    renderCoupons();
  }

  function deleteCoupon(code) {
    if (!confirm(`Delete coupon ${code}?`)) return;
    jset(LS.coupons, coupons().filter(c => c.code !== code));
    renderCoupons();
  }

  function toLocalInput(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderSale() {
    const f = jget(LS.flash, null);
    const stock = stockMap();
    $b("tab-sale").innerHTML = `
      <div class="acc-card">
        <h2>⚡ Flash sale banner (homepage)</h2>
        <div class="form-grid">
          <label>Title<input id="flashTitle" value="${esc(f ? f.title : "Flash Sale")}"></label>
          <label>Ends at<input id="flashEnd" type="datetime-local" value="${f ? toLocalInput(new Date(f.end)) : ""}"></label>
        </div>
        <div class="bulk">
          <button class="btn primary" id="flashSave" type="button">Show banner with countdown</button>
          <button class="btn" id="flashOff" type="button">Turn off</button>
        </div>
        <small class="muted">The countdown appears at the top of the homepage until the end time.</small>
      </div>
      <div class="acc-card" style="overflow-x:auto">
        <h2>Stock quantities</h2>
        <p class="muted">Leave blank for unlimited. Stock goes down automatically when an order is placed.
          Products with 5 or fewer left show "Only N left".</p>
        <table class="table">
          <thead><tr><th>Product</th><th>Category</th><th>Stock</th></tr></thead>
          <tbody>${getProducts().map(p => `
            <tr>
              <td>${esc(p.name)}</td>
              <td>${esc(p.category)}</td>
              <td><input class="mini" type="number" min="0" data-stock="${p.id}"
                   value="${p.id in stock ? stock[p.id] : ""}"></td>
            </tr>`).join("")}
          </tbody>
        </table>
        <div style="margin-top:12px"><button class="btn primary" id="stockSave" type="button">Save stock</button></div>
      </div>`;
  }

  function saveFlash(on) {
    if (!on) {
      localStorage.removeItem(LS.flash);
      toast("Flash banner turned off.");
      return renderSale();
    }
    const title = $b("flashTitle").value.trim() || "Flash Sale";
    const end = $b("flashEnd").value;
    if (!end || new Date(end) <= new Date()) return toast("Choose an end time in the future.");
    jset(LS.flash, { title, end: new Date(end).toISOString() });
    toast("Flash banner saved. Homepage updated.");
    renderSale();
  }

  function saveStock() {
    const m = {};
    document.querySelectorAll("[data-stock]").forEach(inp => {
      if (inp.value.trim() !== "") m[inp.dataset.stock] = Math.max(0, parseInt(inp.value, 10) || 0);
    });
    jset(LS.stock, m);
    toast("Stock saved.");
  }

  function setupAdmin() {
    const nav = document.querySelector(".tabs");
    const panels = document.querySelectorAll(".panel");
    const last = panels[panels.length - 1];

    nav.insertAdjacentHTML("beforeend", `
      <button class="tab" data-bx="dash">📊 Dashboard</button>
      <button class="tab" data-bx="coupons">🏷️ Coupons</button>
      <button class="tab" data-bx="sale">⚡ Sale &amp; Stock</button>`);
    last.insertAdjacentHTML("afterend", `
      <section id="tab-dash" class="panel hidden"></section>
      <section id="tab-coupons" class="panel hidden"></section>
      <section id="tab-sale" class="panel hidden"></section>`);

    nav.addEventListener("click", e => {
      const b = e.target.closest("[data-bx]");
      if (!b) return;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === b));
      document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + b.dataset.bx));
      if (b.dataset.bx === "dash") renderDash();
      if (b.dataset.bx === "coupons") renderCoupons();
      if (b.dataset.bx === "sale") renderSale();
    });

    document.addEventListener("click", e => {
      const t = e.target;
      if (t.id === "csvBtn") return exportCSV();
      if (t.dataset.cptoggle) return toggleCoupon(t.dataset.cptoggle);
      if (t.dataset.cpdel) return deleteCoupon(t.dataset.cpdel);
      if (t.id === "flashSave") return saveFlash(true);
      if (t.id === "flashOff") return saveFlash(false);
      if (t.id === "stockSave") return saveStock();
    });

    document.addEventListener("submit", e => {
      if (e.target.id === "cpForm") {
        e.preventDefault();
        addCoupon(e.target);
      }
    });
  }

  /* ================= START ================= */
  if (isAdmin) setupAdmin();
  else setupStore();
})();