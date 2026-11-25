const $ = id => document.getElementById(id);
const PAGE = document.body.dataset.page;   // "home", "shop", or "product"
let shopState = { cat: "All", q: "", sort: "default" };
let slideIdx = 0, slideTimer = null;

// Cart drawer, checkout modal, toast, footer: added to every page automatically
const UI_HTML = `
<aside id="cartDrawer" class="drawer">
  <div class="drawer-head"><h2>Your Cart</h2><button id="closeCart" aria-label="Close">✕</button></div>
  <div id="cartItems" class="cart-items"></div>
  <div id="summary" class="summary"></div>
  <button id="checkoutBtn" class="btn primary full" style="margin-top:12px">Checkout</button>
</aside>
<div id="overlay" class="overlay"></div>

<div id="checkoutModal" class="modal hidden">
  <div class="modal-box">
    <h2>Checkout</h2>
    <form id="checkoutForm">
      <input name="name" placeholder="Full name" required>
      <input name="phone" placeholder="Phone number" required>
      <textarea name="address" rows="2" placeholder="Delivery address" required></textarea>

      <label>Payment method
        <select name="method" id="payMethod">
          <option value="card">Debit / Credit card</option>
          <option value="upi">UPI (QR code or UPI ID)</option>
          <option value="netbanking">Netbanking</option>
          <option value="cod">Cash on delivery</option>
        </select>
      </label>

      <!-- Shown for all online payments -->
      <div id="onlineFields">
        <input name="payerName" placeholder="Name on card / account holder">
      </div>

      <!-- UPI options -->
      <div id="upiFields" class="hidden">
        <label>UPI option
          <select name="upiMode" id="upiMode">
            <option value="qr">Scan QR code (recommended)</option>
            <option value="id">Enter UPI ID</option>
          </select>
        </label>
        <input name="upiId" id="upiId" class="hidden" placeholder="Your UPI ID, e.g. name@okaxis">
      </div>

      <p class="muted small" id="payHint">
        Card details are entered in Razorpay's secure window. This site never receives or stores them.
      </p>

      <div id="payTotal" class="pay-total"></div>
      <p id="payError" class="error"></p>

      <div class="row">
        <button type="button" id="cancelCheckout" class="btn">Cancel</button>
        <button type="submit" class="btn primary">Pay &amp; Place Order</button>
      </div>
    </form>
  </div>
</div>

<div id="toast" class="toast hidden"></div>

<footer class="site-footer">
  <p>&copy; <span id="year"></span> <span id="footerName"></span>. All rights reserved.</p>
  <p><a href="admin.html" class="admin-link">Admin Login</a></p>
</footer>`;
document.body.insertAdjacentHTML("beforeend", UI_HTML);

/* ================= PRODUCT CARD ================= */
function productUrl(id) { return "product.html?id=" + id; }

function productCard(p) {
  const fp = finalPrice(p);
  const d = p.discount || 0;
  const link = productUrl(p.id);
  return `
    <article class="card">
      <a class="img-wrap" href="${link}">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"
             onerror="this.src='${PLACEHOLDER_IMG}'">
        ${d > 0 ? `<span class="badge">-${d}%</span>` : ""}
      </a>
      <div class="card-body">
        <small class="cat-tag">${esc(p.category)}</small>
        <h3><a class="title-link" href="${link}">${esc(p.name)}</a></h3>
        <p class="desc">${esc(p.description || "")}</p>
        <div class="card-foot">
          <div class="price">
            ${d > 0 ? `<s>${money(p.price)}</s>` : ""}
            <strong>${money(fp)}</strong>
          </div>
          <button class="btn primary" data-add="${p.id}">Add</button>
        </div>
      </div>
    </article>`;
}

/* ================= NAVIGATION ================= */
function renderNav() {
  const nav = $("catNav");
  if (!nav) return;
  const active = PAGE === "home" ? "home" : shopState.cat;
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? "on" : ""}">${label}</a>`;

  nav.innerHTML =
    link("index.html", "🏠 Home", "home") +
    getCategories().map(c =>
      link("shop.html?cat=" + encodeURIComponent(c.name), `${esc(c.icon || "")} ${esc(c.name)}`, c.name)
    ).join("") +
    link("shop.html", "All Products", "All");
}

