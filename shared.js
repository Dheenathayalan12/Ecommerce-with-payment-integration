// ================= CONFIG =================
const CONFIG = {
  storeName: "Shopping Mart",
  DevName: "Dheenathayalan R",
  currency: "₹",
  taxRate: 0.05,              // 5% tax
  deliveryFee: 2.5,
  freeDeliveryAbove: 50,      // free delivery when subtotal reaches this
  adminPassword: "admin123" ,
  
  paymentServer: "http://localhost:3000",  // where server.js is running
  storeCurrency: "INR"  // CHANGE THIS
};

const KEYS = {
  products: "shop_products",
  categories: "shop_categories",
  slides: "shop_slides",
  orders: "shop_orders",
  cart: "shop_cart",
  users: "shop_users",     // customer accounts
  session: "shop_session"  // id of the logged-in customer
};

const PLACEHOLDER_IMG = "https://placehold.co/600x400?text=No+Image";

const DEFAULT_CATEGORIES = [
  { name: "Electronics", icon: "💻" },
  { name: "Grocery", icon: "🛒" },
  { name: "Home Products", icon: "🏠" },
  { name: "Fashion", icon: "👕" },
  { name: "Sports", icon: "⚽" }
];

const DEFAULT_SLIDES = [
  { id: 1, title: "Mega Electronics Sale", subtitle: "Up to 20% off on headphones and more",
    image: "https://placehold.co/1600x500?text=Electronics+Sale",
    buttonText: "Shop Electronics", link: "shop.html?cat=Electronics", active: true },
  { id: 2, title: "Fresh Groceries Daily", subtitle: "Farm-fresh fruits, rice and dairy at your door",
    image: "https://placehold.co/1600x500?text=Fresh+Grocery",
    buttonText: "Shop Grocery", link: "shop.html?cat=Grocery", active: true },
  { id: 3, title: "Make Your Home Beautiful", subtitle: "Decor, kitchen and lighting at great prices",
    image: "https://placehold.co/1600x500?text=Home+Products",
    buttonText: "Shop Home", link: "shop.html?cat=Home%20Products", active: true }
];

const DEFAULT_PRODUCTS = [
  { id: 1, name: "Wireless Headphones", category: "Electronics", price: 59.99, discount: 10,
    image: "https://placehold.co/600x400?text=Headphones",
    description: "Over-ear, noise cancelling, 30 hour battery.", available: true },
  { id: 2, name: "Smart Watch", category: "Electronics", price: 129, discount: 0,
    image: "https://placehold.co/600x400?text=Smart+Watch",
    description: "Fitness tracking, heart rate and notifications.", available: true },
  { id: 3, name: "Bluetooth Speaker", category: "Electronics", price: 39.5, discount: 0,
    image: "https://placehold.co/600x400?text=Speaker",
    description: "Portable, waterproof, deep bass.", available: true },
  { id: 4, name: "Organic Apples (1kg)", category: "Grocery", price: 3.49, discount: 0,
    image: "https://placehold.co/600x400?text=Apples",
    description: "Fresh, crisp and locally sourced.", available: true },
  { id: 5, name: "Basmati Rice (5kg)", category: "Grocery", price: 6.99, discount: 5,
    image: "https://placehold.co/600x400?text=Rice",
    description: "Long grain, aromatic premium rice.", available: true },
  { id: 6, name: "Ceramic Coffee Mug", category: "Home Products", price: 9.99, discount: 0,
    image: "https://placehold.co/600x400?text=Mug",
    description: "Microwave safe, 350 ml, matte finish.", available: true },
  { id: 7, name: "LED Desk Lamp", category: "Home Products", price: 24.5, discount: 15,
    image: "https://placehold.co/600x400?text=Lamp",
    description: "Dimmable with three colour modes.", available: true },
  { id: 8, name: "Cotton T-Shirt", category: "Fashion", price: 14.99, discount: 0,
    image: "https://placehold.co/600x400?text=T-Shirt",
    description: "100% cotton, breathable, everyday fit.", available: true },
  { id: 9, name: "Yoga Mat", category: "Sports", price: 19.99, discount: 20,
    image: "https://placehold.co/600x400?text=Yoga+Mat",
    description: "Non-slip, 6 mm thick, with carry strap.", available: true }
];

