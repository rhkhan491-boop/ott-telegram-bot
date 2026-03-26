require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

// 🛡️ Anti-crash
process.on("uncaughtException", (err) => console.log("ERROR:", err));
process.on("unhandledRejection", (err) => console.log("PROMISE ERROR:", err));

// 🤖 BOT
const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true,
});

// 🌐 Keep Render alive
require("http")
  .createServer((req, res) => res.end("Bot running"))
  .listen(process.env.PORT || 3000);

// ⚙️ CONFIG
const ADMIN_ID = 6034840006;
const UPI_ID = "rahikhann@fam";
const API_KEY = "6dEMdbDI2nFl2IXqalyE4NcYqLseca02nZ945tOydiSveqKRUGyW6HnFe62fNB10"; // ⚠️ put your real key
const API_URL = "https://indiansmmprovider.in/api/v2";

// 🧠 MEMORY
let users = {};
let pendingPayments = {};
let userState = {};

// 🚀 START
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = { balance: 0, selectedService: null };
  userState[chatId] = null;

  bot.sendMessage(
    chatId,
    `👋 Welcome to CHEAP OTT HUB 😎🔥\n\nChoose option 👇`,
    {
      reply_markup: {
        keyboard: [
          ["🎬 OTT Subscriptions"],
          ["💰 Balance", "➕ Add Balance"],
          ["📞 Support"],
        ],
        resize_keyboard: true,
      },
    }
  );
});

// 📡 FETCH SERVICES
async function getServices() {
  try {
    const res = await axios.post(API_URL, null, {
      params: { key: API_KEY, action: "services" },
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

// 🎯 FILTER OTT
function filterOTT(services) {
  return services.filter((s) => {
    if (!s.name) return false;
    let n = s.name.toLowerCase();
    return (
      n.includes("netflix") ||
      n.includes("prime") ||
      n.includes("hotstar") ||
      n.includes("zee") ||
      n.includes("sony")
    );
  });
}

// 🎬 SHOW OTT
bot.onText(/🎬 OTT Subscriptions/, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "⏳ Loading deals...");

  let services = await getServices();
  let ott = filterOTT(services);

  if (!ott.length) return bot.sendMessage(chatId, "❌ No services");

  users[chatId].services = ott;

  let buttons = ott.slice(0, 10).map((s, i) => [
    { text: `🎬 ${s.name}`, callback_data: `service_${i}` },
  ]);

  bot.sendMessage(chatId, "🎬 Choose subscription 👇", {
    reply_markup: { inline_keyboard: buttons },
  });
});

// 🔘 CALLBACK
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 🎬 SELECT
  if (data.startsWith("service_")) {
    let service = users[chatId].services[data.split("_")[1]];
    let price = Number(service.rate);
    let finalPrice = price + price * 0.5;

    users[chatId].selectedService = service;

    return bot.sendMessage(
      chatId,
      `🎬 ${service.name}\n\n💰 Price: ₹${finalPrice}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛒 Buy Now", callback_data: "buy_now" }],
          ],
        },
      }
    );
  }

  // 🛒 BUY
  if (data === "buy_now") {
    let service = users[chatId].selectedService;
    let price = Number(service.rate);
    let finalPrice = price + price * 0.5;

    if (users[chatId].balance < finalPrice) {
      return bot.sendMessage(chatId, "❌ Low balance");
    }

    users[chatId].balance -= finalPrice;

    bot.sendMessage(chatId, "⏳ Processing...");

    try {
      let res = await axios.post(API_URL, null, {
        params: {
          key: API_KEY,
          action: "add",
          service: service.service,
          quantity: 1,
          link: "demo",
        },
      });

      bot.sendMessage(
        chatId,
        `✅ Order Done!\nID: ${res.data.order}`
      );
    } catch {
      bot.sendMessage(chatId, "❌ Order failed");
    }

    users[chatId].selectedService = null;
  }

  // 💳 PAID
  if (data === "paid") {
    bot.sendMessage(chatId, "📸 Send screenshot");
  }

  // ✅ APPROVE
  if (data.startsWith("approve_")) {
    let userId = data.split("_")[1];
    let amount = pendingPayments[userId];

    users[userId].balance += Number(amount);

    bot.sendMessage(userId, `✅ ₹${amount} added`);
  }
});

// 💰 BALANCE
bot.onText(/💰 Balance/, (msg) => {
  let bal = users[msg.chat.id]?.balance || 0;
  bot.sendMessage(msg.chat.id, `💰 Balance: ₹${bal}`);
});

// ➕ ADD BALANCE
bot.onText(/➕ Add Balance/, (msg) => {
  userState[msg.chat.id] = "adding";
  bot.sendMessage(msg.chat.id, "Enter amount:");
});

// 💵 HANDLE AMOUNT
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.text || msg.text.startsWith("/")) return;

  if (userState[chatId] === "adding") {
    let amount = Number(msg.text);

    if (isNaN(amount)) return bot.sendMessage(chatId, "Invalid");

    let upi = `upi://pay?pa=${UPI_ID}&am=${amount}&cu=INR`;

    const file = path.join(__dirname, `qr_${chatId}.png`);
    await QRCode.toFile(file, upi);

    pendingPayments[chatId] = amount;
    userState[chatId] = null;

    await bot.sendPhoto(chatId, file, {
      caption: `Pay ₹${amount}`,
      reply_markup: {
        inline_keyboard: [[{ text: "I PAID", callback_data: "paid" }]],
      },
    });

    fs.unlinkSync(file);
  }
});

// 📸 SCREENSHOT
bot.on("photo", (msg) => {
  const chatId = msg.chat.id;
  let amount = pendingPayments[chatId];

  bot.sendPhoto(ADMIN_ID, msg.photo.pop().file_id, {
    caption: `User: ${chatId}\n₹${amount}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Approve", callback_data: `approve_${chatId}` }],
      ],
    },
  });

  bot.sendMessage(chatId, "⏳ Waiting approval");
});

// 📞 SUPPORT
bot.onText(/📞 Support/, (msg) => {
  bot.sendMessage(msg.chat.id, "Contact: @not_your_rahi");
});

console.log("✅ Bot running...");