/* ================= HOMEPAGE ================= */
function showSlide(n) {
  const slides = document.querySelectorAll("#slider .slide");
  if (!slides.length) return;
  slideIdx = (n + slides.length) % slides.length;
  slides.forEach((s, i) => s.classList.toggle("on", i === slideIdx));
  document.querySelectorAll("#slider .dots span").forEach((d, i) => d.classList.toggle("on", i === slideIdx));
}

function startSlide() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => showSlide(slideIdx + 1), 4000);
}

function renderSlider() {
  const slides = getSlides().filter(s => s.active);
  const box = $("slider");
  clearInterval(slideTimer);

  if (!slides.length) {
    box.innerHTML = `<div class="slide-empty">No slides yet. Add some from the admin panel.</div>`;
    return;
  }

  box.innerHTML = slides.map(s => `
    <div class="slide">
      <img src="${esc(s.image)}" alt="${esc(s.title)}" onerror="this.src='${PLACEHOLDER_IMG}'">
      <div class="slide-text">
        <h2>${esc(s.title)}</h2>
        <p>${esc(s.subtitle || "")}</p>
        ${s.link ? `<a class="btn primary" href="${esc(s.link)}">${esc(s.buttonText || "Shop now")}</a>` : ""}
      </div>
    </div>`).join("") +
    `<button class="arrow prev" id="prevSlide" aria-label="Previous">‹</button>
     <button class="arrow next" id="nextSlide" aria-label="Next">›</button>
     <div class="dots">${slides.map((_, i) => `<span data-dot="${i}"></span>`).join("")}</div>`;

  showSlide(0);
  if (slides.length > 1) startSlide();
}

function renderHome() {
  renderSlider();
  const cats = getCategories();
  const products = getProducts();

  $("catTiles").innerHTML = cats.map(c => {
    const n = products.filter(p => isOn(p) && p.category === c.name).length;
    return `
      <a class="tile" href="shop.html?cat=${encodeURIComponent(c.name)}">
        <span class="tile-icon">${esc(c.icon || "🏷️")}</span>
        <strong>${esc(c.name)}</strong>
        <small>${n} item${n === 1 ? "" : "s"}</small>
      </a>`;
  }).join("");

  const deals = products.filter(p => isOn(p) && (p.discount || 0) > 0).slice(0, 8);
  $("deals").innerHTML = deals.length ? deals.map(productCard).join("")
    : `<p class="empty">No deals right now.</p>`;
}

function initHome() {
  const slider = $("slider");
  slider.addEventListener("click", e => {
    const t = e.target;
    if (t.id === "prevSlide") showSlide(slideIdx - 1);
    else if (t.id === "nextSlide") showSlide(slideIdx + 1);
    else if (t.dataset.dot !== undefined) showSlide(+t.dataset.dot);
    else return;
    startSlide();
  });
  slider.addEventListener("mouseenter", () => clearInterval(slideTimer));
  slider.addEventListener("mouseleave", startSlide);
}

/* ================= SHOP / CATEGORY PAGE ================= */
function renderShop() {
  const cats = getCategories();
  const s = shopState;
  const cur = cats.find(c => c.name === s.cat);

  $("pageTitle").textContent = s.cat === "All" ? "All Products" : `${cur?.icon || ""} ${s.cat}`.trim();
  document.title = `${s.cat === "All" ? "All Products" : s.cat} · ${CONFIG.storeName}`;

  $("catPills").innerHTML = ["All", ...cats.map(c => c.name)].map(n =>
    `<button class="pill ${n === s.cat ? "on" : ""}" data-cat="${esc(n)}">${esc(n)}</button>`
  ).join("");

  const q = s.q.trim().toLowerCase();
  const list = getProducts().filter(p =>
    isOn(p) &&
    (s.cat === "All" || p.category === s.cat) &&
    (!q || `${p.name} ${p.description || ""} ${p.category}`.toLowerCase().includes(q))
  );

  const sorters = {
    priceAsc: (a, b) => finalPrice(a) - finalPrice(b),
    priceDesc: (a, b) => finalPrice(b) - finalPrice(a),
    discount: (a, b) => (b.discount || 0) - (a.discount || 0)
  };
  if (sorters[s.sort]) list.sort(sorters[s.sort]);

  $("shopGrid").innerHTML = list.length ? list.map(productCard).join("")
    : `<p class="empty">No products found.</p>`;
  renderNav();
}

