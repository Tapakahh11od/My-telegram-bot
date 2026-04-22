require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const https = require('https');
const axios = require('axios');

// ================= ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

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
    [{ text: '💱 Космічний курс валют', callback_data: 'currency' }],
    [{ text: '🎂 ДН сьогодні', callback_data: 'today_bd' }],
    [{ text: '📜 Список ДН', callback_data: 'list_bd' }]
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
        `🚀 Космічний курс валют 🛰️\n\n` +
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
});

// ================= 🔥 FIXED SCHEDULE ENGINE (100% RELIABLE) =================
setInterval(() => {
  const now = new Date();

  // 🔥 FIX: стабільний Kyiv time
  const kyiv = new Date(
    now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' })
  );

  const hh = String(kyiv.getHours()).padStart(2, '0');
  const mm = String(kyiv.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  const todayDate = kyiv.toISOString().split('T')[0];

  // 🔄 reset кожен новий день
  if (lastDate !== todayDate) {
    sentTasks.clear();
    lastDate = todayDate;
    console.log('🔄 new day reset');
  }

  // ================= SCHEDULE CHECK =================
  SCHEDULE.forEach(task => {
    if (!task.active) return;

    const taskTime = (task.time || '').trim();
    const key = `${todayDate}-${taskTime}-${task.message}`;

    if (taskTime === time && !sentTasks.has(key)) {
      bot.sendMessage(ADMIN_CHAT_ID, task.message);
      sentTasks.add(key);

      console.log('📢 SENT:', taskTime, task.message);
    }
  });

}, 5000); // 🔥 кожні 5 секунд (НЕ МОЖНА ПРОПУСТИТИ)

// ================= SERVER =================
http.createServer((_, res) => {
  res.end('OK');
}).listen(process.env.PORT || 3000);

console.log('✅ bot running');