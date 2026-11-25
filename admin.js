const $ = id => document.getElementById(id);
const SESSION_KEY = "shop_admin_session";
const pending = { product: null, slide: null };  // base64 images from file uploads
const STATUSES = ["new", "preparing", "out for delivery", "delivered", "cancelled"];
const pf = n => document.querySelector(`#productForm [name="${n}"]`);
const sf = n => document.querySelector(`#slideForm [name="${n}"]`);

/* ================= LOGIN ================= */
$("loginForm").onsubmit = e => {
  e.preventDefault();
  if ($("adminPass").value === CONFIG.adminPassword) {
    sessionStorage.setItem(SESSION_KEY, "1");
    showApp();
  } else {
    $("loginError").textContent = "Wrong password.";
  }
};
$("logout").onclick = () => { sessionStorage.removeItem(SESSION_KEY); location.reload(); };

function showApp() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  renderAll();
}
if (sessionStorage.getItem(SESSION_KEY)) showApp();

/* ================= TABS ================= */
document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + btn.dataset.tab));
    renderAll();
  };
});

/* ================= RENDER ================= */
function renderAll() {
  fillSelects();
  renderSlides();
  renderProducts();
  renderCategories();
  renderOrders();
}

function showPreview(id, src) {
  const img = $(id);
  img.src = src || "";
  img.classList.toggle("hidden", !src);
}

// Fills the bulk-discount and product category dropdowns from the category list
function fillSelects() {
  const cats = getCategories();

  const bulk = $("bulkCat");
  const prevBulk = bulk.value;
  bulk.innerHTML = `<option value="__all">All products</option>` +
    cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
  if ([...bulk.options].some(o => o.value === prevBulk)) bulk.value = prevBulk;

  const pc = $("pCategory");
  const prevP = pc.value;
  pc.innerHTML = cats.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
  if (cats.some(c => c.name === prevP)) pc.value = prevP;
}

/* ================= SLIDESHOW ================= */
function renderSlides() {
  const slides = getSlides();
  $("slideList").innerHTML = slides.length ? slides.map((s, i) => `
    <div class="order slide-row">
      <img class="slide-thumb" src="${esc(s.image)}" alt="">
      <div class="grow">
        <strong>${esc(s.title)}</strong><br>
        <small>${esc(s.subtitle || "")}</small><br>
        <small>Links to: ${esc(s.link || "nothing")}</small>
      </div>
      <label class="check"><input type="checkbox" data-sactive="${s.id}" ${s.active ? "checked" : ""}> Show</label>
      <div class="actions">
        <button class="btn small" data-sup="${s.id}" ${i === 0 ? "disabled" : ""}>▲</button>
        <button class="btn small" data-sdown="${s.id}" ${i === slides.length - 1 ? "disabled" : ""}>▼</button>
        <button class="btn small" data-sedit="${s.id}">Edit</button>
        <button class="btn small danger" data-sdel="${s.id}">Delete</button>
      </div>
    </div>`).join("") : `<p>No slides yet. Click "+ Add slide".</p>`;
}

function updateSlide(id, patch) {
  const slides = getSlides();
  const s = slides.find(x => x.id === id);
  if (!s) return;
  Object.assign(s, patch);
  saveSlides(slides);
  renderSlides();
  toast("Slideshow updated.");
}

function moveSlide(id, dir) {
  const slides = getSlides();
  const i = slides.findIndex(x => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= slides.length) return;
  [slides[i], slides[j]] = [slides[j], slides[i]];
  saveSlides(slides);
  renderSlides();
}

function deleteSlide(id) {
  if (!confirm("Delete this slide?")) return;
  saveSlides(getSlides().filter(s => s.id !== id));
  renderSlides();
  toast("Slide deleted.");
}

function fillLinkOptions(current) {
  const opts = [
    ["", "No link"],
    ["shop.html", "All products"],
    ...getCategories().map(c => [`shop.html?cat=${encodeURIComponent(c.name)}`, `${c.icon || ""} ${c.name}`])
  ];
  if (current && !opts.some(o => o[0] === current)) opts.push([current, `Custom: ${current}`]);
  sf("link").innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  sf("link").value = current || "";
}

function openSlideModal(id) {
  const s = id ? getSlides().find(x => x.id === id) : null;
  $("slideForm").reset();
  pending.slide = null;
  $("slideFile").value = "";
  $("slideModalTitle").textContent = s ? "Edit slide" : "Add slide";

  sf("slideId").value = s ? s.id : "";
  sf("title").value = s?.title || "";
  sf("subtitle").value = s?.subtitle || "";
  sf("buttonText").value = s?.buttonText || "Shop now";
  sf("image").value = s?.image || "";
  sf("active").checked = s ? !!s.active : true;
  fillLinkOptions(s?.link || "");
  showPreview("slidePreview", sf("image").value);
  $("slideModal").classList.remove("hidden");
}