function initShop() {
  const params = new URLSearchParams(location.search);
  shopState.cat = params.get("cat") || "All";
  shopState.q = params.get("q") || "";
  $("search").value = shopState.q;

  $("catPills").onclick = e => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    shopState.cat = b.dataset.cat;
    history.replaceState(null, "", shopState.cat === "All" ? "shop.html"
      : "shop.html?cat=" + encodeURIComponent(shopState.cat));
    renderShop();
  };
  $("sortSel").onchange = e => { shopState.sort = e.target.value; renderShop(); };
  $("search").oninput = e => { shopState.q = e.target.value; renderShop(); };
}

/* ================= LOGIN LINK AND HEADER ICON ================= */
function loginUrl() {
  const here = location.pathname.split("/").pop() + location.search;
  return "login.html?next=" + encodeURIComponent(here);
}

// Shows a 👤 icon between the search bar and the cart button on every page
function renderAuthLink() {
  const cartBtn = $("cartBtn");
  if (!cartBtn) return;

  let a = $("authLink");
  if (!a) {
    a = document.createElement("a");
    a.id = "authLink";
    cartBtn.parentNode.insertBefore(a, cartBtn);
  }

  const u = getCurrentUser();
  a.className = "icon-btn";
  a.href = u ? "account.html" : loginUrl();

  const label = u ? u.name.split(" ")[0] : "Login";
  a.title = u ? `My account (${u.name})` : "Login to view your account and orders";
  a.setAttribute("aria-label", a.title);
  a.innerHTML = `<span class="icon">👤</span><span class="icon-label">${esc(label)}</span>`;
}

/* ================= CART ================= */
function addToCart(id, qty = 1) {
  const p = getProducts().find(x => x.id === id);
  if (!p || !isOn(p)) return toast("Sorry, this item is unavailable.");
  const cart = getCart();
  const line = cart.find(l => l.id === id);
  if (line) line.qty += qty; else cart.push({ id, qty });
  saveCart(cart);
  renderCart();
  toast(`${p.name} added to cart`);
}

function changeQty(id, delta) {
  const cart = getCart();
  const line = cart.find(l => l.id === id);
  if (!line) return;
  line.qty += delta;
  saveCart(cart.filter(l => l.qty > 0));
  renderCart();
}

function removeLine(id) {
  saveCart(getCart().filter(l => l.id !== id));
  renderCart();
}

// Uses CURRENT product prices, so admin changes apply instantly
function cartDetails() {
  const products = getProducts();
  const lines = getCart().map(l => {
    const p = products.find(x => x.id === l.id);
    return p && isOn(p) ? { p, qty: l.qty } : null;
  }).filter(Boolean);

  const subtotal = lines.reduce((s, l) => s + finalPrice(l.p) * l.qty, 0);
  const original = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const savings = original - subtotal;
  const tax = subtotal * CONFIG.taxRate;
  const delivery = !lines.length ? 0 : (subtotal >= CONFIG.freeDeliveryAbove ? 0 : CONFIG.deliveryFee);
  const total = subtotal + tax + delivery;
  const count = lines.reduce((s, l) => s + l.qty, 0);
  return { lines, subtotal, savings, tax, delivery, total, count };
}

