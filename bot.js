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

// 🎂 Дні народження (з виправленням ключів з пробілами)
let BIRTHDAYS = [];
try {
  const raw = require('./birthdays.json');
  BIRTHDAYS = raw.map(b => ({
    name: (b.name || b['name '] || '').trim(),
    date: (b.date || b['date '] || '').trim()
  }));
} catch (e) { console.log('⚠️ birthdays.json не знайдено'); }

// 📅 Розклад (з виправленням ключів з пробілами)
let SCHEDULE = [];
try {
  const raw = require('./schedule.json');
  SCHEDULE = raw.map(task => ({
    time: (task.time || task['time '] || '').trim(),
    message: (task.message || task['message '] || '').trim(),
    active: task.active ?? task['active '] ?? true,
    userId: task.userId
  }));
  console.log('✅ schedule.json завантажено');
} catch (e) {
  console.log('⚠️ schedule.json не знайдено');
}

// 🔥 Перевірка змінних
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
  bot.sendMessage(msg.chat.id, '👋 Привіт! Надішліть /bot для меню', { reply_markup: mainMenu });
});

// ================= 🎯 ОБРОБКА КНОПОК (callback_query) =================
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // 💱 Курс валют
  if (data === 'currency') {
    bot.answerCallbackQuery(query.id, { text: 'Завантажую курс...' });
    https.get('https://api.monobank.ua/api/v1/currency', { timeout: 10000 }, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const rates = JSON.parse(rawData);
          const usd = rates.find(r => r.currencyCodeA === 840 && r.currencyCodeB === 980);
          const eur = rates.find(r => r.currencyCodeA === 978 && r.currencyCodeB === 980);
          let text = `💱 *Курс валют (Mono)*\n`;
          if (usd) {
            text += `🇺🇸 USD: купівля ${usd.rateBuy?.toFixed(2)}, продаж ${usd.rateSell?.toFixed(2)}\n`;
          }
          if (eur) {
            text += `🇪🇺 EUR: купівля ${eur.rateBuy?.toFixed(2)}, продаж ${eur.rateSell?.toFixed(2)}`;
          }
          bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (e) {
          bot.sendMessage(chatId, '❌ Не вдалося отримати курс валют');
        }
      });
    }).on('error', () => {
      bot.sendMessage(chatId, '❌ Помилка з'єднання з Mono');
    });
  }

  // 🎂 Сьогодні іменинник
  else if (data === 'today_bd') {
    bot.answerCallbackQuery(query.id);
    const now = new Date();
    const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
    const bd = BIRTHDAYS.find(b => b.date === today);
    if (bd) {
      bot.sendMessage(chatId, `🎂 Сьогодні день народження у: *${bd.name}*!`, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, '😊 Сьогодні ніхто не святкує!');
    }
  }

  // 📜 Весь список ДН
  else if (data === 'list_bd') {
    bot.answerCallbackQuery(query.id);
    if (BIRTHDAYS.length === 0) {
      bot.sendMessage(chatId, '📭 Список порожній');
      return;
    }
    const list = BIRTHDAYS.map(b => `🎁 ${b.name} — ${b.date}`).join('\n');
    bot.sendMessage(chatId, `📋 *Дні народження:*\n${list}`, { parse_mode: 'Markdown' });
  }

  // 🌐 Перевірка інтернету
  else if (data === 'ping_router') {
    bot.answerCallbackQuery(query.id, { text: 'Перевіряю...' });
    const target = ROUTER_IP || '8.8.8.8';
    https.get(`https://${target}`, { timeout: 5000 })
      .on('response', () => bot.sendMessage(chatId, '🟢 Інтернет працює!'))
      .on('error', () => {
        // Спробуємо HTTP
        http.get(`http://${target}`, { timeout: 3000 })
          .on('response', () => bot.sendMessage(chatId, '🟢 Роутер відповідає!'))
          .on('error', () => bot.sendMessage(chatId, '🔴 Нема зв'язку'));
      });
  }

  // 🆔 ID чату
  else if (data === 'chat_id') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, `🆔 ID цього чату: \`${chatId}\``, { parse_mode: 'Markdown' });
  }

  // 💸 Меню витрат
  else if (data === 'expenses_menu') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, '💸 Облік витрат:', { reply_markup: expensesMenu });
  }

  // ➕ Додати витрату (заглушка)
  else if (data === 'add_expense') {
    bot.answerCallbackQuery(query.id, { text: 'Функція в розробці 🔧' });
  }

  // 📅 Витрати за сьогодні (заглушка)
  else if (data === 'today_expenses') {
    bot.answerCallbackQuery(query.id, { text: 'Функція в розробці 🔧' });
  }

  // 📊 Витрати за місяць (заглушка)
  else if (data === 'month_expenses') {
    bot.answerCallbackQuery(query.id, { text: 'Функція в розробці 🔧' });
  }

  // 🔙 Назад до головного
  else if (data === 'back_to_main') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, '📋 Головне меню:', { reply_markup: mainMenu });
  }

  // Невідома кнопка
  else {
    bot.answerCallbackQuery(query.id, { text: 'Невідома дія' });
  }
});

// ================= ⏰ ТАЙМЕР =================
setInterval(() => {
  const now = new Date();
  const time = now.toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Перевірка розкладу
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

  // Очищення списку відправлених опівночі
  if (time === '00:01') {
    sentScheduleTasks = [];
  }

  // Моніторинг інтернету
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

// ================= 🌐 HTTP SERVER (для Render) =================
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT);

console.log('✅ Bot started on port', PORT);