$("addSlide").onclick = () => openSlideModal(null);
$("cancelSlide").onclick = () => $("slideModal").classList.add("hidden");

sf("image").oninput = e => {
  pending.slide = null;
  showPreview("slidePreview", e.target.value.trim());
};

$("slideFile").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pending.slide = await resizeImage(file, 1600, 0.8);
    showPreview("slidePreview", pending.slide);
  } catch {
    toast("Could not read that image.");
  }
};

$("slideForm").onsubmit = e => {
  e.preventDefault();
  const id = +sf("slideId").value;
  const slides = getSlides();
  const data = {
    title: sf("title").value.trim(),
    subtitle: sf("subtitle").value.trim(),
    buttonText: sf("buttonText").value.trim() || "Shop now",
    link: sf("link").value,
    image: pending.slide || sf("image").value.trim() || PLACEHOLDER_IMG,
    active: sf("active").checked
  };
  if (id) {
    const existing = slides.find(s => s.id === id);
    if (existing) Object.assign(existing, data);
  } else {
    slides.push({ id: nextId(slides), ...data });
  }
  saveSlides(slides);
  $("slideModal").classList.add("hidden");
  renderSlides();
  toast("Slide saved. Homepage updated.");
};

$("slideList").onchange = e => {
  const t = e.target;
  if (t.dataset.sactive) updateSlide(+t.dataset.sactive, { active: t.checked });
};

$("slideList").onclick = e => {
  const t = e.target;
  if (t.dataset.sedit) return openSlideModal(+t.dataset.sedit);
  if (t.dataset.sdel) return deleteSlide(+t.dataset.sdel);
  if (t.dataset.sup) return moveSlide(+t.dataset.sup, -1);
  if (t.dataset.sdown) return moveSlide(+t.dataset.sdown, 1);
};

/* ================= PRODUCTS ================= */
function renderProducts() {
  const rows = getProducts().map(p => `
    <tr>
      <td><img class="thumb" src="${esc(p.image)}" alt=""></td>
      <td><strong>${esc(p.name)}</strong><br><small>${esc(p.description || "")}</small></td>
      <td>${esc(p.category)}</td>
      <td><input class="mini" type="number" step="0.01" min="0" value="${p.price}" data-price="${p.id}"></td>
      <td><input class="mini" type="number" min="0" max="100" value="${p.discount || 0}" data-disc="${p.id}">%</td>
      <td><strong>${money(finalPrice(p))}</strong></td>
      <td><input type="checkbox" data-avail="${p.id}" ${isOn(p) ? "checked" : ""}></td>
      <td class="actions">
        <button class="btn small" data-pedit="${p.id}">Edit</button>
        <button class="btn small danger" data-pdel="${p.id}">Delete</button>
      </td>
    </tr>`).join("");
  $("productRows").innerHTML = rows || `<tr><td colspan="8">No products yet. Click "+ Add product".</td></tr>`;
}

function updateProduct(id, patch) {
  const list = getProducts();
  const p = list.find(x => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  saveProducts(list);
  renderAll();
  toast("Saved. Website updated.");
}

function deleteProduct(id) {
  if (!confirm("Delete this product permanently?")) return;
  saveProducts(getProducts().filter(p => p.id !== id));
  renderAll();
  toast("Product deleted.");
}

function openProductModal(id) {
  if (!getCategories().length) return toast("Add a category first (Categories tab).");
  const p = id ? getProducts().find(x => x.id === id) : null;
  $("productForm").reset();
  pending.product = null;
  $("prodFile").value = "";
  $("productModalTitle").textContent = p ? "Edit product" : "Add new product";

  fillSelects();
  pf("productId").value = p ? p.id : "";
  pf("name").value = p?.name || "";
  pf("category").value = p?.category || getCategories()[0].name;
  pf("price").value = p ? p.price : "";
  pf("discount").value = p?.discount || 0;
  pf("description").value = p?.description || "";
  pf("specs").value = (p?.specs || []).map(s => `${s.k}: ${s.v}`).join("\n");
  pf("images").value = (p?.images || []).join("\n");
  pf("image").value = p?.image || "";
  pf("available").checked = p ? isOn(p) : true;
  showPreview("prodPreview", pf("image").value);
  $("productModal").classList.remove("hidden");
}

$("addProduct").onclick = () => openProductModal(null);
$("cancelProduct").onclick = () => $("productModal").classList.add("hidden");

pf("image").oninput = e => {
  pending.product = null;
  showPreview("prodPreview", e.target.value.trim());
};

$("prodFile").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pending.product = await resizeImage(file, 800, 0.85);
    showPreview("prodPreview", pending.product);
  } catch {
    toast("Could not read that image.");
  }
};

