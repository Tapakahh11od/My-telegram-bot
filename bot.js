require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const https = require('https');

// 🔐 ENV
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ROUTER_IP = process.env.ROUTER_IP;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

// 🎂 Дні народження
let BIRTHDAYS = [];
try { BIRTHDAYS = require('./birthdays.json'); } 
catch (e) { console.log('⚠️ birthdays.json не знайдено'); }

// 📅 Розклад (🔥 ВИПРАВЛЕНО)
let SCHEDULE = [];
try {
  SCHEDULE = require('./schedule.json');
  console.log('✅ schedule.json завантажено');
} catch (e) {
  console.log('⚠️ schedule.json не знайдено');
}

// 🔥 Перевірка
if (!BOT_TOKEN || !GITHUB_TOKEN || !GIST_ID) {
  console.error('❌ Не вистачає змінних');
  process.exit(1);
}
if (!ADMIN_CHAT_ID) {
  console.error('❌ Нема ADMIN_CHAT_ID');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 📊 Стани
let routerAutoState = { isOffline: false };
let lastBirthdayNotified = '';
let sentScheduleTasks = [];

// ================= 🐱 КІТ =================
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text = msg.text.trim().toLowerCase();
  if (text === 'кіт') {
    const responses = ['🐱 Тицяє лапкою і каже маааау!', '🐱 Робить кусь за жопку!'];
    const random = responses[Math.floor(Math.random() * responses.length)];
    bot.sendMessage(msg.chat.id, random);
  }
});

// ================= 📋 МЕНЮ =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '💱 Курс валют', callback_data: 'currency' }],
    [{ text: '🎂 Хто сьогодні іменинник?', callback_data: 'today_bd' }],
    [{ text: '📜 Весь список ДН', callback_data: 'list_bd' }],
    [{ text: '🌐 Перевірка інтернету', callback_data: 'ping_router' }],
    [{ text: '🆔 ID чату', callback_data: 'chat_id' }],
    [{ text: '💸 Облік витрат', callback_data: 'expenses_menu' }]
  ]
};

const expensesMenu = {
  inline_keyboard: [
    [{ text: '➕ Додати витрату', callback_data: 'add_expense' }],
    [{ text: '📅 Витрати за сьогодні', callback_data: 'today_expenses' }],
    [{ text: '📊 Витрати за місяць', callback_data: 'month_expenses' }],
    [{ text: '🔙 Назад', callback_data: 'back_to_main' }]
  ]
};

// ================= 🚀 КОМАНДИ =================
bot.onText(/\/bot/, (msg) => {
  bot.sendMessage(msg.chat.id, '📋 Меню:', { reply_markup: mainMenu });
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Привіт! /bot');
});

// ================= ⏰ ТАЙМЕР (🔥 ВИПРАВЛЕНО ЧАС) =================
setInterval(() => {
  const now = new Date();

  const dateStr = now.toLocaleDateString('uk-UA', {
    timeZone: 'Europe/Kyiv'
  });

  const time = now.toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  console.log(`⏰ ${time}`);

  SCHEDULE.forEach(task => {
    if (!task.active) return;

    if (task.time === time) {
      const key = `${task.time}-${task.message}`;

      if (!sentScheduleTasks.includes(key)) {
        let msg = task.message;

        if (task.userId) {
          msg = `<a href="tg://user?id=${task.userId}">User</a>, ${msg}`;
        }

        bot.sendMessage(ADMIN_CHAT_ID, msg, { parse_mode: 'HTML' });
        sentScheduleTasks.push(key);

        console.log(`📢 Відправлено: ${task.message}`);
      }
    }
  });

  if (time === '00:01') {
    sentScheduleTasks = [];
  }

  // Інтернет
  https.get('https://api.monobank.ua', { timeout: 5000 }, () => {
    if (routerAutoState.isOffline) {
      routerAutoState.isOffline = false;
      bot.sendMessage(ADMIN_CHAT_ID, `🟢 Інтернет є (${time})`);
    }
  }).on('error', () => {
    if (!routerAutoState.isOffline) {
      routerAutoState.isOffline = true;
      bot.sendMessage(ADMIN_CHAT_ID, `🔴 Нема інтернету (${time})`);
    }
  });

}, 60000);

// ================= 🌐 SERVER =================
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => {
  res.end('OK');
}).listen(PORT);

console.log('✅ Bot started');