// ================= HELPERS =================
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const round2 = n => Math.round(n * 100) / 100;
const money = n => CONFIG.currency + round2(n).toFixed(2);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
// Returns the saved array, or saves and returns a copy of the default
function getOrInit(key, def) {
  const v = readJSON(key, null);
  if (Array.isArray(v)) return v;
  const copy = structuredClone(def);
  writeJSON(key, copy);
  return copy;
}

const isOn = p => p.available !== false;   // missing value counts as available
function nextId(list) { return list.reduce((m, i) => Math.max(m, i.id || 0), 0) + 1; }
function finalPrice(p) { return round2(p.price * (100 - (p.discount || 0)) / 100); }

// ----- Products -----
const getProducts = () => getOrInit(KEYS.products, DEFAULT_PRODUCTS);
const saveProducts = list => writeJSON(KEYS.products, list);

// ----- Categories -----
function getCategories() {
  const list = getOrInit(KEYS.categories, DEFAULT_CATEGORIES);
  // Add any category used by a product but missing from the list (e.g. after a restore)
  const names = new Set(list.map(c => c.name.toLowerCase()));
  let changed = false;
  getProducts().forEach(p => {
    if (p.category && !names.has(p.category.toLowerCase())) {
      list.push({ name: p.category, icon: "🏷️" });
      names.add(p.category.toLowerCase());
      changed = true;
    }
  });
  if (changed) saveCategories(list);
  return list;
}
const saveCategories = list => writeJSON(KEYS.categories, list);

// ----- Slides -----
const getSlides = () => getOrInit(KEYS.slides, DEFAULT_SLIDES);
const saveSlides = list => writeJSON(KEYS.slides, list);

// ----- Cart & orders -----
const getCart = () => readJSON(KEYS.cart, []);
const saveCart = cart => writeJSON(KEYS.cart, cart);
const getOrders = () => readJSON(KEYS.orders, []);
const saveOrders = orders => writeJSON(KEYS.orders, orders);

// ----- Order status and delivery steps -----
const ORDER_STEPS = ["placed", "packed", "shipped", "out for delivery", "delivered"];
const ORDER_STATUSES = [...ORDER_STEPS, "cancelled"];
const LEGACY_STATUS = { new: "placed", preparing: "packed" }; // older orders
const normStatus = s => LEGACY_STATUS[s] || s;
const stepIndex = s => ORDER_STEPS.indexOf(normStatus(s));

// ----- Customers and login -----
const getUsers = () => readJSON(KEYS.users, []);
const saveUsers = list => writeJSON(KEYS.users, list);

async function hashPassword(pw) {
  if (!window.crypto || !crypto.subtle) {
    throw new Error("Login needs a modern browser. Open the site from http://localhost or as a local file.");
  }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("shopease:" + pw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCurrentUser() {
  const id = readJSON(KEYS.session, null);
  return id ? getUsers().find(u => u.id === id) || null : null;
}

async function signUp({ name, email, phone, password }) {
  const users = getUsers();
  const mail = email.trim().toLowerCase();
  if (users.some(u => u.email === mail)) throw new Error("An account with this email already exists.");
  const user = {
    id: nextId(users),
    name: name.trim(),
    email: mail,
    phone: (phone || "").trim(),
    address: "",
    passHash: await hashPassword(password)
  };
  users.push(user);
  saveUsers(users);
  writeJSON(KEYS.session, user.id);
  return user;
}

async function logIn(email, password) {
  const mail = email.trim().toLowerCase();
  const user = getUsers().find(u => u.email === mail);
  if (!user || user.passHash !== await hashPassword(password)) {
    throw new Error("Wrong email or password.");
  }
  writeJSON(KEYS.session, user.id);
  return user;
}

function logOut() { localStorage.removeItem(KEYS.session); }

function updateUser(id, patch) {
  const list = getUsers();
  const u = list.find(x => x.id === id);
  if (u) {
    Object.assign(u, patch);
    saveUsers(list);
  }
  return u;
}

// ----- Toast notification -----
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add("hidden"), 2500);
}