$("productForm").onsubmit = e => {
  e.preventDefault();
  const id = +pf("productId").value;
  const list = getProducts();
  const data = {
    name: pf("name").value.trim(),
    category: pf("category").value,
    price: Math.max(0, parseFloat(pf("price").value) || 0),
    discount: clamp(parseFloat(pf("discount").value) || 0, 0, 100),
    description: pf("description").value.trim(),
    specs: parseSpecs(pf("specs").value),
    images: pf("images").value.split("\n").map(s => s.trim()).filter(Boolean),
    image: pending.product || pf("image").value.trim() || PLACEHOLDER_IMG,
    available: pf("available").checked
  };
  if (id) {
    const existing = list.find(p => p.id === id);
    if (existing) Object.assign(existing, data);
  } else {
    list.push({ id: nextId(list), ...data });
  }
  saveProducts(list);
  $("productModal").classList.add("hidden");
  renderAll();
  toast("Product saved. Website updated.");
};

// Inline edits: price, discount, availability
$("productRows").onchange = e => {
  const t = e.target;
  if (t.dataset.price) updateProduct(+t.dataset.price, { price: Math.max(0, parseFloat(t.value) || 0) });
  if (t.dataset.disc) updateProduct(+t.dataset.disc, { discount: clamp(parseFloat(t.value) || 0, 0, 100) });
  if (t.dataset.avail) updateProduct(+t.dataset.avail, { available: t.checked });
};

$("productRows").onclick = e => {
  const t = e.target;
  if (t.dataset.pedit) openProductModal(+t.dataset.pedit);
  if (t.dataset.pdel) deleteProduct(+t.dataset.pdel);
};

// Discount for one category or all products
function bulkDiscount(pct) {
  const cat = $("bulkCat").value;
  const list = getProducts();
  list.forEach(p => { if (cat === "__all" || p.category === cat) p.discount = pct; });
  saveProducts(list);
  renderAll();
  toast(pct ? `${pct}% discount applied` : "Discounts removed");
}

$("applyBulk").onclick = () => {
  const pct = parseFloat($("bulkPct").value);
  if (isNaN(pct)) return toast("Enter a discount percentage.");
  bulkDiscount(clamp(pct, 0, 100));
};
$("clearBulk").onclick = () => bulkDiscount(0);

/* ================= CATEGORIES ================= */
function renderCategories() {
  const products = getProducts();
  $("catRows").innerHTML = getCategories().map(c => {
    const n = products.filter(p => p.category === c.name).length;
    return `
      <tr>
        <td><input class="mini" style="width:60px" maxlength="4" value="${esc(c.icon || "")}" data-icon="${esc(c.name)}"></td>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${n}</td>
        <td><button class="btn small danger" data-delcat="${esc(c.name)}">Delete</button></td>
      </tr>`;
  }).join("") || `<tr><td colspan="4">No categories yet. Add one above.</td></tr>`;
}

$("catForm").onsubmit = e => {
  e.preventDefault();
  const name = $("newCatName").value.trim().replace(/\s+/g, " ");
  const icon = $("newCatIcon").value.trim() || "🏷️";
  if (!name) return;

  const cats = getCategories();
  if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    $("catError").textContent = "This category already exists.";
    return;
  }
  cats.push({ name, icon });
  saveCategories(cats);
  $("newCatName").value = "";
  $("newCatIcon").value = "";
  $("catError").textContent = "";
  renderAll();
  toast(`Category "${name}" added. Its page is ready.`);
};

$("catRows").onchange = e => {
  const name = e.target.dataset.icon;
  if (!name) return;
  const cats = getCategories();
  const c = cats.find(x => x.name === name);
  if (c) {
    c.icon = e.target.value.trim() || "🏷️";
    saveCategories(cats);
    renderAll();
    toast("Icon updated.");
  }
};

$("catRows").onclick = e => {
  const name = e.target.dataset.delcat;
  if (name) deleteCategory(name);
};

