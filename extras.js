/* ============================================================
   extras.js : remaining features for ShopEase
   Customer: abandoned cart, invoice, gift wrap, pincode check,
             restock reminder, product tags, referral + credit,
             birthday offer, spin the wheel, exit-intent coupon,
             share buttons
   Admin:    activity log, CSV import, tags, pincodes, bulk order
             status, cancel & restock, refunds, sales chart,
             low-stock email draft
   Load LAST on each page.
   ============================================================ */
(function () {
  const $x = id => document.getElementById(id);

  const K = {
    tags: "shop_tags",
    pins: "shop_pincodes",
    activity: "shop_activity",
    gift: "shop_gift",
    credit: "shop_credit",
    spun: "shop_spun",
    coupons: "shop_coupons",
    applied: "shop_coupon",
    stock: "shop_stock"
  };
  const GIFT_FEE = 2;   // gift wrap charge (store currency)
  const REWARD = 5;     // credit for the referrer each time their code is used
  const PRIZES = [5, 10, 15, 20];
  const TAG_OPTIONS = ["New arrival", "Best seller", "Limited edition"];
  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const lastDayOf = (y, m) => `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
  const enc = encodeURIComponent;

  const isAdminPage = !!$x("loginForm");
  const onAccount = location.pathname.endsWith("account.html");
  const page = document.body.dataset.page || "";
  const hasApp = typeof window.renderCart === "function" && !!$x("cartDrawer");

  const copyText = (text, msg) => navigator.clipboard
    ? navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => toast("Copy not supported here."))
    : toast("Copy not supported here.");

  /* ================= SHARED HELPERS ================= */
  function addActivity(text) {
    const list = get(K.activity, []);
    list.unshift({ at: new Date().toISOString(), text });
    set(K.activity, list.slice(0, 200));
  }

  function ensureCoupon(c) {
    const list = get(K.coupons, []);
    if (!list.some(x => x.code === c.code)) {
      list.push(c);
      set(K.coupons, list);
    }
  }

  const referralCodeFor = u => "REF" + (u.name.replace(/[^a-z]/gi, "").slice(0, 3) || "CUS").toUpperCase() + u.id;
  const birthdayCodeFor = (u, y) => `BDAY${u.id}${y}`;

  function ensureReferral(u) {
    ensureCoupon({ code: referralCodeFor(u), type: "percent", value: 10, minOrder: 0,
      expires: "", active: true, owner: u.id });
  }

  /* ================= GIFT WRAP ================= */
  const giftState = () => get(K.gift, { on: false, msg: "" });

  function attachGift(o) {
    const g = giftState();
    if (g.on) o.gift = { message: g.msg || "", fee: GIFT_FEE };
    set(K.gift, { on: false, msg: "" });
  }

  function injectGift() {
    const pay = $x("payTotal");
    if (!pay || $x("giftBox")) return;
    pay.insertAdjacentHTML("beforebegin", `
      <div id="giftBox" class="gift-box">
        <label class="check"><input type="checkbox" id="giftChk"> 🎁 Gift wrap (+${money(GIFT_FEE)})</label>
        <textarea id="giftMsg" rows="2" maxlength="200" placeholder="Gift message (optional)"></textarea>
      </div>`);
  }

  function syncGift() {
    const c = $x("giftChk"), m = $x("giftMsg");
    if (!c) return;
    const g = giftState();
    c.checked = g.on;
    if (m && document.activeElement !== m) m.value = g.msg || "";
  }

  /* ================= CART: gift fee and abandoned-cart banner ================= */
  function setupCart() {
    const baseDetails = window.cartDetails;
    window.cartDetails = function () {
      const d = baseDetails();
      if (d.lines.length && giftState().on) {
        d.giftFee = GIFT_FEE;
        d.total = round2(d.total + GIFT_FEE);
      }
      return d;
    };

    const baseRender = window.renderCart;
    window.renderCart = function () {
      baseRender();
      const d = window.cartDetails();
      const summary = $x("summary");
      if (summary && d.giftFee) {
        const t = summary.querySelector(".total");
        if (t) t.insertAdjacentHTML("beforebegin", `<div><span>Gift wrap</span><span>${money(d.giftFee)}</span></div>`);
      }
      syncGift();
      refreshAbandon();
    };
  }

  function refreshAbandon() {
    const box = $x("exTop");
    if (!box || !hasApp) return;
    const u = getCurrentUser();
    const d = window.cartDetails();
    if (!u || !d.count || sessionStorage.getItem("ex_abandon_hidden")) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `
      <div class="ex-banner">🛒 You left <strong>${d.count} item${d.count > 1 ? "s" : ""}</strong> in your cart.
        <button class="btn small primary" type="button" data-ex-cart>Complete order</button>
        <button class="link" type="button" data-ex-hide>Dismiss</button>
      </div>`;
  }

  /* ================= RESTOCK REMINDER (home page) ================= */
  function renderRestock() {
    const box = $x("exRestock");
    const u = getCurrentUser();
    if (!box) return;
    if (!u) { box.innerHTML = ""; return; }

    const cutoff = Date.now() - 21 * 864e5;
    const last = new Map();
    getOrders()
      .filter(o => o.userId === u.id && normStatus(o.status) !== "cancelled")
      .forEach(o => o.items.forEach(i => {
        const t = new Date(o.createdAt).getTime();
        last.set(i.name, Math.max(last.get(i.name) || 0, t));
      }));

    const products = getProducts();
    const due = [...last.entries()]
      .filter(([, t]) => t < cutoff)
      .map(([name, t]) => ({ p: products.find(p => p.name === name), t }))
      .filter(x => x.p && isOn(x.p))
      .sort((a, b) => a.t - b.t)
      .slice(0, 4);

    box.innerHTML = due.length ? `
      <section class="section">
        <div class="sec-head"><h2>⏰ Time to restock?</h2></div>
        <div class="restock">
          ${due.map(x => `
            <div class="rs-card">
              <img src="${esc(x.p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
              <div>
                <strong>${esc(x.p.name)}</strong>
                <small>Last bought ${Math.floor((Date.now() - x.t) / 864e5)} days ago</small>
              </div>
              <button class="btn small primary" data-add="${x.p.id}" type="button" ${isOn(x.p) ? "" : "disabled"}>Add</button>
            </div>`).join("")}
        </div>
      </section>` : "";
  }

  /* ================= INVOICE ================= */
  function openInvoice(id) {
    const o = getOrders().find(x => x.id === id);
    if (!o) return;
    const w = window.open("", "_blank");
    if (!w) return toast("Please allow pop-ups to view the invoice.");

    const rows = o.items.map(i => `
      <tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.unitPrice)}</td><td>${money(i.qty * i.unitPrice)}</td></tr>`).join("");

    w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${esc(o.id)}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:32px;color:#222}
        h1{margin:0}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
        .r{text-align:right}.tot{font-weight:bold;font-size:1.1rem}.muted{color:#777}
        @media print{.noprint{display:none}}
      </style></head><body>
      <div style="display:flex;justify-content:space-between">
        <div><h1>${esc(CONFIG.storeName)}</h1><div class="muted">Tax invoice</div></div>
        <div style="text-align:right"><strong>Invoice #${esc(o.id)}</strong><br>
          <span class="muted">${new Date(o.createdAt).toLocaleString()}</span></div>
      </div>
      <p><strong>Bill to:</strong><br>${esc(o.customer.name)}<br>${esc(o.customer.phone)}<br>${esc(o.customer.address)}</p>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <table style="width:50%;margin-left:auto">
        <tr><td>Subtotal</td><td class="r">${money(o.totals.subtotal)}</td></tr>
        <tr><td>Tax</td><td class="r">${money(o.totals.tax)}</td></tr>
        <tr><td>Delivery</td><td class="r">${o.totals.delivery ? money(o.totals.delivery) : "FREE"}</td></tr>
        ${o.gift ? `<tr><td>Gift wrap</td><td class="r">${money(o.gift.fee)}</td></tr>` : ""}
        <tr class="tot"><td>Total</td><td class="r">${money(o.totals.total)}</td></tr>
      </table>
      <p class="muted">Payment: ${esc(o.payment.method)} (${esc(o.payment.status)}) · Ref ${esc(o.payment.ref)}</p>
      ${o.gift && o.gift.message ? `<p><strong>Gift message:</strong> ${esc(o.gift.message)}</p>` : ""}
      <button class="noprint" onclick="window.print()">Print / Save as PDF</button>
      </body></html>`);
    w.document.close();
  }

  function decorateAccountOrders() {
    document.querySelectorAll("[data-view]").forEach(b => {
      const row = b.parentElement;
      if (row && !row.querySelector("[data-invoice]")) {
        row.insertAdjacentHTML("beforeend",
          ` <button class="btn small" type="button" data-invoice="${esc(b.dataset.view)}">Invoice</button>`);
      }
    });
  }

  /* ================= PINCODE + SHARE (product page) ================= */
  function checkPin() {
    const pin = ($x("pinIn").value || "").trim();
    const res = $x("pinRes");
    if (!/^\d{6}$/.test(pin)) { res.textContent = "Enter a valid 6-digit pincode."; return; }
    const map = get(K.pins, {});
    if (!Object.keys(map).length) res.textContent = "✔ Standard delivery in 3–5 days.";
    else if (pin in map) res.textContent = `✔ Delivery available in ${map[pin]} day${map[pin] > 1 ? "s" : ""}.`;
    else res.textContent = "✖ Sorry, we don't deliver to this pincode yet.";
  }

  function extrasProduct() {
    const view = $x("productView");
    if (!view) return;
    view.querySelectorAll(".ex-product").forEach(n => n.remove());

    const pid = +new URLSearchParams(location.search).get("id");
    const p = getProducts().find(x => x.id === pid);
    if (!p) return;

    const tag = get(K.tags, {})[p.id];
    const h1 = view.querySelector(".pd-info h1");
    if (tag && h1) h1.insertAdjacentHTML("beforebegin", `<span class="ex-product tag-badge inline">${esc(tag)}</span>`);

    const acts = view.querySelector(".pd-actions");
    if (!acts) return;
    const url = location.href;
    acts.insertAdjacentHTML("afterend", `
      <div class="ex-product ex-pin">
        <strong>🚚 Check delivery</strong>
        <div class="row-wrap">
          <input id="pinIn" maxlength="6" inputmode="numeric" placeholder="Enter pincode">
          <button class="btn small primary" id="pinGo" type="button">Check</button>
        </div>
        <p id="pinRes" class="small"></p>
      </div>
      <div class="ex-product share-row">
        <span class="muted small">Share:</span>
        <a class="share" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(p.name + " " + url)}">WhatsApp</a>
        <a class="share" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${enc(url)}">Facebook</a>
        <button class="share" id="copyLink" type="button">Copy link</button>
      </div>`);
  }

  /* ================= PRODUCT TAGS ON CARDS ================= */
  function decorateTags() {
    const tags = get(K.tags, {});
    document.querySelectorAll(".card:not([data-exc])").forEach(card => {
      const add = card.querySelector("[data-add]");
      if (!add) return;
      card.dataset.exc = "1";
      const t = tags[add.dataset.add];
      const wrap = card.querySelector(".img-wrap");
      if (t && wrap) wrap.insertAdjacentHTML("beforeend", `<span class="tag-badge">${esc(t)}</span>`);
    });
  }

  function refreshTags() {
    document.querySelectorAll(".card[data-exc]").forEach(c => {
      c.removeAttribute("data-exc");
      c.querySelectorAll(".tag-badge").forEach(n => n.remove());
    });
    decorateTags();
  }

  /* ================= MY ACCOUNT: referral, credit, birthday ================= */
  function renderAccountExtras() {
    const main = document.querySelector(".acc-page");
    const u = getCurrentUser();
    if (!main || !u) return;

    let sec = $x("exAcc");
    if (!sec) {
      main.insertAdjacentHTML("beforeend", `<section class="acc-card" id="exAcc"></section>`);
      sec = $x("exAcc");
    }

    const now = new Date();
    const code = referralCodeFor(u);
    ensureReferral(u);
    const credit = (get(K.credit, {})[u.id]) || 0;
    const hasBM = typeof u.birthMonth === "number";
    const isBM = hasBM && u.birthMonth === now.getMonth();
    const bCode = birthdayCodeFor(u, now.getFullYear());
    if (isBM) {
      ensureCoupon({ code: bCode, type: "percent", value: 15, minOrder: 0,
        expires: lastDayOf(now.getFullYear(), now.getMonth()), active: true });
    }

    sec.innerHTML = `
      <h2>🎁 Refer &amp; earn</h2>
      <p>Share your code <strong>${esc(code)}</strong>. Friends get <strong>10% off</strong> their order.
         You earn <strong>${money(REWARD)}</strong> credit each time they order with it.</p>
      <p>Credit balance: <strong>${money(credit)}</strong>
         ${credit > 0 ? `<button class="btn small primary" type="button" data-redeem="1">Convert to coupon</button>` : ""}</p>

      <h2 style="margin-top:20px">🎂 Birthday offer</h2>
      <div class="row-wrap">
        <select id="bMonth" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:8px">
          <option value="">Select your birth month</option>
          ${MONTHS.map((m, i) => `<option value="${i}" ${hasBM && u.birthMonth === i ? "selected" : ""}>${m}</option>`).join("")}
        </select>
        <button class="btn small" id="bSave" type="button">Save</button>
      </div>
      ${isBM ? `<div class="ex-banner">🎉 Happy birthday month! Use code <strong>${bCode}</strong> for 15% off.</div>` : ""}`;
  }

  function saveBirthday() {
    const u = getCurrentUser();
    const v = $x("bMonth").value;
    if (!u) return;
    if (v === "") return toast("Choose your birth month.");
    updateUser(u.id, { birthMonth: +v });
    toast("Birthday saved. Look out for your offer!");
    renderAccountExtras();
  }

  function redeemCredit() {
    const u = getCurrentUser();
    if (!u) return;
    const cr = get(K.credit, {});
    const amt = cr[u.id] || 0;
    if (amt <= 0) return toast("No credit to redeem.");
    const code = "CR" + Math.random().toString(36).slice(2, 8).toUpperCase();
    ensureCoupon({ code, type: "fixed", value: amt, minOrder: 0, expires: "", active: true });
    cr[u.id] = 0;
    set(K.credit, cr);
    alert(`Your coupon code is ${code} (worth ${money(amt)}). Enter it in your cart.`);
    renderAccountExtras();
  }

  /* ================= SPIN THE WHEEL + EXIT POPUP ================= */
  function openSpin() {
    const b = $x("spinBox");
    if (b) b.classList.remove("hidden");
  }

  function spin() {
    const go = $x("spinGo");
    go.disabled = true;
    const idx = Math.floor(Math.random() * PRIZES.length);
    // Segment idx sits at the top pointer after this rotation
    $x("wheel").style.transform = `rotate(${5 * 360 + (360 - (idx * 90 + 45))}deg)`;
    setTimeout(() => {
      const pct = PRIZES[idx];
      const code = "SPIN" + Math.random().toString(36).slice(2, 7).toUpperCase();
      ensureCoupon({ code, type: "percent", value: pct, minOrder: 0, expires: addDays(7), active: true });
      set(K.spun, true);
      $x("spinRes").innerHTML = `🎉 You won <strong>${pct}% off</strong>! Your code: <strong>${code}</strong> (valid 7 days)`;
    }, 4200);
  }

  function setupExit() {
    document.addEventListener("mouseout", e => {
      if (e.relatedTarget || e.clientY > 0) return;
      if (sessionStorage.getItem("ex_exit") || !$x("exitBox")) return;
      if (!$x("spinBox").classList.contains("hidden")) return;
      sessionStorage.setItem("ex_exit", "1");
      ensureCoupon({ code: "STAY5", type: "percent", value: 5, minOrder: 0, expires: "", active: true });
      $x("exitBox").classList.remove("hidden");
    });
  }

  const MODALS = `
    <div id="spinBox" class="modal hidden">
      <div class="modal-box spin-box">
        <h2>🎡 Spin &amp; win a discount!</h2>
        <div class="wheel-wrap">
          <div class="pointer">▼</div>
          <div id="wheel" class="wheel"></div>
        </div>
        <p class="muted small">Prizes: 5%, 10%, 15% or 20% off. One spin per browser.</p>
        <button id="spinGo" class="btn primary big" type="button">Spin now</button>
        <p id="spinRes"></p>
        <button class="link" type="button" data-ex-close>Maybe later</button>
      </div>
    </div>
    <div id="exitBox" class="modal hidden">
      <div class="modal-box exit-box">
        <h2>Wait! Don't leave yet 🎁</h2>
        <p>Here's <strong>5% off</strong> your order.</p>
        <div class="ex-code"><strong>STAY5</strong>
          <button class="btn small" data-copy="STAY5" type="button">Copy code</button></div>
        <p class="muted small">Paste it into the coupon box in your cart.</p>
        <button class="btn primary" type="button" data-ex-close>Continue shopping</button>
      </div>
    </div>`;

  /* ================= ADMIN: DIFFS FOR ACTIVITY LOG ================= */
  function diffProducts(oldL, next) {
    if (!oldL.length) return; // first-time setup, nothing to compare
    const om = new Map(oldL.map(p => [p.id, p]));
    const nm = new Set(next.map(p => p.id));
    next.forEach(p => {
      const o = om.get(p.id);
      if (!o) { addActivity(`Added product "${p.name}" at ${money(p.price)}`); return; }
      if (o.price !== p.price) addActivity(`Price changed: "${p.name}" ${money(o.price)} → ${money(p.price)}`);
      if ((o.discount || 0) !== (p.discount || 0)) addActivity(`Discount changed: "${p.name}" ${o.discount || 0}% → ${p.discount || 0}%`);
      if (isOn(o) !== isOn(p)) addActivity(`"${p.name}" ${isOn(p) ? "shown on" : "hidden from"} the website`);
    });
    oldL.forEach(o => { if (!nm.has(o.id)) addActivity(`Deleted product "${o.name}"`); });
  }

  function diffOrders(oldL, next) {
    const om = new Map(oldL.map(o => [o.id, o]));
    next.forEach(o => {
      const prev = om.get(o.id);
      if (!prev) {
        attachGift(o);
        applyReferral(o);
        addActivity(`New order ${o.id} placed (${money(o.totals.total)})`);
        return;
      }
      if (normStatus(prev.status) !== normStatus(o.status)) {
        addActivity(`Order ${o.id} status: ${normStatus(prev.status)} → ${normStatus(o.status)}`);
      }
      if (prev.payment.status !== o.payment.status) {
        addActivity(`Order ${o.id} payment: ${prev.payment.status} → ${o.payment.status}`);
      }
    });
  }

  // Credits the referrer when an order is placed with their code
  function applyReferral(o) {
    const code = localStorage.getItem(K.applied);
    if (!code) return;
    const c = get(K.coupons, []).find(x => x.code === code);
    if (!c || !c.owner || c.owner === o.userId) return;
    o.referralCode = code;
    const cr = get(K.credit, {});
    cr[c.owner] = round2((cr[c.owner] || 0) + REWARD);
    set(K.credit, cr);
    addActivity(`Referral credit ${money(REWARD)} for customer #${c.owner} (code ${code})`);
  }

  function installWriteHook() {
    const origWrite = window.writeJSON;
    window.writeJSON = function (key, value) {
      try {
        if (key === KEYS.products && Array.isArray(value)) diffProducts(get(KEYS.products, []), value);
        if (key === KEYS.orders && Array.isArray(value)) diffOrders(get(KEYS.orders, []), value);
      } catch (err) {
        console.warn("Activity or referral step skipped:", err);
      }
      return origWrite(key, value);
    };
  }

  /* ================= ADMIN: TOOLS TAB ================= */
  function showPanel(id) {
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== id));
  }

  function renderTools() {
    const products = getProducts();
    const tags = get(K.tags, {});
    const pins = get(K.pins, {});
    const log = get(K.activity, []);

    $x("tab-tools").innerHTML = `
      <div class="acc-card">
        <h2>🏷️ Product tags</h2>
        <p class="muted small">Shown as a badge on product cards and product pages.</p>
        <table class="table">
          <thead><tr><th>Product</th><th>Tag</th></tr></thead>
          <tbody>${products.map(p => `
            <tr>
              <td>${esc(p.name)}</td>
              <td><select data-tag="${p.id}">
                <option value="">None</option>
                ${TAG_OPTIONS.map(t => `<option ${tags[p.id] === t ? "selected" : ""}>${t}</option>`).join("")}
              </select></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>

      <div class="acc-card">
        <h2>🚚 Pincode delivery</h2>
        <p class="muted small">With no pincodes added, every pincode gets standard delivery.
          Once you add some, only those pincodes are served.</p>
        <div class="row-wrap">
          <input id="pinNew" maxlength="6" placeholder="Pincode (6 digits)">
          <input id="pinDays" type="number" min="1" value="3" style="width:90px">
          <button class="btn primary" id="pinAdd" type="button">Add pincode</button>
        </div>
        <table class="table">
          ${Object.keys(pins).length
            ? Object.entries(pins).map(([k, v]) => `
              <tr><td>${esc(k)}</td><td>${v} day(s)</td>
                <td><button class="btn small danger" data-pindel="${esc(k)}" type="button">Remove</button></td></tr>`).join("")
            : `<tr><td>No pincodes added yet.</td></tr>`}
        </table>
      </div>

      <div class="acc-card">
        <h2>📥 Import products (CSV)</h2>
        <p class="muted small">Columns: name, category, price, discount, description, image, available.
          A row whose name matches an existing product updates it. Missing categories are created.
          "available" accepts yes/no, true/false or 1/0.</p>
        <input type="file" id="csvFile" accept=".csv,text/csv">
        <p class="muted small">Or paste CSV below:</p>
        <textarea id="csvText" rows="5" placeholder="name,category,price,discount,description,image,available
Red Shirt,Fashion,19.99,0,Cotton shirt,,yes"></textarea>
        <div style="margin-top:8px"><button class="btn primary" id="csvImport" type="button">Import</button></div>
      </div>

      <div class="acc-card">
        <div class="o-head">
          <h2 style="margin:0">📜 Activity log</h2>
          <button class="btn small danger" id="logClear" type="button">Clear log</button>
        </div>
        <table class="table" style="margin-top:12px">
          ${log.length
            ? log.map(l => `<tr><td><small>${new Date(l.at).toLocaleString()}</small></td><td>${esc(l.text)}</td></tr>`).join("")
            : `<tr><td>No activity yet.</td></tr>`}
        </table>
      </div>`;
  }

  function addPin() {
    const pin = ($x("pinNew").value || "").trim();
    const days = Math.max(1, parseInt($x("pinDays").value, 10) || 1);
    if (!/^\d{6}$/.test(pin)) return toast("Enter a 6-digit pincode.");
    const map = get(K.pins, {});
    map[pin] = days;
    set(K.pins, map);
    toast(`Pincode ${pin} added.`);
    renderTools();
  }

  function removePin(pin) {
    const map = get(K.pins, {});
    delete map[pin];
    set(K.pins, map);
    renderTools();
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }

  function importCSV() {
    const text = ($x("csvText").value || "").trim();
    if (!text) return toast("Paste CSV or choose a file first.");
    const rows = parseCSV(text);
    if (rows.length < 2) return toast("CSV needs a header row and at least one product.");

    const head = rows[0].map(h => h.trim().toLowerCase());
    const col = n => head.indexOf(n);
    if (col("name") < 0 || col("price") < 0) return toast("CSV must include name and price columns.");

    const list = getProducts();
    const cats = getCategories();
    let added = 0, updated = 0, skipped = 0;

    rows.slice(1).forEach(r => {
      const val = n => (col(n) >= 0 ? (r[col(n)] || "").trim() : "");
      const name = val("name");
      const price = parseFloat(val("price"));
      if (!name || !(price >= 0)) { skipped++; return; }

      const category = val("category") || cats[0].name;
      if (!cats.some(c => c.name.toLowerCase() === category.toLowerCase())) {
        cats.push({ name: category, icon: "🏷️" });
      }
      const avail = val("available");
      const data = {
        name,
        category,
        price,
        discount: clamp(parseFloat(val("discount")) || 0, 0, 100),
        description: val("description"),
        image: val("image") || PLACEHOLDER_IMG,
        available: avail === "" ? true : /^(yes|true|1|y)$/i.test(avail)
      };
      const existing = list.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (existing) { Object.assign(existing, data); updated++; }
      else { list.push({ id: nextId(list), ...data }); added++; }
    });

    saveCategories(cats);
    saveProducts(list);
    renderAll();
    renderTools();
    toast(`Imported: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}.`);
  }

  /* ================= ADMIN: ORDERS TAB ================= */
  function decorateOrders() {
    const list = $x("orderList");
    if (!list) return;

    if (!$x("bulkBar")) {
      list.insertAdjacentHTML("beforebegin", `
        <div id="bulkBar" class="bulk-bar">
          <button class="btn small" id="pickAll" type="button">Select all</button>
          <select id="bulkStatus">
            ${ORDER_STATUSES.filter(s => s !== "cancelled").map(s => `<option>${s}</option>`).join("")}
          </select>
          <button class="btn small primary" id="bulkApply" type="button">Set status for selected</button>
        </div>`);
    }

    const orders = getOrders();
    list.querySelectorAll(".order[data-order]:not([data-exo])").forEach(card => {
      card.dataset.exo = "1";
      const id = card.dataset.order;
      const o = orders.find(x => x.id === id) || {};

      card.insertAdjacentHTML("afterbegin",
        `<label class="pick"><input type="checkbox" data-pick="${esc(id)}"> Select</label>`);

      let extra = "";
      if (o.gift) extra += `<div class="ex-note">🎁 Gift wrap${o.gift.message ? `: “${esc(o.gift.message)}”` : ""}</div>`;
      if (o.referralCode) extra += `<div class="ex-note">🎁 Referral code used: ${esc(o.referralCode)}</div>`;

      card.insertAdjacentHTML("beforeend", extra + `
        <div class="o-acts">
          <button class="btn small danger" type="button" data-cancelo="${esc(id)}">Cancel &amp; restock</button>
          <button class="btn small" type="button" data-refundo="${esc(id)}">Mark refunded</button>
        </div>`);
    });
  }

  function restockOrder(o) {
    const stock = get(K.stock, {});
    const products = getProducts();
    o.items.forEach(i => {
      const p = products.find(x => x.name === i.name);
      if (p && p.id in stock) stock[p.id] += i.qty;
    });
    set(K.stock, stock);
  }

  function cancelOrder(id) {
    const orders = getOrders();
    const o = orders.find(x => x.id === id);
    if (!o) return;
    if (normStatus(o.status) === "cancelled") return toast("This order is already cancelled.");
    if (!confirm(`Cancel order ${id} and return its items to stock?`)) return;

    restockOrder(o);
    o.history = [...(o.history || []), { status: "cancelled", at: new Date().toISOString() }];
    o.status = "cancelled";
    saveOrders(orders);
    renderOrders();
    toast(`Order ${id} cancelled and stock restored. Use "Mark refunded" if it was paid online.`);
  }

  function markRefunded(id) {
    const orders = getOrders();
    const o = orders.find(x => x.id === id);
    if (!o) return;
    if (o.payment.status === "refunded") return toast("This order is already marked refunded.");
    o.payment.status = "refunded";
    saveOrders(orders);
    renderOrders();
    toast(`Order ${id} marked as refunded.`);
  }

  function bulkApply() {
    const status = $x("bulkStatus").value;
    const ids = [...document.querySelectorAll("[data-pick]:checked")].map(c => c.dataset.pick);
    if (!ids.length) return toast("Select at least one order.");
    const orders = getOrders();
    let n = 0;
    orders.forEach(o => {
      if (ids.includes(o.id) && normStatus(o.status) !== status) {
        o.history = [...(o.history || []), { status, at: new Date().toISOString() }];
        o.status = status;
        n++;
      }
    });
    saveOrders(orders);
    renderOrders();
    toast(`${n} order(s) set to ${status}.`);
  }

  /* ================= ADMIN: DASHBOARD INSIGHTS ================= */
  function drawChart() {
    const cv = $x("salesChart");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, P = 30;
    ctx.clearRect(0, 0, W, H);

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const orders = getOrders();
    const totals = days.map(d => orders
      .filter(o => normStatus(o.status) !== "cancelled" && new Date(o.createdAt).toDateString() === d.toDateString())
      .reduce((s, o) => s + o.totals.total, 0));

    const max = Math.max(1, ...totals);
    const bw = (W - P * 2) / days.length;
    ctx.font = "11px system-ui";
    totals.forEach((v, i) => {
      const h = (v / max) * (H - P * 2);
      const x = P + i * bw + bw * 0.15;
      const y = H - P - h;
      ctx.fillStyle = "#ff6a00";
      ctx.fillRect(x, y, bw * 0.7, h);
      ctx.fillStyle = "#888";
      ctx.fillText(String(days[i].getDate()), x, H - P + 14);
      if (v > 0) ctx.fillText(String(Math.round(v)), x, y - 4);
    });
    ctx.strokeStyle = "#ccc";
    ctx.beginPath();
    ctx.moveTo(P, H - P);
    ctx.lineTo(W - P, H - P);
    ctx.stroke();
  }

  function stockDraft() {
    const stock = get(K.stock, {});
    const low = getProducts().filter(p => p.id in stock && stock[p.id] <= 5);
    if (!low.length) return "All tracked items have healthy stock. No reorder needed right now.";
    return `Hello,

