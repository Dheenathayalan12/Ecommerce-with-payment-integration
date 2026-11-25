/* ============================================================
   admin-users.js : customer management inside the admin Dashboard
   Load after boost.js on admin.html.
   ============================================================ */
(function () {
  const $u = id => document.getElementById(id);
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const ordersOf = uid => getOrders().filter(o => o.userId === uid).reverse();
  const liveOrders = uid => ordersOf(uid).filter(o => normStatus(o.status) !== "cancelled");
  const spentOf = uid => liveOrders(uid).reduce((s, o) => s + o.totals.total, 0);
  const ustat = (label, value) => `<div class="stat"><small>${label}</small><strong>${value}</strong></div>`;

  /* ================= CUSTOMER LIST ================= */
  function sectionHTML() {
    return `
      <section class="acc-card" id="userMgr" style="overflow-x:auto">
        <div class="o-head">
          <h2 id="uCount" style="margin:0">Customers</h2>
          <input id="uSearch" placeholder="Search name, email or phone" style="width:260px">
        </div>
        <table class="table" style="margin-top:12px">
          <thead>
            <tr><th>Customer</th><th>Email</th><th>Phone</th><th>Orders</th><th>Spent</th><th></th></tr>
          </thead>
          <tbody id="uTbody"></tbody>
        </table>
      </section>`;
  }

  function renderRows(filter = "") {
    const users = getUsers();
    const q = filter.trim().toLowerCase();
    const list = users.filter(u =>
      !q || `${u.name} ${u.email} ${u.phone || ""}`.toLowerCase().includes(q));

    $u("uCount").textContent = `Customers (${users.length})`;
    $u("uTbody").innerHTML = list.length ? list.map(u => `
      <tr>
        <td><strong>${esc(u.name)}</strong><br><small class="muted">ID ${u.id}</small></td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.phone || "-")}</td>
        <td>${ordersOf(u.id).length}</td>
        <td>${money(spentOf(u.id))}</td>
        <td class="actions">
          <button class="btn small primary" type="button" data-uview="${u.id}">View</button>
          <button class="btn small danger" type="button" data-udel="${u.id}">Delete</button>
        </td>
      </tr>`).join("")
      : `<tr><td colspan="6">No customers found.</td></tr>`;
  }

  // Puts the managed customer list in place of the simple Customers card
  function mountSection() {
    const tab = $u("tab-dash");
    if (!tab || $u("userMgr")) return;
    const old = [...tab.querySelectorAll(".acc-card")]
      .find(c => c.querySelector("h2") && c.querySelector("h2").textContent.trim() === "Customers");
    const wrap = document.createElement("div");
    wrap.innerHTML = sectionHTML();
    const sec = wrap.firstElementChild;
    if (old) old.replaceWith(sec); else tab.appendChild(sec);
    renderRows("");
  }

  /* ================= VIEW CUSTOMER ================= */
  function orderDetail(o) {
    const dl = o.delivery || {};
    const hist = (o.history || []).map(h =>
      `<li>${esc(h.status)} · ${new Date(h.at).toLocaleString()}</li>`).join("");
    return `
      <div class="o-card">
        <div class="o-head">
          <div>
            <strong>${esc(o.id)}</strong><br>
            <small class="muted">Placed ${new Date(o.createdAt).toLocaleString()}</small>
          </div>
          <span class="o-badge">${esc(normStatus(o.status))}</span>
        </div>

        <div class="delivery-info">
          <div><strong>Deliver to:</strong> ${esc(o.customer.name)}, ${esc(o.customer.phone)}</div>
          <div><strong>Address:</strong> ${esc(o.customer.address)}</div>
          <div><strong>Expected:</strong> ${esc(dl.expectedDate || "Not set")}</div>
          <div><strong>Partner:</strong> ${esc(dl.partner || "Not assigned")}</div>
          <div><strong>Tracking ID:</strong> ${esc(dl.trackingId || "Not set")}</div>
          <div><strong>Order total:</strong> ${money(o.totals.total)}</div>
        </div>

        <table class="spec-table" style="margin-top:10px">
          ${o.items.map(i => `
            <tr>
              <th>${esc(i.name)}<br><small class="muted">${esc(i.category || "")}</small></th>
              <td>${i.qty} × ${money(i.unitPrice)} = <strong>${money(i.qty * i.unitPrice)}</strong></td>
            </tr>`).join("")}
          <tr><th>Subtotal</th><td>${money(o.totals.subtotal)}</td></tr>
          <tr><th>Tax</th><td>${money(o.totals.tax)}</td></tr>
          <tr><th>Delivery</th><td>${o.totals.delivery ? money(o.totals.delivery) : "FREE"}</td></tr>
          <tr><th>Total</th><td><strong>${money(o.totals.total)}</strong></td></tr>
        </table>

        <p style="margin:10px 0 0">Payment: ${esc(o.payment.method)} (${esc(o.payment.status)})
          · Ref ${esc(o.payment.ref)}</p>

        <details>
          <summary>Status history</summary>
          <ul>${hist || "<li>No history recorded</li>"}</ul>
        </details>
      </div>`;
  }

  function openView(uid) {
    const u = getUsers().find(x => x.id === uid);
    if (!u) return;
    const os = ordersOf(uid);
    const wish = get("shop_wish_u" + uid, []).length;
    const alerts = get("shop_price_alerts", []).filter(a => a.userId === uid).length;
    const reviews = get("shop_reviews", []).filter(r => r.userId === uid).length;
    const points = liveOrders(uid).reduce((s, o) => s + Math.floor(o.totals.total / 10), 0);

    $u("uBody").innerHTML = `
      <div class="o-head">
        <div>
          <h2 style="margin:0">${esc(u.name)}</h2>
          <small class="muted">Customer ID ${u.id}</small>
        </div>
        <button class="btn small" type="button" data-uclose>✕</button>
      </div>

      <h3>Personal details</h3>
      <table class="spec-table">
        <tr><th>Full name</th><td>${esc(u.name)}</td></tr>
        <tr><th>Email</th><td>${esc(u.email)}</td></tr>
        <tr><th>Phone</th><td>${esc(u.phone || "-")}</td></tr>
        <tr><th>Default address</th><td>${esc(u.address || "-")}</td></tr>
      </table>

      <h3>Activity</h3>
      <div class="stat-grid">
        ${ustat("Total orders", os.length)}
        ${ustat("Total spent", money(spentOf(uid)))}
        ${ustat("Loyalty points", points)}
        ${ustat("Wishlist items", wish)}
        ${ustat("Price alerts", alerts)}
        ${ustat("Reviews", reviews)}
      </div>

      <h3>Orders (${os.length})</h3>
      ${os.length ? os.map(orderDetail).join("") : `<p class="muted">No orders placed yet.</p>`}

      <div class="row" style="margin-top:16px; justify-content:space-between">
        <button class="btn danger" type="button" data-udel="${u.id}">Delete customer</button>
        <button class="btn" type="button" data-uclose>Close</button>
      </div>`;

    $u("uModal").classList.remove("hidden");
  }

  function closeView() {
    $u("uModal").classList.add("hidden");
  }

  /* ================= DELETE CUSTOMER ================= */
  function deleteUser(uid) {
    const u = getUsers().find(x => x.id === uid);
    if (!u) return;
    const count = ordersOf(uid).length;
    if (!confirm(
      `Delete customer "${u.name}"?\n\n` +
      `Their account, wishlist, price alerts and reviews will be removed.\n` +
      `Their ${count} past order(s) stay in the Orders list as guest records.`)) return;

    set(KEYS.users, getUsers().filter(x => x.id !== uid));
    localStorage.removeItem("shop_wish_u" + uid);
    set("shop_price_alerts", get("shop_price_alerts", []).filter(a => a.userId !== uid));
    set("shop_reviews", get("shop_reviews", []).filter(r => r.userId !== uid));

    // Keep the orders for accounting, but detach them from the deleted account
    const orders = getOrders();
    orders.forEach(o => { if (o.userId === uid) { o.userId = null; o.accountDeleted = true; } });
    saveOrders(orders);

    // If that customer was logged in on this browser, end their session
    if (get(KEYS.session, null) === uid) localStorage.removeItem(KEYS.session);

    closeView();
    toast(`Customer "${u.name}" deleted.`);

    // Refresh the whole dashboard so the counts are correct
    const dashBtn = document.querySelector('[data-bx="dash"]');
    if (dashBtn) dashBtn.click();
  }

  /* ================= EVENTS ================= */
  document.addEventListener("click", e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === "uModal") return closeView();

    const view = t.closest("[data-uview]");
    if (view) return openView(+view.dataset.uview);

    const del = t.closest("[data-udel]");
    if (del) return deleteUser(+del.dataset.udel);

    if (t.closest("[data-uclose]")) return closeView();
  });

  document.addEventListener("input", e => {
    if (e.target.id === "uSearch") renderRows(e.target.value);
  });

  /* ================= START ================= */
  document.body.insertAdjacentHTML("beforeend", `
    <div id="uModal" class="modal hidden">
      <div class="modal-box" id="uBody" style="width:min(820px,100%)"></div>
    </div>`);

  // The Dashboard re-draws itself each time it opens, so watch for that and re-mount our list
  const tab = $u("tab-dash");
  if (tab) {
    new MutationObserver(mountSection).observe(tab, { childList: true });
    mountSection();
  }
})();