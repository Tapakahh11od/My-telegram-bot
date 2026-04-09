const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const { exec } = require('child_process');
const https = require('https');

// 📦 1. Завантаження конфігурації
let localConfig = { settings: {}, router: {} };
try { localConfig = require('./config.json'); } catch (e) {}

const BOT_TOKEN = process.env.BOT_TOKEN || localConfig.settings.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || localConfig.settings.ADMIN_CHAT_ID;
const ROUTER_IP = process.env.ROUTER_IP || localConfig.router.ip;

// 🎂 Дні народження
let BIRTHDAYS = [];
if (process.env.BIRTHDAYS) {
  try { BIRTHDAYS = JSON.parse(process.env.BIRTHDAYS); } 
  catch (e) { console.error('❌ Помилка BIRTHDAYS у змінних'); }
} else {
  try { BIRTHDAYS = require('./birthdays.json'); } 
  catch (e) { console.log('⚠️ birthdays.json не знайдено, список порожній'); }
}

// 📅 Розклад завдань
let SCHEDULE = [];
try { SCHEDULE = require('./schedule.json'); } 
catch (e) { console.log('⚠️ schedule.json не знайдено, розкладу немає.'); }

if (!BOT_TOKEN) { console.error('❌ Вкажи BOT_TOKEN'); process.exit(1); }

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Стани
let routerAutoState = { isOffline: false };
let lastBirthdayNotified = '';
let sentScheduleTasks = []; // Трекер, щоб не спамити одне завдання двічі за хвилину

// ================= 🐱 РЕАКЦІЯ НА СЛОВО "КІТ" =================
bot.on('message', (msg) => {
  // Перевіряємо, чи є текст у повідомленні
  if (!msg.text) return;
  
  const text = msg.text.trim().toLowerCase();
  
  // Перевіряємо, чи це точно слово "кіт" (і не команда)
  if (text === 'кіт') {
    console.log('🐱 Отримано "кіт", відправляю Мяу!');
    bot.sendMessage(msg.chat.id, '🐱 Мяу!');
  }
});

// ================= 📋 МЕНЮ (Кнопки) =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '💱 Курс валют', callback_data: 'currency' }],
    [{ text: '🎂 Хто сьогодні іменинник?', callback_data: 'today_bd' }],
    [{ text: '📜 Весь список ДН', callback_data: 'list_bd' }],
    [{ text: '🌐 Пінг роутера', callback_data: 'ping_router' }],
    [{ text: '🆔 ID чату', callback_data: 'chat_id' }]
  ]
};

bot.onText(/\/bot/, (msg) => {
  bot.sendMessage(msg.chat.id, '📋 **Головне меню**\nОберіть потрібну функцію:', { reply_markup: mainMenu, parse_mode: 'Markdown' });
});
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, '👋 Привіт! Натисни /bot, щоб відкрити меню.', { parse_mode: 'Markdown' }));


// ================= 🔘 ОБРОБКА КНОПОК =================
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  await bot.answerCallbackQuery(cb.id);

  switch (cb.data) {
    case 'currency':
      bot.sendMessage(chatId, '⏳ Завантажую курс...').then(() => getCurrency().then(t => bot.sendMessage(chatId, t, { parse_mode: 'Markdown' })));
      break;
    case 'today_bd':
      const today = getTodayBirthdays();
      bot.sendMessage(chatId, today.length > 0 ? `🎉 **Сьогодні святкують:**\n${today.map(p => `🎂 ${p.name}`).join('\n')}` : '📅 Сьогодні немає іменинників.', { parse_mode: 'Markdown' });
      break;
    case 'list_bd':
      if (BIRTHDAYS.length === 0) return bot.sendMessage(chatId, '📜 Список порожній.');
      const sorted = [...BIRTHDAYS].sort((a, b) => a.date.localeCompare(b.date));
      bot.sendMessage(chatId, '📜 **Повний список:**\n\n' + sorted.map(p => `🗓 ${p.date} — ${p.name}`).join('\n'), { parse_mode: 'Markdown' });
      break;
    case 'ping_router':
      bot.sendMessage(chatId, '📡 Пінгую роутер...').then(() => pingRouterOnce(chatId));
      break;
    case 'chat_id':
      bot.sendMessage(chatId, `🆔 ID цього чату: \`${chatId}\``, { parse_mode: 'Markdown' });
      break;
  }
});

// ================= ⚙️ ФУНКЦІЇ =================

function getTodayBirthdays() {
  const nowKyiv = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit' });
  const [day, month] = nowKyiv.split('.');
  return BIRTHDAYS.filter(p => p.date === `${day}.${month}`);
}

