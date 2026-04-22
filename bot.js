require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const axios = require('axios');

// ================= ENV =================
const BOT_TOKEN = process.env.BOT_TOKEN;
let ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
  console.error('❌ Missing BOT_TOKEN');
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

// ================= SAFE SEND =================
async function safeSend(chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (e) {
    console.log('❌ SEND ERROR:', e.message);
  }
}

// ================= AUTO DETECT CHAT ID (FIX FOR SUPERGROUP) =================
bot.on('message', (msg) => {
  if (!ADMIN_CHAT_ID) {
    ADMIN_CHAT_ID = msg.chat.id;
    console.log('📌 Auto ADMIN_CHAT_ID set:', ADMIN_CHAT_ID);
  }

  if (!msg.text) return;

  // ================= CAT =================
  if (msg.text.toLowerCase() === 'кіт') {
    const arr = [
      '🐱 Тицяє лапкою і каже маааау!',
      '🐱 Робить кусь за жопку!',
      '🐱 Чорне падло спить! Храп-храп!'
    ];

    safeSend(msg.chat.id, arr[Math.floor(Math.random() * arr.length)]);
  }
});

// ================= MENU =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '💱 Курс валют', callback_data: 'currency' }],
    [{ text: '🎂 ДН сьогодні', callback_data: 'today_bd' }],
    [{ text: '📜 Список ДН', callback_data: 'list_bd' }]
  ]
};

// ================= COMMANDS =================
bot.onText(/\/start|\/bot/, (msg) => {
  safeSend(msg.chat.id, '📋 Котоменю', { reply_markup: mainMenu });
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  bot.answerCallbackQuery(q.id);

  // ===== CURRENCY =====
  if (data === 'currency') {
    try {
      const res = await axios.get('https://api.monobank.ua/bank/currency');

      const usd = res.data.find(c => c.currencyCodeA === 840 && c.currencyCodeB === 980);
      const eur = res.data.find(c => c.currencyCodeA === 978 && c.currencyCodeB === 980);

      safeSend(
        chatId,
        `💱 Курс валют\n\n` +
        `🇺🇸 USD: ${usd?.rateBuy ?? '-'} / ${usd?.rateSell ?? '-'}\n` +
        `🇪🇺 EUR: ${eur?.rateBuy ?? '-'} / ${eur?.rateSell ?? '-'}`
      );
    } catch {
      safeSend(chatId, '❌ Помилка курсу');
    }
  }

  // ===== BIRTHDAYS =====
  if (data === 'today_bd') {
    const now = new Date();
    const today =
      String(now.getDate()).padStart(2, '0') +
      '.' +
      String(now.getMonth() + 1).padStart(2, '0');

    const bd = BIRTHDAYS.find(x => x.date === today);

    safeSend(chatId, bd ? `🎂 ${bd.name}` : '📭 сьогодні нікого');
  }

  if (data === 'list_bd') {
    safeSend(chatId, BIRTHDAYS.map(b => `🎁 ${b.name} - ${b.date}`).join('\n') || 'empty');
  }
});

// ================= FIXED SCHEDULER =================
function getKyivTime() {
  return new Date().toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function getDate() {
  return new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Europe/Kyiv'
  });
}

setInterval(() => {
  const time = getKyivTime();
  const today = getDate();

  // reset щодня
  if (lastDate !== today) {
    sentTasks.clear();
    lastDate = today;
    console.log('🔄 New day reset');
  }

  SCHEDULE.forEach(task => {
    if (!task.active) return;

    const key = `${today}-${task.time}-${task.message}`;

    if (task.time === time && !sentTasks.has(key)) {
      safeSend(ADMIN_CHAT_ID, task.message);
      sentTasks.add(key);

      console.log('📢 SENT:', task.message);
    }
  });

}, 5000);

// ================= SERVER (KEEP ALIVE) =================
http.createServer((_, res) => {
  res.end('OK');
}).listen(process.env.PORT || 3000);

console.log('✅ bot running');