Please arrange restocking for the following items at ${CONFIG.storeName}:

${low.map(p => `- ${p.name} (${p.category}): ${stock[p.id]} left`).join("\n")}

Please share the expected delivery date.

Thank you,
${CONFIG.storeName} team`;
  }

  function mountInsights() {
    const tab = $x("tab-dash");
    if (!tab || $x("exInsights")) return;
    tab.insertAdjacentHTML("beforeend", `
      <section class="acc-card" id="exInsights">
        <h2>📈 Sales (last 14 days)</h2>
        <canvas id="salesChart" width="700" height="240"></canvas>
        <h2 style="margin-top:18px">📧 Low-stock supplier email</h2>
        <textarea id="stockDraft" rows="9"></textarea>
        <div class="bulk" style="margin-top:8px">
          <button class="btn" id="refreshDraft" type="button">Refresh</button>
          <button class="btn primary" id="copyDraft" type="button">Copy email</button>
        </div>
      </section>`);
    drawChart();
    $x("stockDraft").value = stockDraft();
  }

  /* ================= EVENT HANDLERS ================= */
  function customerClick(e) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === "spinBox" || t.id === "exitBox") return t.classList.add("hidden");
    if (t.hasAttribute("data-ex-close")) return t.closest(".modal").classList.add("hidden");
    if (t.closest("[data-ex-cart]")) return window.openCart();
    if (t.closest("[data-ex-hide]")) {
      sessionStorage.setItem("ex_abandon_hidden", "1");
      return refreshAbandon();
    }
    const inv = t.closest("[data-invoice]");
    if (inv) return openInvoice(inv.dataset.invoice);
    if (t.id === "pinGo") return checkPin();
    if (t.id === "copyLink") return copyText(location.href, "Link copied!");
    if (t.closest("[data-redeem]")) return redeemCredit();
    if (t.id === "bSave") return saveBirthday();
    if (t.id === "spinGo") return spin();
    const cp = t.closest("[data-copy]");
    if (cp) return copyText(cp.dataset.copy, "Code copied!");
  }

  function customerChange(e) {
    if (e.target.id === "giftChk") {
      const m = $x("giftMsg");
      set(K.gift, { on: e.target.checked, msg: m ? m.value : "" });
      if (hasApp) window.renderCart();
    }
  }

  function customerInput(e) {
    if (e.target.id === "giftMsg") set(K.gift, { on: giftState().on, msg: e.target.value });
  }

  function adminClick(e) {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === "bulkApply") return bulkApply();
    if (t.id === "pickAll") {
      document.querySelectorAll("[data-pick]").forEach(c => { c.checked = true; });
      return;
    }
    const cancel = t.closest("[data-cancelo]");
    if (cancel) return cancelOrder(cancel.dataset.cancelo);
    const refund = t.closest("[data-refundo]");
    if (refund) return markRefunded(refund.dataset.refundo);
    if (t.id === "pinAdd") return addPin();
    const pd = t.closest("[data-pindel]");
    if (pd) return removePin(pd.dataset.pindel);
    if (t.id === "csvImport") return importCSV();
    if (t.id === "logClear") {
      if (confirm("Clear the activity log?")) { set(K.activity, []); renderTools(); }
      return;
    }
    if (t.id === "refreshDraft") { $x("stockDraft").value = stockDraft(); return; }
    if (t.id === "copyDraft") return copyText($x("stockDraft").value, "Email copied.");
  }

  function adminChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.tag) {
      const tags = get(K.tags, {});
      if (t.value) tags[t.dataset.tag] = t.value;
      else delete tags[t.dataset.tag];
      set(K.tags, tags);
      toast("Tag saved.");
      return;
    }
    if (t.id === "csvFile" && t.files[0]) {
      t.files[0].text().then(txt => { $x("csvText").value = txt; });
    }
  }

  function setupAdmin() {
    const nav = document.querySelector(".tabs");
    const panels = document.querySelectorAll(".panel");
    if (!nav || !panels.length) return;

    nav.insertAdjacentHTML("beforeend", `<button class="tab" type="button" data-ex="tools">🧰 Tools</button>`);
    panels[panels.length - 1].insertAdjacentHTML("afterend", `<section id="tab-tools" class="panel hidden"></section>`);

    nav.addEventListener("click", e => {
      const b = e.target.closest("[data-ex]");
      if (!b) return;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === b));
      showPanel("tab-tools");
      renderTools();
    });

    const dash = $x("tab-dash");
    if (dash) {
      new MutationObserver(mountInsights).observe(dash, { childList: true });
      mountInsights();
    }

    const list = $x("orderList");
    if (list) {
      new MutationObserver(decorateOrders).observe(list, { childList: true });
      decorateOrders();
    }

    document.addEventListener("click", adminClick);
    document.addEventListener("change", adminChange);
    window.addEventListener("storage", e => {
      if (e.key === K.activity && !$x("tab-tools").classList.contains("hidden")) renderTools();
    });
  }

  /* ================= START ================= */
  function init() {
    installWriteHook();

    if (isAdminPage) {
      setupAdmin();
      return;
    }

    document.body.insertAdjacentHTML("beforeend", MODALS);

    const main = document.querySelector("main");
    if (main && (page === "home" || page === "shop") && !$x("exTop")) {
      main.insertAdjacentHTML("afterbegin", `<div id="exTop"></div>`);
    }
    if (main && page === "home" && !$x("exRestock")) {
      main.insertAdjacentHTML("beforeend", `<div id="exRestock"></div>`);
    }

    if (hasApp) setupCart();
    const u = getCurrentUser();
    if (u) ensureReferral(u);

    injectGift();
    syncGift();
    decorateTags();
    new MutationObserver(decorateTags).observe(document.body, { childList: true, subtree: true });

    if (hasApp && page === "product") {
      const baseProduct = window.renderProduct;
      window.renderProduct = function () { baseProduct(); extrasProduct(); };
      extrasProduct();
    }

    if (onAccount) {
      renderAccountExtras();
      const orders = $x("myOrders");
      if (orders) {
        decorateAccountOrders();
        new MutationObserver(decorateAccountOrders).observe(orders, { childList: true, subtree: true });
      }
    }

    refreshAbandon();
    renderRestock();

    if (page === "home" && !get(K.spun, false) && !sessionStorage.getItem("ex_spin_seen")) {
      setTimeout(() => {
        sessionStorage.setItem("ex_spin_seen", "1");
        openSpin();
      }, 3000);
    }
    if (["home", "shop", "product"].includes(page)) setupExit();

    document.addEventListener("click", customerClick);
    document.addEventListener("change", customerChange);
    document.addEventListener("input", customerInput);

    window.addEventListener("storage", e => {
      if (e.key === K.tags) { refreshTags(); extrasProduct(); }
      if ([KEYS.orders, KEYS.users, K.coupons, K.credit, KEYS.session].includes(e.key)) {
        renderAccountExtras();
        renderRestock();
      }
      if (e.key === KEYS.cart) refreshAbandon();
    });
  }

  init();
})();