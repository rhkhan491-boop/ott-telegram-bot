const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

// 🛡️ Anti-crash
process.on("uncaughtException", (err) => console.log("ERROR:", err));
process.on("unhandledRejection", (err) => console.log("PROMISE ERROR:", err));

require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true,
});

const ADMIN_ID = 6034840006;
const UPI_ID = "rahikhann@fam";
const API_KEY = "6dEMdbDI2nFl2IXqalyE4NcYqLseca02nZ945tOydiSveqKRUGyW6HnFe62fNB10";
const API_URL = "https://indiansmmprovider.in/api/v2";

let users = {};
let pendingPayments = {};
let userState = {};

// 🚀 START
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    users[chatId] = { balance: 0, selectedService: null };
    userState[chatId] = null;

    bot.sendMessage(chatId,
`👋 *Welcome to CHEAP OTT HUB* 😎🔥

🎬 Premium subscriptions at *crazy low prices* 💸

👇 Choose what you wanna do:`,
{
    parse_mode: "Markdown",
    reply_markup: {
        keyboard: [
            ["🎬 OTT Subscriptions"],
            ["💰 Balance", "➕ Add Balance"],
            ["📞 Support"]
        ],
        resize_keyboard: true
    }
});
});

// 📡 FETCH SERVICES
async function getServices() {
    try {
        const res = await axios.post(API_URL, null, {
            params: { key: API_KEY, action: "services" }
        });
        return Array.isArray(res.data) ? res.data : [];
    } catch {
        return [];
    }
}

// 🎯 FILTER OTT
function filterOTT(services) {
    return services.filter(s => {
        if (!s.name) return false;
        let n = s.name.toLowerCase();
        return n.includes("netflix") || n.includes("prime") || n.includes("hotstar") || n.includes("zee") || n.includes("sony");
    });
}

// 🎬 OTT LIST
bot.onText(/🎬 OTT Subscriptions/, async (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, "⏳ Loading fire deals... 🔥");

    let services = await getServices();
    let ott = filterOTT(services);

    if (!ott.length) return bot.sendMessage(chatId, "❌ No services rn");

    users[chatId].services = ott;

    let buttons = ott.slice(0, 10).map((s, i) => ([
        { text: `🎬 ${s.name}`, callback_data: `service_${i}` }
    ]));

    bot.sendMessage(chatId,
`🎬 *Choose your subscription:* 👇

⚡ Fast delivery  
💸 Cheapest rates  
🔥 Limited stock`,
{
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
});
});

// 🔘 CALLBACK
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // 🎬 SELECT SERVICE
    if (data.startsWith("service_")) {
        let service = users[chatId].services[data.split("_")[1]];

        let price = Number(service.rate);
        let finalPrice = price + (price * 0.5);

        users[chatId].selectedService = service;

        return bot.sendMessage(chatId,
`🎬 *${service.name}*

💰 Price: *₹${finalPrice}*

✨ What you get:
✔ Instant activation  
✔ Full access  
✔ 100% working  

👇 Ready to grab?`,
{
    parse_mode: "Markdown",
    reply_markup: {
        inline_keyboard: [
            [{ text: "🛒 Buy Now 🚀", callback_data: "buy_now" }]
        ]
    }
});
    }

    // 🛒 BUY
    if (data === "buy_now") {
        let service = users[chatId].selectedService;

        let price = Number(service.rate);
        let finalPrice = price + (price * 0.5);

        if (users[chatId].balance < finalPrice) {
            return bot.sendMessage(chatId,
`❌ *Low balance bro 💀*

💡 Add money first using ➕ Add Balance`,
{ parse_mode: "Markdown" });
        }

        users[chatId].balance -= finalPrice;

        bot.sendMessage(chatId, "⏳ Processing your order... 🚀");

        try {
            let res = await axios.post(API_URL, null, {
                params: {
                    key: API_KEY,
                    action: "add",
                    service: service.service,
                    quantity: 1,
                    link: "demo"
                }
            });

            bot.sendMessage(chatId,
`✅ *Order Successful!* 🎉

🎬 ${service.name}  
🆔 ID: ${res.data.order}

📩 Details will arrive soon ⚡`,
{ parse_mode: "Markdown" });

        } catch {
            bot.sendMessage(chatId, "❌ Order failed, try again");
        }

        users[chatId].selectedService = null;
    }

    // 💳 PAID
    if (data === "paid") {
        return bot.sendMessage(chatId, "📸 Send payment screenshot");
    }

    // ✅ APPROVE
    if (data.startsWith("approve_")) {
        let userId = data.split("_")[1];
        let amount = pendingPayments[userId];

        users[userId].balance += Number(amount);

        return bot.sendMessage(userId,
`✅ *Balance Added!* 💸

₹${amount} credited successfully`,
{ parse_mode: "Markdown" });
    }
});

// 💰 BALANCE
bot.onText(/💰 Balance/, (msg) => {
    let bal = users[msg.chat.id]?.balance || 0;

    bot.sendMessage(msg.chat.id,
`💰 *Your Wallet*

Balance: ₹${bal}

💡 Use it to buy subscriptions`,
{ parse_mode: "Markdown" });
});

// ➕ ADD BALANCE
bot.onText(/➕ Add Balance/, (msg) => {
    const chatId = msg.chat.id;

    userState[chatId] = "adding_balance";

    bot.sendMessage(chatId,
`💵 *Add Balance*

Enter amount you want to add 👇`,
{ parse_mode: "Markdown" });
});

// 📩 MESSAGE HANDLER
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (!msg.text || msg.text.startsWith("/")) return;

    // 💵 ADD BALANCE
    if (userState[chatId] === "adding_balance") {
        try {
            let amount = Number(msg.text);

            if (isNaN(amount) || amount <= 0) {
                return bot.sendMessage(chatId, "❌ Enter valid amount");
            }

            let upi = `upi://pay?pa=${UPI_ID}&am=${amount}&cu=INR`;

            const filePath = path.join(__dirname, `qr_${chatId}.png`);
            await QRCode.toFile(filePath, upi);

            pendingPayments[chatId] = amount;
            userState[chatId] = null;

            await bot.sendPhoto(chatId, filePath, {
                caption:
`💵 *Add Balance*

Amount: ₹${amount}

📌 Steps:
1. Scan QR  
2. Pay  
3. Click "I PAID"  
4. Send screenshot  

⚡ Fast approval`,
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✅ I PAID", callback_data: "paid" }]
                    ]
                }
            });

            fs.unlinkSync(filePath);

        } catch (err) {
            bot.sendMessage(chatId, "❌ QR error");
        }
    }
});

// 📸 SCREENSHOT
bot.on("photo", (msg) => {
    const chatId = msg.chat.id;
    let amount = pendingPayments[chatId];

    bot.sendPhoto(ADMIN_ID, msg.photo.pop().file_id, {
        caption: `💰 Payment\nUser: ${chatId}\n₹${amount}`,
        reply_markup: {
            inline_keyboard: [
                [{ text: "Approve ✅", callback_data: `approve_${chatId}` }]
            ]
        }
    });

    bot.sendMessage(chatId, "⏳ Waiting for approval...");
});

// 📞 SUPPORT
bot.onText(/📞 Support/, (msg) => {
    bot.sendMessage(msg.chat.id,
`📞 *Support*

Any issue? ping here 👇  
👉 @not_your_rahi

⚡ Fast reply`,
{ parse_mode: "Markdown" });
});