function renderCart() {
  const d = cartDetails();
  $("cartCount").textContent = d.count;

  $("cartItems").innerHTML = d.lines.length
    ? d.lines.map(l => `
      <div class="cart-line">
        <img src="${esc(l.p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
        <div class="grow">
          <strong>${esc(l.p.name)}</strong>
          <div>${money(finalPrice(l.p))} each</div>
          <div class="qty">
            <button data-dec="${l.p.id}">−</button>
            <span>${l.qty}</span>
            <button data-inc="${l.p.id}">+</button>
            <button class="link" data-rm="${l.p.id}">Remove</button>
          </div>
        </div>
        <div>${money(finalPrice(l.p) * l.qty)}</div>
      </div>`).join("")
    : `<p class="empty">Your cart is empty.</p>`;

  $("summary").innerHTML = `
    <div><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${d.savings > 0.005 ? `<div class="save"><span>You save</span><span>${money(d.savings)}</span></div>` : ""}
    <div><span>Tax (${CONFIG.taxRate * 100}%)</span><span>${money(d.tax)}</span></div>
    <div><span>Delivery</span><span>${d.delivery === 0 && d.lines.length ? "FREE" : money(d.delivery)}</span></div>
    <div class="total"><span>Total</span><span>${money(d.total)}</span></div>`;

  $("checkoutBtn").disabled = !d.lines.length;
}

function openCart() { $("cartDrawer").classList.add("open"); $("overlay").classList.add("show"); }
function closeCart() { $("cartDrawer").classList.remove("open"); $("overlay").classList.remove("show"); }

/* ================= PRODUCT DETAIL PAGE ================= */
let pdQty = 1;
let pdProduct = null;

function setQty(n) {
  pdQty = clamp(n, 1, 10);
  const el = $("qtyVal");
  if (el) el.textContent = pdQty;
}

function renderProduct() {
  const id = +new URLSearchParams(location.search).get("id");
  const p = getProducts().find(x => x.id === id);
  const view = $("productView");
  if (!view) return;

  if (!p) {
    pdProduct = null;
    $("crumbs").innerHTML = `<a href="index.html">Home</a> / Product not found`;
    view.innerHTML = `
      <div class="pd-missing">
        <h2>Product not found</h2>
        <p>This product may have been removed.</p>
        <a class="btn primary" href="shop.html">Browse products</a>
      </div>`;
    $("related").innerHTML = "";
    return;
  }

  pdProduct = p;
  document.title = `${p.name} · ${CONFIG.storeName}`;

  const fp = finalPrice(p);
  const d = p.discount || 0;
  const saved = p.price - fp;
  const available = isOn(p);
  const gallery = [p.image, ...(p.images || [])].filter(Boolean);
  const specs = p.specs || [];

  $("crumbs").innerHTML =
    `<a href="index.html">Home</a> / ` +
    `<a href="shop.html?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a> / ${esc(p.name)}`;

  view.innerHTML = `
    <div class="gallery">
      <img id="mainImg" class="main-img" src="${esc(gallery[0] || PLACEHOLDER_IMG)}"
           alt="${esc(p.name)}" onerror="this.src='${PLACEHOLDER_IMG}'">
      ${gallery.length > 1 ? `
        <div class="thumbs">
          ${gallery.map((g, i) => `
            <img src="${esc(g)}" alt="" data-thumb="${i}" class="${i === 0 ? "on" : ""}"
                 onerror="this.src='${PLACEHOLDER_IMG}'">`).join("")}
        </div>` : ""}
    </div>

    <div class="pd-info">
      <small class="cat-tag">${esc(p.category)}</small>
      <h1>${esc(p.name)}</h1>

      <div class="pd-price">
        ${d > 0 ? `<span class="mrp">${money(p.price)}</span>` : ""}
        <span class="now">${money(fp)}</span>
        ${d > 0 ? `<span class="off">${d}% off</span>` : ""}
        ${saved > 0.005 ? `<div class="save-line">You save ${money(saved)} per unit</div>` : ""}
        <small class="muted">Inclusive of all taxes. Tax (${CONFIG.taxRate * 100}%) is added at checkout.</small>
      </div>

      <p class="${available ? "stock-ok" : "stock-no"}">
        ${available ? "✔ In stock" : "✖ Currently unavailable"}
      </p>

      <div class="pd-actions">
        <div class="qty-box">
          <button data-qdec aria-label="Decrease">−</button>
          <span id="qtyVal">${pdQty}</span>
          <button data-qinc aria-label="Increase">+</button>
        </div>
        <button id="addBtn" class="btn primary big" ${available ? "" : "disabled"}>Add to Cart</button>
        <button id="buyBtn" class="btn buy big" ${available ? "" : "disabled"}>Buy Now</button>
      </div>

      <ul class="perks">
        <li>🚚 Free delivery on orders above ${money(CONFIG.freeDeliveryAbove)}</li>
        <li>↩ Easy returns</li>
        <li>🔒 Secure payment via Razorpay</li>
      </ul>
    </div>

    <div class="pd-section">
      <h2>Description</h2>
      <p>${esc(p.description || "No description provided.")}</p>
    </div>

    <div class="pd-section">
      <h2>Specifications</h2>
      ${specs.length
        ? `<table class="spec-table">
            ${specs.map(s => `<tr><th>${esc(s.k)}</th><td>${esc(s.v)}</td></tr>`).join("")}
           </table>`
        : `<p class="muted">No specifications added yet.</p>`}
    </div>`;

  // Related products: same category, excluding this one
  const related = getProducts()
    .filter(x => isOn(x) && x.category === p.category && x.id !== p.id)
    .slice(0, 4);
  $("related").innerHTML = related.length
    ? related.map(productCard).join("")
    : `<p class="empty">No related products.</p>`;
}

