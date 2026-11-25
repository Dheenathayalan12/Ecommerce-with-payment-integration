require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const app = express();
app.use(cors());
app.use(express.json());

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!KEY_ID || !KEY_SECRET) {
  console.error("❌ Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET.");
  console.error("   Check that server/.env exists and that you run 'npm start' inside the server folder.");
  process.exit(1);
}
if (!KEY_ID.startsWith("rzp_test_")) {
  console.warn("⚠️  Your key does not start with rzp_test_. Use test keys for this demo.");
}

const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

// Health check: open http://localhost:3000/api/health in the browser
app.get("/api/health", (req, res) => {
  res.json({ ok: true, keysLoaded: true, keyPrefix: KEY_ID.slice(0, 12) });
});

// 1. Create a Razorpay order. Amount arrives in rupees and is converted to paise.
app.post("/api/create-order", async (req, res) => {
  try {
    const amount = Math.round(Number(req.body.amount) * 100);
    console.log("Creating order, amount in paise:", amount);

    if (!Number.isFinite(amount) || amount < 100) {
      return res.status(400).json({ error: "Amount must be at least ₹1." });
    }

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: "rcpt_" + Date.now()
    });

    console.log("Order created:", order.id);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: KEY_ID });
  } catch (err) {
    console.error("Razorpay error:", err && (err.error || err.message || err));
    const reason = (err && err.error && err.error.description) || err.message || "Unknown error";
    res.status(500).json({ error: "Could not create order: " + reason });
  }
});

// 2. Verify the payment signature so it cannot be faked
app.post("/api/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const expected = crypto
    .createHmac("sha256", KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (expected === razorpay_signature) res.json({ verified: true });
  else res.status(400).json({ verified: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Razorpay server running at http://localhost:${PORT}`);
  console.log(`   Using key: ${KEY_ID.slice(0, 12)}...`);
});
