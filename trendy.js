/* ============================================================
   trendy.js : modern shopping features for ShopEase
   Loads after boost.js on every customer page.
   ============================================================ */
(function () {
  const $t = id => document.getElementById(id);
  const page = document.body.dataset.page || "";
  const hasApp = typeof window.renderCart === "function" && !!$t("cartDrawer");
  const KEY = { theme: "shop_theme", compare: "shop_compare" };

  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const prod = id => getProducts().find(p => p.id === id);
  const currentPid = () => +new URLSearchParams(location.search).get("id");
  const ratingOf = id => {
    const r = get("shop_reviews", []).filter(x => x.productId === id);
    return r.length ? { avg: r.reduce((s, x) => s + x.rating, 0) / r.length, n: r.length } : null;
  };
  const stockOf = id => { const m = get("shop_stock", {}); return id in m ? m[id] : null; };
  const productLink = p => `<a href="product.html?id=${p.id}">${esc(p.name)}</a>`;

  /* ================= DARK MODE ================= */
  function applyTheme(dark) {
    document.documentElement.classList.toggle("dark", dark);
  }

  function setupTheme() {
    const btn = document.createElement("button");
    btn.id = "themeBtn";
    btn.className = "theme-btn";
    btn.type = "button";
    const anchor = $t("authLink") || $t("cartBtn");
    if (anchor) anchor.parentNode.insertBefore(btn, anchor);
    else document.querySelector(".topbar")?.appendChild(btn);

    const paint = () => {
      const dark = document.documentElement.classList.contains("dark");
      btn.textContent = dark ? "☀️" : "🌙";
      btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
    };
    btn.onclick = () => {
      const dark = !document.documentElement.classList.contains("dark");
      set(KEY.theme, dark ? "dark" : "light");
      applyTheme(dark);
      paint();
    };
    paint();
  }

  /* ================= VOICE SEARCH ================= */
  function setupVoice() {
    const form = $t("searchForm");
    const input = $t("search");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!form || !input || !SR) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mic-btn";
    btn.title = "Search by voice";
    btn.textContent = "🎤";
    form.appendChild(btn);

    btn.onclick = () => {
      const rec = new SR();
      rec.lang = "en-IN";
      rec.interimResults = false;
      btn.classList.add("listening");
      rec.onresult = e => {
        input.value = e.results[0][0].transcript;
        input.dispatchEvent(new Event("input"));
        if (page !== "shop") form.requestSubmit();   // go to the shop page with the words
      };
      rec.onerror = () => toast("Voice search is not available. Please type instead.");
      rec.onend = () => btn.classList.remove("listening");
      rec.start();
    };
  }

  /* ================= PRODUCT CARDS: quick view and compare ================= */
  function decorateCards() {
    const list = get(KEY.compare, []);
    document.querySelectorAll(".card:not([data-tx])").forEach(card => {
      const add = card.querySelector("[data-add]");
      if (!add) return;
      card.dataset.tx = "1";
      const id = +add.dataset.add;

      const wrap = card.querySelector(".img-wrap");
      if (wrap) wrap.insertAdjacentHTML("beforeend",
        `<button class="qv-btn" type="button" data-qv="${id}">👁 Quick view</button>`);

      const body = card.querySelector(".card-body");
      if (body) body.insertAdjacentHTML("beforeend",
        `<label class="cmp-lbl"><input type="checkbox" data-cmp="${id}" ${list.includes(id) ? "checked" : ""}> Compare</label>`);
    });
  }

  function openQuickView(id) {
    const p = prod(id);
    if (!p) return;
    const fp = finalPrice(p);
    const d = p.discount || 0;
    $t("txBody").innerHTML = `
      <div class="qv-grid">
        <img src="${esc(p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
        <div>
          <small class="cat-tag">${esc(p.category)}</small>
          <h2>${esc(p.name)}</h2>
          <p class="desc">${esc(p.description || "")}</p>
          <div class="price">
            ${d > 0 ? `<s>${money(p.price)}</s> ` : ""}<strong>${money(fp)}</strong>
            ${d > 0 ? ` <span class="badge-inline">-${d}%</span>` : ""}
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn primary" id="qvAdd" data-id="${id}" type="button" ${isOn(p) ? "" : "disabled"}>Add to cart</button>
            <a class="btn" href="product.html?id=${id}">View details</a>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:14px; justify-content:flex-end">
        <button class="btn" id="txClose" type="button">Close</button>
      </div>`;
    $t("txModal").classList.remove("hidden");
  }

  function closeModal() { $t("txModal").classList.add("hidden"); }

  function toggleCompare(id, on) {
    let list = get(KEY.compare, []).filter(x => x !== id);
    if (on) {
      if (list.length >= 3) toast("You can compare up to 3 products. Remove one first.");
      else list.push(id);
    }
    set(KEY.compare, list);
    refreshCompare();
  }

  function refreshCompare() {
    const list = get(KEY.compare, []);
    document.querySelectorAll("[data-cmp]").forEach(cb => { cb.checked = list.includes(+cb.dataset.cmp); });
    renderCompareBar();
  }

  function renderCompareBar() {
    const bar = $t("cmpBar");
    if (!bar) return;
    const list = get(KEY.compare, []).map(prod).filter(Boolean);
    bar.classList.toggle("hidden", list.length === 0);
    bar.innerHTML = `
      <span>⇄ Comparing ${list.length}/3</span>
      ${list.map(p => `<span class="cmp-chip">${esc(p.name)}</span>`).join("")}
      <button class="btn small primary" id="cmpOpen" type="button" ${list.length < 2 ? "disabled" : ""}>Compare</button>
      <button class="btn small" id="cmpClear" type="button">Clear</button>`;
  }

  function openCompare() {
    const list = get(KEY.compare, []).map(prod).filter(Boolean);
    const rows = [
      ["Price", p => money(finalPrice(p))],
      ["Original price", p => money(p.price)],
      ["Discount", p => (p.discount || 0) + "%"],
      ["Category", p => p.category],
      ["Rating", p => { const r = ratingOf(p.id); return r ? `${r.avg.toFixed(1)} ★ (${r.n})` : "No reviews yet"; }],
      ["Stock", p => { const s = stockOf(p.id); return s === null ? "Available" : s > 0 ? `${s} left` : "Out of stock"; }],
      ["Description", p => p.description || "-"]
    ];
    $t("txBody").innerHTML = `
      <h2>Compare products</h2>
      <div style="overflow-x:auto">
        <table class="table cmp-table">
          <thead><tr><th></th>${list.map(p => `
            <th><img class="cmp-img" src="${esc(p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'"><br>${esc(p.name)}</th>`).join("")}
          </tr></thead>
          <tbody>${rows.map(([label, fn]) => `
            <tr><th>${label}</th>${list.map(p => `<td>${esc(fn(p))}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="row" style="margin-top:14px; justify-content:flex-end">
        <button class="btn" id="txClose" type="button">Close</button>
      </div>`;
    $t("txModal").classList.remove("hidden");
  }

  /* ================= SHOPPING ASSISTANT (chatbot) ================= */
  function setupChat() {
    document.body.insertAdjacentHTML("beforeend", `
      <button id="chatFab" class="chat-fab" type="button" aria-label="Shopping assistant">💬</button>
      <div id="chatBox" class="chat-box hidden">
        <div class="chat-head">
          <strong>ShopEase Assistant</strong>
          <button id="chatClose" type="button" aria-label="Close">✕</button>
        </div>
        <div id="chatMsgs" class="chat-msgs"></div>
        <form id="chatForm" class="chat-form">
          <input id="chatIn" placeholder="Ask about deals, delivery..." autocomplete="off">
          <button class="btn primary" type="submit">Send</button>
        </form>
      </div>`);

    $t("chatFab").onclick = () => {
      const box = $t("chatBox");
      box.classList.toggle("hidden");
      if (!box.classList.contains("hidden")) {
        if (!$t("chatMsgs").children.length) {
          say("Hi! 👋 I'm your shopping assistant. Ask me about deals, coupons, delivery, returns, payment, or your orders.", "bot");
        }
        $t("chatIn").focus();
      }
    };
    $t("chatClose").onclick = () => $t("chatBox").classList.add("hidden");
    $t("chatForm").onsubmit = e => {
      e.preventDefault();
      const text = $t("chatIn").value.trim();
      if (!text) return;
      $t("chatIn").value = "";
      say(esc(text), "me");
      setTimeout(() => say(botReply(text), "bot"), 300);
    };
  }

  function say(html, who) {
    const box = $t("chatMsgs");
    const d = document.createElement("div");
    d.className = "msg " + who;
    d.innerHTML = html;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function botReply(text) {
    const t = text.toLowerCase();
    const has = (...words) => new RegExp("\\b(" + words.join("|") + ")").test(t);
    const user = getCurrentUser();

    if (has("hi", "hello", "hey")) {
      return "Hello! Ask me about today's deals, coupons, delivery, returns, or your orders.";
    }
    if (has("track", "order", "status", "where")) {
      return user
        ? `You can see all your orders and their delivery status in <a href="account.html">My Account</a>.`
        : `Please <a href="login.html?next=account.html">log in</a> to track your orders.`;
    }
    if (has("coupon", "code", "promo")) {
      const active = get("shop_coupons", []).filter(c => c.active);
      return active.length
        ? "Active coupons: " + active.map(c => `<strong>${esc(c.code)}</strong>`).join(", ") + ". Enter a code in your cart to use it."
        : "No coupons are active right now. Check today's deals instead!";
    }
    if (has("deal", "discount", "sale", "offer", "cheap")) {
      const deals = getProducts().filter(p => isOn(p) && (p.discount || 0) > 0).slice(0, 3);
      return deals.length
        ? "Top deals right now: " + deals.map(productLink).join(", ") + "."
        : "No deals are running right now. Check back soon!";
    }
    if (has("ship", "delivery", "deliver", "free")) {
      return `Delivery is free on orders above ${money(CONFIG.freeDeliveryAbove)}. Below that, a delivery fee of ${money(CONFIG.deliveryFee)} applies.`;
    }
    if (has("return", "refund", "exchange")) {
      return "We offer easy returns. Please contact the store with your order ID to start a return.";
    }
    if (has("pay", "payment", "card", "upi", "razorpay", "cod")) {
      return "You can pay by card, UPI, or netbanking through Razorpay, or choose cash on delivery.";
    }
    if (has("login", "account", "sign")) {
      return `You can log in using the 👤 icon at the top. New customers can create an account there too.`;
    }

    // Otherwise, suggest matching products
    const words = t.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
    const found = getProducts()
      .filter(p => isOn(p) && words.some(w => `${p.name} ${p.category} ${p.description || ""}`.toLowerCase().includes(w)))
      .slice(0, 3);
    if (found.length) return "You might like: " + found.map(productLink).join(", ") + ".";

    return `Sorry, I didn't catch that. Try asking about <em>deals</em>, <em>coupons</em>, <em>delivery</em>, or <em>track my order</em>.`;
  }

  /* ================= MOBILE BOTTOM NAVIGATION ================= */
  function setupBottomNav() {
    document.body.insertAdjacentHTML("beforeend", `
      <nav class="bottom-nav" id="bottomNav">
        <a href="index.html" data-k="home">🏠<span>Home</span></a>
        <a href="shop.html" data-k="shop">🛍️<span>Shop</span></a>
        <button type="button" id="bnCart">🛒<span>Cart</span></button>
        <a href="login.html?next=account.html" id="bnAcc">👤<span>Account</span></a>
      </nav>`);

    const user = getCurrentUser();
    $t("bnAcc").href = user ? "account.html" : "login.html?next=account.html";

    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("#bottomNav a").forEach(a => {
      if (a.getAttribute("href") === here) a.classList.add("on");
    });

    $t("bnCart").onclick = () => {
      if (hasApp && typeof window.openCart === "function") return window.openCart();
      sessionStorage.setItem("shop_open_cart", "1");   // shop page opens the cart on arrival
      location.href = "shop.html";
    };
  }

  /* ================= BACK TO TOP ================= */
  function setupBackTop() {
    document.body.insertAdjacentHTML("beforeend",
      `<button id="backTop" class="back-top hidden" type="button" aria-label="Back to top">↑</button>`);
    const b = $t("backTop");
    window.addEventListener("scroll", () => b.classList.toggle("hidden", window.scrollY < 400), { passive: true });
    b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================= SOCIAL PROOF (product page) ================= */
  function socialProof() {
    document.querySelectorAll(".proof").forEach(el => el.remove());
    const p = prod(currentPid());
    const h1 = document.querySelector(".pd-info h1");
    if (!p || !h1) return;

    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const sold = getOrders()
      .filter(o => new Date(o.createdAt) >= since && normStatus(o.status) !== "cancelled")
      .reduce((s, o) => s + o.items.filter(i => i.name === p.name).reduce((a, i) => a + i.qty, 0), 0);
    const left = stockOf(p.id);

    const lines = [];
    if (sold) lines.push(`🔥 ${sold} sold in the last 7 days`);
    if (left !== null && left > 0 && left <= 5) lines.push(`⚠️ Only ${left} left in stock`);
    if (lines.length) h1.insertAdjacentHTML("afterend", `<div class="proof">${lines.join(" · ")}</div>`);
  }

  /* ================= CLICKS AND CHANGES ================= */
  document.addEventListener("click", e => {
    const t = e.target;
    const qv = t.closest && t.closest("[data-qv]");
    if (qv) { e.preventDefault(); return openQuickView(+qv.dataset.qv); }
    if (t.id === "qvAdd") return window.addToCart(+t.dataset.id, 1);
    if (t.id === "txClose" || t.id === "txModal") return closeModal();
    if (t.id === "cmpOpen") return openCompare();
    if (t.id === "cmpClear") { set(KEY.compare, []); refreshCompare(); }
  });

  document.addEventListener("change", e => {
    const id = e.target.dataset && e.target.dataset.cmp;
    if (id) toggleCompare(+id, e.target.checked);
  });

  /* ================= START ================= */
  function init() {
    applyTheme(get(KEY.theme, "light") === "dark");

    document.body.insertAdjacentHTML("beforeend", `
      <div id="txModal" class="modal hidden"><div class="modal-box" id="txBody"></div></div>
      <div id="cmpBar" class="cmp-bar hidden"></div>`);

    setupTheme();
    setupVoice();
    setupChat();
    setupBottomNav();
    setupBackTop();

    if (hasApp) {
      decorateCards();
      new MutationObserver(decorateCards).observe(document.body, { childList: true, subtree: true });

      if (page === "product") {
        const base = window.renderProduct;
        window.renderProduct = function () { base(); socialProof(); };
        socialProof();
      }
    }

    refreshCompare();

    window.addEventListener("storage", e => {
      if (e.key === KEY.compare) refreshCompare();
      if (e.key === KEY.theme) applyTheme(get(KEY.theme, "light") === "dark");
    });
  }

  init();
})();