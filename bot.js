const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const https = require('https');

// 🔐 Змінні середовища
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ROUTER_IP = process.env.ROUTER_IP;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

// 🎂 Дні народження
let BIRTHDAYS = [];
try { BIRTHDAYS = require('./birthdays.json'); } 
catch (e) { console.log('⚠️ birthdays.json не знайдено'); }

// 📅 Розклад
let SCHEDULE = [];
try { SCHEDULE = require('./schedule.json'); } 
catch (e) { console.log('⚠️ schedule.json не знайдено'); }

// 🔥 Перевірка токенів
if (!BOT_TOKEN || !GITHUB_TOKEN || !GIST_ID) {
  console.error('❌ ПОМИЛКА: Не вистачає змінних (BOT_TOKEN, GITHUB_TOKEN, GIST_ID)');
  process.exit(1);
}
if (!ADMIN_CHAT_ID) {
  console.error('❌ ПОМИЛКА: Не знайдено ADMIN_CHAT_ID');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 📊 Стани
let routerAutoState = { isOffline: false };
let lastBirthdayNotified = '';
let sentScheduleTasks = [];

// ================= 🐱 РЕАКЦІЯ НА "КІТ" =================
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text = msg.text.trim().toLowerCase();
  if (text === 'кіт') {
    const responses = ['🐱 Тицяє лапкою і каже маааау!', '🐱 Робить кусь за жопку!'];
    const random = responses[Math.floor(Math.random() * responses.length)];
    console.log(`🐱 Відправлено: ${random}`);
    bot.sendMessage(msg.chat.id, random);
  }
});

// ================= 📋 МЕНЮ =================
const mainMenu = {
  inline_keyboard: [
    [{ text: '💱 Курс валют', callback_ 'currency' }],
    [{ text: '🎂 Хто сьогодні іменинник?', callback_ 'today_bd' }],
    [{ text: '📜 Весь список ДН', callback_ 'list_bd' }],
    [{ text: '🌐 Перевірка інтернету', callback_ 'ping_router' }],
    [{ text: '🆔 ID чату', callback_ 'chat_id' }],
    [{ text: '💸 Облік витрат', callback_ 'expenses_menu' }] // 🔥 НОВА КНОПКА
  ]
};

const expensesMenu = {
  inline_keyboard: [
    [{ text: '➕ Додати витрату', callback_ 'add_expense' }],
    [{ text: '📅 Витрати за сьогодні', callback_ 'today_expenses' }],
    [{ text: '📊 Витрати за місяць', callback_ 'month_expenses' }],
    [{ text: '🔙 Назад', callback_ 'back_to_main' }]
  ]
};

function getMonthMenu() {
  const months = [
    { text: 'Січ', val: '01' }, { text: 'Лют', val: '02' }, { text: 'Бер', val: '03' },
    { text: 'Квіт', val: '04' }, { text: 'Трав', val: '05' }, { text: 'Черв', val: '06' },
    { text: 'Лип', val: '07' }, { text: 'Серп', val: '08' }, { text: 'Вер', val: '09' },
    { text: 'Жовт', val: '10' }, { text: 'Лист', val: '11' }, { text: 'Груд', val: '12' }
  ];
  const year = new Date().getFullYear();
  const keyboard = [];
  for (let i = 0; i < months.length; i += 3) {
    keyboard.push(months.slice(i, i+3).map(m => ({
      text: m.text,
      callback_ `month_${year}_${m.val}`
    })));
  }
  keyboard.push([{ text: '🔙 Назад', callback_ 'expenses_menu' }]);
  return { inline_keyboard: keyboard };
}

// ================= 🚀 КОМАНДИ =================
bot.onText(/\/bot/, (msg) => {
  bot.sendMessage(msg.chat.id, '📋 **Головне меню**\nОберіть функцію:', { reply_markup: mainMenu, parse_mode: 'Markdown' });
});
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Привіт! Натисни /бот для меню.', { parse_mode: 'Markdown' });
});

// 💸 Швидке додавання витрати
bot.onText(/\/витрата\s+(\d+)\s+(\S+)(?:\s+(.+))?/, async (msg, match) => {
  const amount = parseFloat(match[1]);
  const category = match[2];
  const comment = match[3] || 'Без коментаря';
  
  await addExpense(msg.chat.id, amount, category, comment);
  bot.sendMessage(msg.chat.id, `✅ **Записано!**\n💰 ${amount} грн — ${category}\n📝 ${comment}`, { parse_mode: 'Markdown' });
});

