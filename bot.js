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
  console.log('✅ schedule loaded:', SCHEDULE.length);
} catch {
  console.log('⚠️ schedule missing');
}

// ================= BOT =================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 🔥 IMPORTANT: стабільне зберігання відправлених задач
let sentTasks = new Set();
let lastDate = null;

// ================= CAT =================
bot.on('message', (msg) => {
  if (!msg.text) return;

  if (msg.text.toLowerCase() === 'кіт') {
    const arr = [
      '🐱 Тицяє лапкою і каже маааау!',
      '🐱 Робить кусь за жопку!',
      '🐱 Чорне падло спить! Храп-храп!'
    ];
    bot.sendMessage(msg.chat.id, arr[Math.floor(Math.random() * arr.length)]);
  }
});

// ================= MENU =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '💱 Космічний кур валют', callback_data: 'currency' }],
    [{ text: '🎂 ДН сьогодні', callback_data: 'today_bd' }],
    [{ text: '📜 Список ДН', callback_data: 'list_bd' }],
    [{ text: '🌐 Інтернет', callback_data: 'ping_router' }]
  ]
};

// ================= COMMANDS =================
bot.onText(/\/start|\/bot/, (msg) => {
  bot.sendMessage(msg.chat.id, '📋 Котоменю', { reply_markup: mainMenu });
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  bot.answerCallbackQuery(q.id);

  // ================= CURRENCY =================
  if (data === 'currency') {
    try {
      const res = await axios.get('https://api.monobank.ua/bank/currency');

      const usd = res.data.find(c => c.currencyCodeA === 840 && c.currencyCodeB === 980);
      const eur = res.data.find(c => c.currencyCodeA === 978 && c.currencyCodeB === 980);

      bot.sendMessage(
        chatId,
        `💱 Курс валют\n\n` +
        `🇺🇸 USD: ${usd?.rateBuy ?? '-'} / ${usd?.rateSell ?? '-'}\n` +
        `🇪🇺 EUR: ${eur?.rateBuy ?? '-'} / ${eur?.rateSell ?? '-'}`
      );
    } catch {
      bot.sendMessage(chatId, '❌ Помилка курсу');
    }
  }

  // ================= BD =================
  if (data === 'today_bd') {
    const now = new Date();
    const today =
      String(now.getDate()).padStart(2, '0') +
      '.' +
      String(now.getMonth() + 1).padStart(2, '0');

    const bd = BIRTHDAYS.find(x => x.date === today);

    bot.sendMessage(chatId, bd ? `🎂 ${bd.name}` : '📭 сьогодні немає імениника');
  }

  if (data === 'list_bd') {
    bot.sendMessage(
      chatId,
      BIRTHDAYS.map(b => `🎁 ${b.name} - ${b.date}`).join('\n') || 'empty'
    );
  }

  // ================= INTERNET CHECK =================
  if (data === 'ping_router') {
    bot.sendMessage(chatId, '🔄 перевіряю інтернет...');

    if (!ROUTER_IP) {
      return bot.sendMessage(chatId, '⚠️ ROUTER_IP не заданий');
    }

    const req = http.get(`http://${ROUTER_IP}`, { timeout: 4000 }, () => {
      bot.sendMessage(chatId, '🟢 Роутер відповідає → інтернет є');
    });

    req.on('error', () => {
      bot.sendMessage(chatId, '🔴 Роутер недоступний → інтернету немає');
    });

    req.on('timeout', () => {
      req.destroy();
      bot.sendMessage(chatId, '🔴 Таймаут → роутер не відповідає');
    });
  }
});

// ================= 🔥 FIXED SCHEDULE ENGINE =================
setInterval(() => {
  const now = new Date();

  // 🇺🇦 Kyiv time (ВАЖЛИВО)
  const time = now.toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const todayDate = now.toISOString().split('T')[0];

  // 🔄 новий день → очищення
  if (lastDate !== todayDate) {
    sentTasks.clear();
    lastDate = todayDate;
  }

  SCHEDULE.forEach(task => {
    if (!task.active) return;

    const key = `${todayDate}-${task.time}-${task.message}`;

    if (task.time === time && !sentTasks.has(key)) {
      bot.sendMessage(ADMIN_CHAT_ID, task.message);
      sentTasks.add(key);

      console.log('📢 sent:', task.message);
    }
  });

}, 15000); // 🔥 15 сек — стабільно на Render

// ================= SERVER =================
http.createServer((_, res) => {
  res.end('OK');
}).listen(process.env.PORT || 3000);

console.log('✅ bot running');