function initProduct() {
  $("productView").addEventListener("click", e => {
    const t = e.target;

    if (t.dataset.thumb !== undefined) {
      $("mainImg").src = t.src;
      document.querySelectorAll("[data-thumb]").forEach(x => x.classList.toggle("on", x === t));
      return;
    }
    if (t.hasAttribute("data-qinc")) return setQty(pdQty + 1);
    if (t.hasAttribute("data-qdec")) return setQty(pdQty - 1);
    if (t.id === "addBtn" && pdProduct) return addToCart(pdProduct.id, pdQty);
    if (t.id === "buyBtn" && pdProduct) {
      addToCart(pdProduct.id, pdQty);
      openCheckout();
    }
  });
}

/* ================= CHECKOUT VALIDATION ================= */
function validateCheckout(d) {
  if (!d.name?.trim()) return "Please enter your name.";
  if (!/^[0-9+\- ]{7,15}$/.test(d.phone || "")) return "Enter a valid phone number.";
  if (!d.address?.trim()) return "Please enter a delivery address.";

  if (d.method !== "cod" && !d.payerName?.trim()) {
    return "Enter the name on your card or account.";
  }
  if (d.method === "upi" && d.upiMode === "id") {
    if (!/^[\w.\-]{2,256}@[a-z]{2,64}$/i.test((d.upiId || "").trim())) {
      return "Enter a valid UPI ID, such as name@okaxis.";
    }
  }
  return "";
}

/* ================= CHECKOUT MODAL ================= */
function openCheckout() {
  const d = cartDetails();
  if (!d.lines.length) return;

  const user = getCurrentUser();
  if (!user) {
    toast("Please log in to place your order.");
    setTimeout(() => (location.href = loginUrl()), 900);
    return;
  }

  const form = $("checkoutForm");
  form.querySelector('[name="name"]').value = user.name || "";
  form.querySelector('[name="phone"]').value = user.phone || "";
  form.querySelector('[name="address"]').value = user.address || "";
  form.querySelector('[name="payerName"]').value = user.name || "";

  $("payTotal").textContent = `Amount to pay: ${money(round2(d.total))}`;
  $("payError").textContent = "";
  bindCheckoutEvents();
  syncPayFields();
  $("checkoutModal").classList.remove("hidden");
  closeCart();
}

function closeCheckout() { $("checkoutModal").classList.add("hidden"); }

// Show or hide fields depending on the chosen payment method
function syncPayFields() {
  const m = $("payMethod").value;
  const mode = $("upiMode").value;
  $("onlineFields").classList.toggle("hidden", m === "cod");
  $("payHint").classList.toggle("hidden", m === "cod");
  $("upiFields").classList.toggle("hidden", m !== "upi");
  $("upiId").classList.toggle("hidden", !(m === "upi" && mode === "id"));
}

