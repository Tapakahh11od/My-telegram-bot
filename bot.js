require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const https = require('https');
const axios = require('axios');

// ================= ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ROUTER_IP = process.env.ROUTER_IP;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('❌ Missing ENV');
  process.exit(1);
}

// ================= DATA =================
let BIRTHDAYS = [];
try {
  BIRTHDAYS = require('./birthdays.json');
} catch {}

let SCHEDULE = [];
try {
  SCHEDULE = require('./schedule.json');
  console.log('✅ schedule loaded');
} catch {
  console.log('⚠️ schedule missing');
}

// ================= BOT =================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let sentTasks = [];
let routerState = { offline: false };

// ================= CAT =================
bot.on('message', (msg) => {
  if (!msg.text) return;

  if (msg.text.toLowerCase() === 'кіт') {
    const arr = ['🐱 мяу', '🐱 кусь', '🐱 спить'];
    bot.sendMessage(msg.chat.id, arr[Math.floor(Math.random() * arr.length)]);
  }
});

// ================= MENU =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '💱 Курс валют', callback_data: 'currency' }],
    [{ text: '🎂 ДН сьогодні', callback_data: 'today_bd' }],
    [{ text: '📜 Список ДН', callback_data: 'list_bd' }],
    [{ text: '🌐 Інтернет', callback_data: 'ping_router' }]
  ]
};

// ================= COMMANDS =================
bot.onText(/\/start|\/bot/, (msg) => {
  bot.sendMessage(msg.chat.id, '📋 Меню', { reply_markup: mainMenu });
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  bot.answerCallbackQuery(q.id);

  // ================= 💱 CURRENCY (FIXED) =================
  if (data === 'currency') {
    try {
      const res = await axios.get('https://api.monobank.ua/bank/currency');

      const usd = res.data.find(c => c.currencyCodeA === 840 && c.currencyCodeB === 980);
      const eur = res.data.find(c => c.currencyCodeA === 978 && c.currencyCodeB === 980);

      await bot.sendMessage(
        chatId,
        `💱 *Курс валют*\n\n` +
        `🇺🇸 USD: ${usd?.rateBuy ?? '-'} / ${usd?.rateSell ?? '-'}\n` +
        `🇪🇺 EUR: ${eur?.rateBuy ?? '-'} / ${eur?.rateSell ?? '-'}`,
        { parse_mode: 'Markdown' }
      );

    } catch (e) {
      console.log('Currency error:', e.message);
      bot.sendMessage(chatId, '❌ Помилка курсу валют');
    }
  }

  // ================= 🎂 TODAY BD =================
  if (data === 'today_bd') {
    const now = new Date();
    const today = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}`;

    const bd = BIRTHDAYS.find(x => x.date === today);

    bot.sendMessage(chatId, bd ? `🎂 ${bd.name}` : '📭 нікого');
  }

  // ================= 📜 LIST BD =================
  if (data === 'list_bd') {
    bot.sendMessage(
      chatId,
      BIRTHDAYS.map(b => `🎁 ${b.name} - ${b.date}`).join('\n') || 'empty'
    );
  }

  // ================= 🌐 INTERNET CHECK =================
  if (data === 'ping_router') {
    bot.sendMessage(chatId, '🔄 check...');

    const checkInternet = () => {
      https.get('https://api.monobank.ua', { timeout: 4000 }, () => {
        bot.sendMessage(chatId, '🟢 Інтернет є');
      }).on('error', () => {
        bot.sendMessage(chatId, '🔴 Нема інтернету');
      });
    };

    http.get(`http://${ROUTER_IP}`, { timeout: 3000 }, () => {
      checkInternet();
    }).on('error', () => {
      https.get(`https://${ROUTER_IP}`, { timeout: 3000 }, () => {
        checkInternet();
      }).on('error', () => {
        bot.sendMessage(chatId, '🔴 роутер недоступний');
      });
    });
  }
});

// ================= TIMER =================
setInterval(() => {
  const now = new Date();

  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  SCHEDULE.forEach(t => {
    if (!t.active) return;

    if (t.time === time) {
      const key = t.time + t.message;

      if (!sentTasks.includes(key)) {
        bot.sendMessage(ADMIN_CHAT_ID, t.message);
        sentTasks.push(key);
      }
    }
  });

  if (time === '00:01') sentTasks = [];

}, 10000);

// ================= SERVER =================
http.createServer((_, res) => {
  res.end('OK');
}).listen(process.env.PORT || 3000);

console.log('✅ bot running');