function deleteCategory(name) {
  const count = getProducts().filter(p => p.category === name).length;
  if (count > 0) {
    toast(`Cannot delete "${name}": ${count} product(s) use it. Move or delete them first.`);
    return;
  }
  if (!confirm(`Delete the category "${name}"?`)) return;
  saveCategories(getCategories().filter(c => c.name !== name));
  renderAll();
  toast(`Category "${name}" deleted.`);
}

/* ================= ORDERS ================= */
function renderOrders() {
  const orders = getOrders().slice().reverse();
  $("orderList").innerHTML = orders.length ? orders.map(o => {
    const dl = o.delivery || {};
    const cur = normStatus(o.status);
    return `
    <div class="order" data-order="${esc(o.id)}">
      <div class="order-head">
        <strong>${esc(o.id)}</strong>
        <span>${new Date(o.createdAt).toLocaleString()}</span>
        <span>${esc(o.email || "guest checkout")}</span>
      </div>
      <div>${esc(o.customer.name)} · ${esc(o.customer.phone)}<br>${esc(o.customer.address)}</div>
      <ul>${o.items.map(i => `<li>${i.qty} × ${esc(i.name)} @ ${money(i.unitPrice)}</li>`).join("")}</ul>
      <div>Total <strong>${money(o.totals.total)}</strong> ·
        Payment: ${esc(o.payment.method)} (${esc(o.payment.status)}) · Ref ${esc(o.payment.ref)}
      </div>

      <div class="delivery-form">
        <label>Status
          <select data-f="status">
            ${ORDER_STATUSES.map(s => `<option value="${s}" ${s === cur ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
        <label>Delivery partner
          <input data-f="partner" value="${esc(dl.partner || "")}" placeholder="e.g. BlueDart">
        </label>
        <label>Tracking ID
          <input data-f="trackingId" value="${esc(dl.trackingId || "")}" placeholder="e.g. BD123456">
        </label>
        <label>Expected date
          <input data-f="expectedDate" type="date" value="${esc(dl.expectedDate || "")}">
        </label>
        <button class="btn primary small" data-saveorder="${esc(o.id)}">Save delivery</button>
      </div>
    </div>`;
  }).join("") : `<p>No orders yet.</p>`;
}

$("orderList").onclick = e => {
  const id = e.target.dataset.saveorder;
  if (!id) return;

  const box = e.target.closest("[data-order]");
  const val = key => box.querySelector(`[data-f="${key}"]`).value.trim();

  const orders = getOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return;

  const newStatus = val("status");
  if (normStatus(order.status) !== newStatus) {
    order.history = [...(order.history || []), { status: newStatus, at: new Date().toISOString() }];
  }
  order.status = newStatus;
  order.delivery = {
    partner: val("partner"),
    trackingId: val("trackingId"),
    expectedDate: val("expectedDate")
  };

  saveOrders(orders);
  toast("Delivery details saved. The customer can see them in My Account.");
  renderOrders();
};

$("clearOrders").onclick = () => {
  if (!confirm("Delete ALL orders?")) return;
  saveOrders([]);
  renderOrders();
  toast("All orders deleted.");
};

/* ================= SETTINGS ================= */
function download(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

$("exportBtn").onclick = () => {
  download(JSON.stringify({
    products: getProducts(),
    categories: getCategories(),
    slides: getSlides()
  }, null, 2), "shop-backup.json");
};

$("importFile").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.products) || !Array.isArray(d.categories) || !Array.isArray(d.slides)) {
      throw new Error("Invalid");
    }
    saveProducts(d.products);
    saveCategories(d.categories);
    saveSlides(d.slides);
    renderAll();
    toast("Backup imported.");
  } catch {
    toast("Invalid backup file.");
  }
  e.target.value = "";
};

$("resetBtn").onclick = () => {
  if (!confirm("Reset products, categories and slides to the defaults? Orders are kept.")) return;
  saveProducts(structuredClone(DEFAULT_PRODUCTS));
  saveCategories(structuredClone(DEFAULT_CATEGORIES));
  saveSlides(structuredClone(DEFAULT_SLIDES));
  renderAll();
  toast("Store reset to defaults.");
};

/* ================= HELPERS ================= */
// Bulk-discount buttons
// (bulkDiscount is defined above)

// Resizes an uploaded image so it fits comfortably in browser storage
function resizeImage(file, maxSize = 800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Converts "Brand: Sony" lines into [{k: "Brand", v: "Sony"}]
function parseSpecs(text) {
  return text.split("\n").map(line => {
    const i = line.indexOf(":");
    if (i < 1) return null;
    return { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() };
  }).filter(Boolean);
}

/* ================= LIVE UPDATES ================= */
window.addEventListener("storage", e => {
  if (e.key === KEYS.orders) renderOrders();
});