async function handleCheckout(e) {
  e.preventDefault();
  const user = getCurrentUser();
  if (!user) { location.href = loginUrl(); return; }

  const form = e.target;
  const data = Object.fromEntries(new FormData(form).entries());

  const err = validateCheckout(data);
  $("payError").textContent = err;
  if (err) return;

  const d = cartDetails();
  if (!d.lines.length) { $("payError").textContent = "Your cart is empty."; return; }
  const amount = round2(d.total);

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    const payment = data.method === "cod"
      ? { status: "pending", ref: "COD-" + Date.now() }
      : await payWithRazorpay(amount, {
          name: data.payerName || data.name,
          phone: data.phone,
          email: user.email,
          method: data.method,
          upiMode: data.upiMode || "qr",
          upiId: data.upiId || ""
        });

    const now = new Date().toISOString();
    const order = {
      id: "ORD-" + Date.now().toString(36).toUpperCase(),
      createdAt: now,
      userId: user.id,
      email: user.email,
      customer: { name: data.name, phone: data.phone, address: data.address },
      items: d.lines.map(l => ({ name: l.p.name, category: l.p.category, qty: l.qty, unitPrice: finalPrice(l.p) })),
      totals: { subtotal: round2(d.subtotal), tax: round2(d.tax), delivery: d.delivery, total: amount },
      payment: { method: data.method, status: payment.status, ref: payment.ref },
      status: "placed",
      delivery: { partner: "", trackingId: "", expectedDate: "" },
      history: [{ status: "placed", at: now }]
    };

    const orders = getOrders();
    orders.push(order);
    saveOrders(orders);
    if (typeof reserveStock === "function") reserveStock(order);

    updateUser(user.id, { phone: data.phone, address: data.address });

    saveCart([]);
    renderCart();
    form.reset();
    closeCheckout();

    alert(`Thank you, ${user.name}! Order ${order.id} placed. Total: ${money(amount)}`);
    if (confirm("Track your delivery in My Account now?")) location.href = "account.html";
  } catch (ex) {
    $("payError").textContent = "Payment failed: " + ex.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Pay & Place Order";
  }
}

/* ================= PAYMENT (Razorpay) ================= */
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load Razorpay. Check your internet connection."));
    document.body.appendChild(s);
  });
}

// Opens the Razorpay screen for the chosen method.
// Card -> card entry fields. UPI -> QR code (or UPI ID). Netbanking -> bank list.
function razorpayConfigFor(method, upiMode) {
  const blocks = {
    card: {
      name: "Pay with Card",
      instruments: [{ method: "card" }]
    },
    upi: {
      name: "Pay with UPI",
      instruments: upiMode === "id"
        ? [{ method: "upi", flows: ["collect"] }]
        : [{ method: "upi", flows: ["qr"] }]
    },
    netbanking: {
      name: "Pay with Netbanking",
      instruments: [{ method: "netbanking" }]
    }
  };
  const block = blocks[method];
  if (!block) return undefined;
  const key = method + "_block";
  return {
    display: {
      blocks: { [key]: block },
      sequence: ["block." + key],
      preferences: { show_default_blocks: false }
    }
  };
}

