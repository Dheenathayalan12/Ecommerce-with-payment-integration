/* ============================================================
   alerts.js : price-drop alerts and virtual try-on
   Load after trendy.js on index, shop, product and account pages.
   ============================================================ */
(function () {
  const $a = id => document.getElementById(id);
  const page = document.body.dataset.page || "";
  const onAccount = location.pathname.endsWith("account.html");
  const hasApp = typeof window.renderCart === "function" && !!$a("cartDrawer");
  const K = { alerts: "shop_price_alerts", snap: "shop_price_snap" };

  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const prod = id => getProducts().find(p => p.id === id);
  const currentPid = () => +new URLSearchParams(location.search).get("id");
  const alerts = () => get(K.alerts, []);
  const saveAlerts = list => set(K.alerts, list);
  const isWearable = p => /fashion|accessor|watch|eyewear|glass|jewel|hat|cap|shoe|bag|sunglass|cloth|shirt|jacket/i
    .test(`${p.category} ${p.name}`);

  function notify(msg) {
    toast(msg);
    if (window.Notification && Notification.permission === "granted") {
      try { new Notification(CONFIG.storeName, { body: msg }); } catch (e) { /* ignore */ }
    }
  }

  /* ================= PRICE-DROP DETECTION =================
     Each customer page compares current prices with the prices it last saw.
     If a price fell and matches an alert, the customer is notified. */
  function checkPriceDrops() {
    const now = {};
    getProducts().forEach(p => { now[p.id] = finalPrice(p); });
    const snap = get(K.snap, null);
    set(K.snap, now);
    if (!snap) return; // first visit: just record the prices

    const user = getCurrentUser();
    const list = alerts();
    const messages = [];
    let changed = false;

    getProducts().forEach(p => {
      const old = snap[p.id], cur = now[p.id];
      if (old === undefined || cur >= old - 0.005) return; // no drop
      list.forEach(a => {
        if (a.productId !== p.id || a.done) return;
        const hit = a.target ? cur <= a.target : cur < a.basePrice - 0.005;
        if (!hit) return;
        a.done = true;
        a.hitPrice = cur;
        a.hitAt = new Date().toISOString();
        changed = true;
        if (user && a.userId === user.id) messages.push(`${p.name} is now ${money(cur)}`);
      });
    });

    if (changed) saveAlerts(list);
    if (messages.length) notify("💸 Price drop! " + messages.join(" · "));
  }

  function subscribe(pid, target) {
    const user = getCurrentUser();
    const p = prod(pid);
    if (!user) return toast("Please log in first.");
    if (!p) return;
    const cur = finalPrice(p);
    if (target && target >= cur) return toast(`Enter a price below the current price ${money(cur)}.`);

    const list = alerts();
    if (list.some(a => a.productId === pid && a.userId === user.id && !a.done)) {
      return toast("You are already tracking this product.");
    }
    list.push({
      id: Date.now(),
      productId: pid,
      userId: user.id,
      target: target || 0,
      basePrice: cur,
      createdAt: new Date().toISOString(),
      done: false
    });
    saveAlerts(list);
    if (window.Notification && Notification.permission === "default") Notification.requestPermission();
    toast("Alert set. We'll tell you when the price drops.");
    renderPABox();
    renderAccountAlerts();
  }

  function removeAlert(id) {
    saveAlerts(alerts().filter(a => a.id !== id));
    toast("Alert removed.");
    renderPABox();
    renderAccountAlerts();
  }

  /* ================= PRODUCT PAGE: alert box and try-on button ================= */
  function renderPABox() {
    const view = $a("productView");
    if (!view) return;
    view.querySelectorAll(".pa-box, .try-row").forEach(n => n.remove());

    const p = prod(currentPid());
    const acts = view.querySelector(".pd-actions");
    if (!p || !acts) return;

    const cur = finalPrice(p);
    const user = getCurrentUser();
    const mine = user ? alerts().find(a => a.productId === p.id && a.userId === user.id && !a.done) : null;
    const loginUrl = `login.html?next=${encodeURIComponent("product.html?id=" + p.id)}`;

    let pa;
    if (!user) {
      pa = `<p class="muted small">🔔 <a href="${loginUrl}">Login</a> to get a price-drop alert for this product.</p>`;
    } else if (mine) {
      pa = `<div class="pa-on">🔔 <strong>Tracking this price.</strong> Now ${money(cur)}
              ${mine.target ? ` · we'll alert you at ${money(mine.target)} or below` : " · we'll alert you when it drops"}.
              <button class="link" type="button" data-pa-stop="${mine.id}">Stop alert</button></div>`;
    } else {
      pa = `<div class="pa-form">
              <strong>🔔 Price-drop alert</strong>
              <div class="row-wrap">
                <input id="paTarget" type="number" min="0" step="0.01" placeholder="Alert me at or below (optional)">
                <button class="btn small primary" id="paSub" type="button">Notify me</button>
              </div>
              <small class="muted">Current price ${money(cur)}. Leave the box empty to be told about any drop.</small>
            </div>`;
    }

    const tryBtn = isWearable(p)
      ? `<div class="try-row"><button class="btn try-btn" id="tryOpen" type="button">👓 Virtual try-on</button></div>`
      : "";
    acts.insertAdjacentHTML("afterend", tryBtn + `<div class="pa-box">${pa}</div>`);
  }

  /* ================= ACCOUNT PAGE: my price alerts ================= */
  function renderAccountAlerts() {
    const main = document.querySelector(".acc-page");
    const user = getCurrentUser();
    if (!main || !user) return;

    let sec = $a("paAcc");
    if (!sec) {
      main.insertAdjacentHTML("beforeend", `<section class="acc-card" id="paAcc"></section>`);
      sec = $a("paAcc");
    }

    const mine = alerts().filter(a => a.userId === user.id).reverse();
    const rows = mine.map(a => {
      const p = prod(a.productId);
      if (!p) return "";
      const status = a.done
        ? `<span class="pa-hit">✔ Price dropped to ${money(a.hitPrice)} on ${new Date(a.hitAt).toLocaleDateString()}</span>`
        : `<span class="muted">Waiting. Now ${money(finalPrice(p))}${a.target ? " · target " + money(a.target) : ""}</span>`;
      return `
        <div class="pa-row">
          <img src="${esc(p.image)}" alt="" onerror="this.src='${PLACEHOLDER_IMG}'">
          <div class="grow">
            <a href="product.html?id=${p.id}"><strong>${esc(p.name)}</strong></a><br>
            <small>Price when set: ${money(a.basePrice)}</small><br>${status}
          </div>
          <button class="btn small" type="button" data-paarm="${a.id}">Remove</button>
        </div>`;
    }).join("");

    sec.innerHTML = `<h2>🔔 My price alerts</h2>` + (rows ||
      `<p class="muted">No price alerts yet. Open a product and tap "Notify me" to track its price.</p>`);
  }

  /* ================= VIRTUAL TRY-ON ================= */
  const TRY_HTML = `
  <div id="tryModal" class="modal hidden">
    <div class="modal-box try-box">
      <div class="try-head">
        <h2 id="tryTitle">Virtual try-on</h2>
        <button id="tryClose" class="try-x" type="button" aria-label="Close">✕</button>
      </div>
      <p class="muted small">Allow camera access. Drag the product onto yourself, then resize or rotate it.
        Works best with a product photo that has a transparent or plain white background.</p>
      <div id="tryStage" class="try-stage">
        <video id="tryVideo" autoplay playsinline muted></video>
        <img id="tryItem" class="try-item" alt="" draggable="false">
      </div>
      <p id="tryMsg" class="error"></p>
      <div class="try-ctrl">
        <button class="btn small" type="button" data-tact="smaller">−</button>
        <button class="btn small" type="button" data-tact="bigger">+</button>
        <button class="btn small" type="button" data-tact="rotL">⟲</button>
        <button class="btn small" type="button" data-tact="rotR">⟳</button>
        <label class="try-lbl">Opacity <input type="range" id="tryOp" min="20" max="100" value="90"></label>
        <label class="try-lbl"><input type="checkbox" id="tryBlend" checked> Hide white background</label>
      </div>
    </div>
  </div>`;

  let tryState = { x: 0.5, y: 0.45, size: 0.4, rot: 0 };
  let camStream = null;
  let dragging = false;

  function drawTry() {
    const it = $a("tryItem");
    it.style.left = (tryState.x * 100) + "%";
    it.style.top = (tryState.y * 100) + "%";
    it.style.width = (tryState.size * 100) + "%";
    it.style.transform = `translate(-50%,-50%) rotate(${tryState.rot}deg)`;
  }

  async function startCam() {
    const msg = $a("tryMsg");
    msg.textContent = "";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg.textContent = "Camera is not supported here. Open the site on https or localhost in Chrome, Edge, or Safari.";
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      $a("tryVideo").srcObject = camStream;
    } catch (e) {
      msg.textContent = "Camera access was blocked. Allow camera permission in your browser and try again.";
    }
  }

  function stopCam() {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    camStream = null;
    $a("tryVideo").srcObject = null;
  }

  function openTryOn(p) {
    $a("tryTitle").textContent = "Try on: " + p.name;
    const item = $a("tryItem");
    item.src = p.image;
    item.onerror = () => { item.src = PLACEHOLDER_IMG; };
    tryState = { x: 0.5, y: 0.45, size: 0.4, rot: 0 };
    $a("tryOp").value = 90;
    item.style.opacity = 0.9;
    $a("tryBlend").checked = true;
    item.style.mixBlendMode = "multiply";
    drawTry();
    $a("tryModal").classList.remove("hidden");
    startCam();
  }

  function closeTryOn() {
    stopCam();
    $a("tryModal").classList.add("hidden");
  }

  function setupTryStage() {
    const stage = $a("tryStage");
    stage.addEventListener("pointerdown", e => {
      if (e.target.id !== "tryItem") return;
      dragging = true;
      e.target.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    stage.addEventListener("pointermove", e => {
      if (!dragging) return;
      const r = stage.getBoundingClientRect();
      tryState.x = clamp((e.clientX - r.left) / r.width, 0, 1);
      tryState.y = clamp((e.clientY - r.top) / r.height, 0, 1);
      drawTry();
    });
    const endDrag = () => { dragging = false; };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
  }

  /* ================= EVENTS ================= */
  document.addEventListener("click", e => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    if (t.id === "paSub") {
      const v = parseFloat($a("paTarget").value);
      return subscribe(currentPid(), v > 0 ? v : 0);
    }
    const stop = t.closest("[data-pa-stop]");
    if (stop) return removeAlert(+stop.dataset.paStop);
    const rm = t.closest("[data-paarm]");
    if (rm) return removeAlert(+rm.dataset.paarm);

    if (t.id === "tryOpen") return openTryOn(prod(currentPid()));
    if (t.id === "tryClose" || t.id === "tryModal") return closeTryOn();

    const act = t.dataset.tact;
    if (act) {
      if (act === "bigger") tryState.size = clamp(tryState.size + 0.05, 0.1, 1);
      if (act === "smaller") tryState.size = clamp(tryState.size - 0.05, 0.1, 1);
      if (act === "rotL") tryState.rot -= 15;
      if (act === "rotR") tryState.rot += 15;
      drawTry();
    }
  });

  document.addEventListener("input", e => {
    if (e.target.id === "tryOp") $a("tryItem").style.opacity = e.target.value / 100;
    if (e.target.id === "tryBlend") {
      $a("tryItem").style.mixBlendMode = e.target.checked ? "multiply" : "normal";
    }
  });

  /* ================= START ================= */
  function init() {
    document.body.insertAdjacentHTML("beforeend", TRY_HTML);
    setupTryStage();

    checkPriceDrops();

    if (hasApp && page === "product") {
      const base = window.renderProduct;
      window.renderProduct = function () { base(); renderPABox(); };
      renderPABox();
    }
    if (onAccount) renderAccountAlerts();

    window.addEventListener("storage", e => {
      if (e.key === K.alerts) {
        renderPABox();
        renderAccountAlerts();
      }
      if (e.key === KEYS.products) {
        checkPriceDrops();
        renderPABox();
        renderAccountAlerts();
      }
    });
  }

  init();
})();