// ================= 🔘 ОБРОБКА КНОПОК =================
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  await bot.answerCallbackQuery(cb.id);

  switch (cb.data) {
    case 'currency':
      bot.sendMessage(chatId, '⏳ Завантажую курс...');
      getCurrency().then(t => bot.sendMessage(chatId, t, { parse_mode: 'Markdown' }));
      break;
    case 'today_bd':
      const today = getTodayBirthdays();
      bot.sendMessage(chatId, today.length > 0 ? `🎉 **Сьогодні святкують:**\n${today.map(p => `🎂 ${p.name}`).join('\n')}` : '📅 Сьогодні немає іменинників.', { parse_mode: 'Markdown' });
      break;
    case 'list_bd':
      if (BIRTHDAYS.length === 0) return bot.sendMessage(chatId, '📜 Список порожній.');
      const sorted = [...BIRTHDAYS].sort((a, b) => a.date.localeCompare(b.date));
      bot.sendMessage(chatId, '📜 **Повний список:**\n' + sorted.map(p => `🗓 ${p.date} — ${p.name}`).join('\n'), { parse_mode: 'Markdown' });
      break;
    case 'ping_router':
      bot.sendMessage(chatId, '📡 Перевіряю мережу...');
      pingRouterOnce(chatId);
      break;
    case 'chat_id':
      bot.sendMessage(chatId, `🆔 ID: \`${chatId}\``, { parse_mode: 'Markdown' });
      break;
      
    // 💸 ВИТРАТИ
    case 'expenses_menu':
      bot.sendMessage(chatId, '💸 **Облік витрат**\nОбери дію:', { reply_markup: expensesMenu, parse_mode: 'Markdown' });
      break;
    case 'add_expense':
      bot.sendMessage(chatId, '✍️ **Формат:**\n`/витрата Сума Категорія Коментар`\n📌 Приклад:\n`/витрата 150 їжа Обід`', { parse_mode: 'Markdown' });
      break;
    case 'today_expenses':
      await showTodayExpenses(chatId);
      break;
    case 'month_expenses':
      bot.sendMessage(chatId, '📅 **Обери місяць:**', { reply_markup: getMonthMenu(), parse_mode: 'Markdown' });
      break;
    case 'back_to_main':
      bot.sendMessage(chatId, '📋 Головне меню', { reply_markup: mainMenu });
      break;
      
    default:
      if (cb.data.startsWith('month_')) {
        const [_, year, month] = cb.data.split('_');
        await showMonthExpenses(chatId, year, month);
      }
      break;
  }
});

// ================= 💸 GIST ФУНКЦІЇ =================

async function fetchFromGist() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    if (!res.ok) throw new Error('Gist API error');
    const data = await res.json();
    return JSON.parse(data.files['expenses.json'].content);
  } catch (e) {
    console.error('❌ Gist read error:', e.message);
    return {};
  }
}

async function saveToGist(newData) {
  try {
    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: { 'expenses.json': { content: JSON.stringify(newData, null, 2) } }
      })
    });
  } catch (e) {
    console.error('❌ Gist write error:', e.message);
  }
}

async function loadExpenses(chatId) {
  const allData = await fetchFromGist();
  return allData.expenses?.[chatId] || [];
}

async function saveExpenses(chatId, expenses) {
  const allData = await fetchFromGist();
  if (!allData.expenses) allData.expenses = {};
  allData.expenses[chatId] = expenses;
  await saveToGist(allData);
}

async function addExpense(chatId, amount, category, comment) {
  const expenses = await loadExpenses(chatId);
  const now = new Date();
  
  expenses.push({
    id: Date.now(),
    amount: parseFloat(amount),
    category,
    comment: comment || 'Без коментаря',
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5)
  });
  
  await saveExpenses(chatId, expenses);
}

async function showTodayExpenses(chatId) {
  const expenses = await loadExpenses(chatId);
  const today = new Date().toISOString().split('T')[0];
  const todayExp = expenses.filter(e => e.date === today);
  
  if (todayExp.length === 0) {
    return bot.sendMessage(chatId, '📊 **Сьогодні витрат немає!**\n🎉 Економиш! 💪', { parse_mode: 'Markdown' });
  }
  
  const byCat = {};
  let total = 0;
  todayExp.forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    total += e.amount;
  });
  
  let text = `📊 **Витрати за сьогодні** (${today})\n\n`;
  Object.entries(byCat).forEach(([cat, sum]) => text += `🔹 ${cat}: ${sum} грн\n`);
  text += `\n💰 **Разом: ${total.toFixed(2)} грн**\n📝 Витрат: ${todayExp.length}`;
  
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