async function payWithRazorpay(amount, customer) {
  await loadRazorpayScript();

  // Step 1: ask the server to create a Razorpay order
  let res;
  try {
    res = await fetch(CONFIG.paymentServer + "/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount })
    });
  } catch {
    throw new Error("Cannot reach the payment server. Is server.js running (npm start)?");
  }
    if (!res.ok) {
    const raw = await res.text();
    let reason = "";
    try { reason = JSON.parse(raw).error || ""; } catch { reason = raw.slice(0, 120); }
    throw new Error(`Server error ${res.status}: ${reason || "no details"}`);
  } const order = await res.json();

  // Step 2: open the Razorpay popup on the chosen screen
  return new Promise((resolve, reject) => {
    const prefill = {
      name: customer.name,
      contact: customer.phone,
      email: customer.email || ""
    };
    if (customer.method === "upi" && customer.upiMode === "id" && customer.upiId) {
      prefill.vpa = customer.upiId.trim();
    }

    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: CONFIG.storeName,
      description: `Order payment for ${customer.name}`,
      order_id: order.orderId,
      prefill,
      notes: { customer_name: customer.name, customer_phone: customer.phone },
      theme: { color: "#ff6a00" },
      handler: async response => {
        try {
          const v = await fetch(CONFIG.paymentServer + "/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response)
          });
          const result = await v.json();
          if (result.verified) resolve({ status: "paid", ref: response.razorpay_payment_id });
          else reject(new Error("Payment could not be verified."));
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled.")) }
    };

    const config = razorpayConfigFor(customer.method, customer.upiMode);
    if (config) options.config = config;

    const rzp = new Razorpay(options);
    rzp.on("payment.failed", r => reject(new Error(r.error.description)));
    rzp.open();
  });
}

/* ================= EVENTS ================= */
// One click handler for everything rendered dynamically
document.addEventListener("click", e => {
  const t = e.target;
  const add = t.closest("[data-add]");
  if (add) return addToCart(+add.dataset.add);
  if (t.dataset.inc) return changeQty(+t.dataset.inc, 1);
  if (t.dataset.dec) return changeQty(+t.dataset.dec, -1);
  if (t.dataset.rm) return removeLine(+t.dataset.rm);
  if (t.closest("#cartBtn")) return openCart();
  if (t.closest("#closeCart") || t.id === "overlay") return closeCart();
  if (t.id === "checkoutBtn") return openCheckout();
  if (t.id === "cancelCheckout") return closeCheckout();
});

let checkoutBound = false;
function bindCheckoutEvents() {
  if (checkoutBound) return;
  checkoutBound = true;
  $("payMethod").addEventListener("change", syncPayFields);
  $("upiMode").addEventListener("change", syncPayFields);
  $("checkoutForm").addEventListener("submit", handleCheckout);
}

/* ================= LIVE UPDATES ================= */
function renderAll() {
  renderAuthLink();
  renderNav();
  renderCart();
  if (PAGE === "home") renderHome();
  if (PAGE === "shop") renderShop();
  if (PAGE === "product") renderProduct();
}

window.addEventListener("storage", e => {
  if (e.key === KEYS.cart) renderCart();
  if (e.key === KEYS.session) renderAuthLink();
  if ([KEYS.products, KEYS.categories, KEYS.slides].includes(e.key)) {
    renderAll();
    toast("Store updated");
  }
});

/* ================= TRIPLE-CLICK LOGO → ADMIN ================= */
function setupLogoTripleClick() {
  const logo = $("logo");
  if (!logo) return;

  const home = logo.getAttribute("href") || "index.html";
  let clicks = 0;
  let timer = null;

  logo.addEventListener("click", e => {
    e.preventDefault();
    clicks++;
    clearTimeout(timer);

    if (clicks === 3) {
      clicks = 0;
      location.href = "admin.html";
      return;
    }

    timer = setTimeout(() => {
      clicks = 0;
      location.href = home;
    }, 350);
  });
}

/* ================= INIT ================= */
function init() {
  try {
    $("logo").textContent = CONFIG.storeName;
    $("footerName").textContent = CONFIG.storeName;
    $("year").textContent = new Date().getFullYear();
    document.title = CONFIG.storeName;
    setupLogoTripleClick();

    $("searchForm").onsubmit = e => {
      e.preventDefault();
      if (PAGE !== "shop") location.href = "shop.html?q=" + encodeURIComponent($("search").value.trim());
    };

    bindCheckoutEvents();
    if (PAGE === "home") initHome();
    if (PAGE === "shop") initShop();
    if (PAGE === "product") initProduct();
    renderAll();
    startAutoLogout();   // from shared.js: 5-minute idle and leave-site logout
  } catch (err) {
    console.error("Store failed to load:", err);
    const target = $("shopGrid") || $("deals") || document.body;
    target.innerHTML = `<p class="empty">Could not load the store (${esc(err.message)}). Press F12 to see the Console.</p>`;
  }
}
init();