function getCurrency() {
  return new Promise((resolve) => {
    https.get('https://api.monobank.ua/bank/currency', { headers: { 'User-Agent': 'TG-Bot' }, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const usd = json.find(r => r.currencyCodeA === 840 && r.currencyCodeB === 980);
          const eur = json.find(r => r.currencyCodeA === 978 && r.currencyCodeB === 980);
          let t = '💱 **Monobank**\n\n';
          if (usd) t += `🇺🇸 USD: 🟢 ${usd.rateBuy} / 🔴 ${usd.rateSell}\n`;
          if (eur) t += `🇪🇺 EUR: 🟢 ${eur.rateBuy} / 🔴 ${eur.rateSell}\n`;
          resolve(t + '\n🟢 купівля | 🔴 продаж');
        } catch { resolve('❌ Помилка завантаження курсу.'); }
      });
    }).on('error', () => resolve('❌ Помилка завантаження курсу.'));
  });
}

function pingRouterOnce(chatId) {
  if (!ROUTER_IP) return bot.sendMessage(chatId, '❌ IP роутера не вказано');
  exec(`ping -n 1 ${ROUTER_IP}`, { timeout: 4000 }, (err) => {
    bot.sendMessage(chatId, err ? `🔴 Роутер офлайн!` : `🟢 Роутер онлайн!`);
  });
}

// ================= ⏰ АВТОМАТИЧНІ ЗАВДАННЯ (Кожну хвилину) =================
setInterval(() => {
  // 1. Час по Києву
  const nowKyiv = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  const [dateStr, timeStr] = nowKyiv.split(', ');
  const currentTime = timeStr.substring(0, 5); // "HH:MM"

  // 2. Перевірка розкладу (Schedule)
  SCHEDULE.forEach(task => {
    if (!task.active || task.time !== currentTime) return;
    
    // Перевірка, чи вже надсилали це сьогодні (щоб не спамити 60 разів за хвилину)
    const taskKey = `${task.time}-${task.message}`;
    if (!sentScheduleTasks.includes(taskKey)) {
      let finalMessage = task.message;
      // Якщо є userId, додаємо згадку (mention)
      if (task.userId) {
        // Telegram посилання на користувача
        finalMessage = `<a href="tg://user?id=${task.userId}">User</a>, ${finalMessage}`; 
      }
      
      bot.sendMessage(ADMIN_CHAT_ID, finalMessage, { parse_mode: 'HTML' });
      sentScheduleTasks.push(taskKey);
      console.log(`📅 Надіслано завдання: ${task.message}`);
    }
  });

  // Очистка історії надісланого о 00:01, щоб наступного дня завдання спрацювали знову
  if (currentTime === "00:01") sentScheduleTasks = [];

  // 3. Перевірка Днів Народження о 10:00
  if (currentTime === "10:00" && lastBirthdayNotified !== dateStr) {
    const today = getTodayBirthdays();
    if (today.length > 0) {
      bot.sendMessage(ADMIN_CHAT_ID, `☀️ **Доброго ранку!**\n🎉 Сьогодні святкують:\n${today.map(p => `🎂 ${p.name}`).join('\n')}\n🥳 Не забудь привітати!`, { parse_mode: 'Markdown' });
    }
    lastBirthdayNotified = dateStr;
  }

  // 4. Фоновий пінг роутера (перевірка стану мережі)
  if (ROUTER_IP) {
    exec(`ping -n 1 ${ROUTER_IP}`, { timeout: 4000 }, (err) => {
      const isOnline = !err;
      if (!isOnline && !routerAutoState.isOffline) {
        routerAutoState.isOffline = true;
        bot.sendMessage(ADMIN_CHAT_ID, `🔴 **Інтернет зник!**\n📡 ${ROUTER_IP} не відповідає.\n⏰ ${currentTime}`, { parse_mode: 'Markdown' });
      } else if (isOnline && routerAutoState.isOffline) {
        routerAutoState.isOffline = false;
        bot.sendMessage(ADMIN_CHAT_ID, `🟢 **Інтернет відновлено!**\n✅ ${ROUTER_IP} в мережі.\n⏰ ${currentTime}`, { parse_mode: 'Markdown' });
      }
    });
  }

}, 60000); // Запускається кожні 60 секунд

// 🌐 HTTP-сервер для Koyeb
http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('✅ Bot is alive');
}).listen(3000, () => console.log('🌐 Server on port 3000'));

console.log('✅ Бот запущено. Використовуй /bot для меню.');