async function showMonthExpenses(chatId, year, month) {
  const expenses = await loadExpenses(chatId);
  const prefix = `${year}-${month}`;
  const monthExp = expenses.filter(e => e.date.startsWith(prefix));
  
  if (monthExp.length === 0) {
    const names = { '01':'Січ','02':'Лют','03':'Бер','04':'Квіт','05':'Трав','06':'Черв','07':'Лип','08':'Серп','09':'Вер','10':'Жовт','11':'Лист','12':'Груд' };
    return bot.sendMessage(chatId, `📊 **У ${names[month]} ${year} витрат немає!**\n🎉 Економія! 💪`, { parse_mode: 'Markdown' });
  }
  
  const byCat = {};
  let total = 0;
  monthExp.forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    total += e.amount;
  });
  
  const sorted = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const names = { '01':'Січ','02':'Лют','03':'Бер','04':'Квіт','05':'Трав','06':'Черв','07':'Лип','08':'Серп','09':'Вер','10':'Жовт','11':'Лист','12':'Груд' };
  
  let text = `📊 **Витрати за ${names[month]} ${year}**\n\n`;
  sorted.forEach(([cat, sum], i) => {
    const p = Math.round(sum/total*100);
    text += `${i===0?'🔥':'🔹'} ${cat}: ${sum} грн (${p}%)\n`;
  });
  text += `\n💰 **Всього: ${total.toFixed(2)} грн**\n📅 Днів: ${new Set(monthExp.map(e=>e.date)).size}\n📝 Витрат: ${monthExp.length}`;
  
  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ================= ⚙️ ІНШІ ФУНКЦІЇ =================
function getTodayBirthdays() {
  const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day:'2-digit', month:'2-digit' });
  const [d, m] = now.split('.');
  return BIRTHDAYS.filter(p => p.date === `${d}.${m}`);
}

function getCurrency() {
  return new Promise((resolve) => {
    https.get('https://api.monobank.ua/bank/currency', { headers: {'User-Agent':'TG-Bot'}, timeout:5000 }, (res) => {
      let data='';
      res.on('data', c=>data+=c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const usd = json.find(r=>r.currencyCodeA===840&&r.currencyCodeB===980);
          const eur = json.find(r=>r.currencyCodeA===978&&r.currencyCodeB===980);
          let t='💱 **Monobank**\n\n';
          if(usd) t+=`🇺🇸 USD: 🟢 ${usd.rateBuy} / 🔴 ${usd.rateSell}\n`;
          if(eur) t+=`🇪🇺 EUR: 🟢 ${eur.rateBuy} / 🔴 ${eur.rateSell}\n`;
          resolve(t+'\n🟢 купівля | 🔴 продаж');
        } catch { resolve('❌ Помилка курсу'); }
      });
    }).on('error', ()=>resolve('❌ Помилка з\'єднання'));
  });
}

function pingRouterOnce(chatId) {
  https.get('https://api.monobank.ua', {timeout:5000}, (res)=>{
    bot.sendMessage(chatId, '🟢 **Мережа працює!**\n✅ Стабільно.', {parse_mode:'Markdown'});
  }).on('error', ()=>{
    bot.sendMessage(chatId, '🔴 **Проблеми з мережею!**\n❌ Немає з\'єднання.', {parse_mode:'Markdown'});
  });
}

// ================= ⏰ ТАЙМЕР =================
setInterval(() => {
  const now = new Date().toLocaleString('uk-UA', {timeZone:'Europe/Kyiv'});
  const [dateStr, timeStr] = now.split(', ');
  const time = timeStr.substring(0,5);
  
  SCHEDULE.forEach(task => {
    if(!task.active || task.time!==time) return;
    const key = `${task.time}-${task.message}`;
    if(!sentScheduleTasks.includes(key)) {
      let msg = task.message;
      if(task.userId) msg = `<a href="tg://user?id=${task.userId}">User</a>, ${msg}`;
      bot.sendMessage(ADMIN_CHAT_ID, msg, {parse_mode:'HTML'});
      sentScheduleTasks.push(key);
    }
  });
  
  if(time==='00:01') sentScheduleTasks=[];
  
  if(time==='10:00' && lastBirthdayNotified!==dateStr) {
    const today = getTodayBirthdays();
    if(today.length>0) {
      bot.sendMessage(ADMIN_CHAT_ID, `☀️ **Доброго ранку!**\n🎉 Сьогодні: ${today.map(p=>`🎂 ${p.name}`).join(', ')}`, {parse_mode:'Markdown'});
    }
    lastBirthdayNotified=dateStr;
  }
  
  https.get('https://api.monobank.ua',{timeout:5000},(res)=>{
    if(routerAutoState.isOffline){
      routerAutoState.isOffline=false;
      bot.sendMessage(ADMIN_CHAT_ID, `🟢 **Інтернет відновлено!**\n⏰ ${time}`, {parse_mode:'Markdown'});
    }
  }).on('error',()=>{
    if(!routerAutoState.isOffline){
      routerAutoState.isOffline=true;
      bot.sendMessage(ADMIN_CHAT_ID, `🔴 **Інтернет зник!**\n⏰ ${time}`, {parse_mode:'Markdown'});
    }
  });
}, 60000);

// ================= 🌐 HTTP SERVER =================
const PORT = process.env.PORT || 3000;
http.createServer((_,res)=>{
  res.writeHead(200,{'Content-Type':'text/plain'});
  res.end('✅ Bot is alive');
}).listen(PORT, ()=>console.log(`🌐 Server on port ${PORT}`));

console.log('✅ Бот запущено! 💸');