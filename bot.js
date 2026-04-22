require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const https = require('https');
const axios = require('axios');
const ping = require('ping');
const net = require('net');

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

let sentTasks = new Set();

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

  try {
    bot.answerCallbackQuery(q.id);

    // ================= 💱 CURRENCY =================
    if (data === 'currency') {
      const res = await axios.get('https://api.monobank.ua/bank/currency');

      const usd = res.data.find(c => c.currencyCodeA === 840 && c.currencyCodeB === 980);
      const eur = res.data.find(c => c.currencyCodeA === 978 && c.currencyCodeB === 980);

      return bot.sendMessage(
        chatId,
        `💱 Курс валют\n\n` +
        `🇺🇸 USD: ${usd?.rateBuy ?? '-'} / ${usd?.rateSell ?? '-'}\n` +
        `🇪🇺 EUR: ${eur?.rateBuy ?? '-'} / ${eur?.rateSell ?? '-'}`
      );
    }

    // ================= BD =================
    if (data === 'today_bd') {
      const now = new Date();
      const today =
        String(now.getDate()).padStart(2, '0') +
        '.' +
        String(now.getMonth() + 1).padStart(2, '0');

      const bd = BIRTHDAYS.find(x => x.date === today);

      return bot.sendMessage(chatId, bd ? `🎂 ${bd.name}` : '📭 сьогодні немає імениника');
    }

    if (data === 'list_bd') {
      return bot.sendMessage(
        chatId,
        BIRTHDAYS.map(b => `🎁 ${b.name} - ${b.date}`).join('\n') || 'empty'
      );
    }

    // ================= 🌐 INTERNET (FIXED) =================
    if (data === 'ping_router') {
      bot.sendMessage(chatId, '🔄 перевіряю роутер...');

      if (!ROUTER_IP) {
        return bot.sendMessage(chatId, '⚠️ ROUTER_IP не заданий');
      }

      // 1️⃣ ICMP ping
      const result = await ping.promise.probe(ROUTER_IP, {
        timeout: 2
      });

      if (result.alive) {
        return bot.sendMessage(chatId, '🟢 Пінг є → інтернет має бути');
      }

      // 2️⃣ fallback TCP
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.on('connect', () => {
        socket.destroy();
        bot.sendMessage(chatId, '🟢 Роутер відповідає (TCP)');
      });

      socket.on('timeout', () => {
        socket.destroy();
        bot.sendMessage(chatId, '🔴 Нема відповіді від роутера');
      });

      socket.on('error', () => {
        bot.sendMessage(chatId, '🔴 Роутер недоступний');
      });

      socket.connect(80, ROUTER_IP);
    }

  } catch (err) {
    console.error('Callback error:', err.message);
    bot.sendMessage(chatId, '❌ Сталася помилка');
  }
});

// ================= FIXED SCHEDULE =================
setInterval(() => {
  const now = new Date();

  const time =
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0');

  SCHEDULE.forEach(task => {
    if (!task.active) return;

    const key = task.time + task.message;

    if (task.time === time && !sentTasks.has(key)) {
      bot.sendMessage(ADMIN_CHAT_ID, task.message);
      sentTasks.add(key);

      console.log('📢 sent:', task.message);
    }
  });

  // reset щодня
  if (time === '00:01') {
    sentTasks.clear();
  }

}, 1000);

// ================= SERVER =================
http.createServer((_, res) => {
  res.end('OK');
}).listen(process.env.PORT || 3000);

console.log('✅ bot running');