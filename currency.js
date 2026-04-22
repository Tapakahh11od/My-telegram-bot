// currency.js
const https = require('https');

function getCurrency(chatId, bot) {
  return new Promise((resolve, reject) => {
    https.get('https://api.monobank.ua/api/v1/currency', { 
      timeout: 10000,
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    }, (res) => {
      let rawData = '';
      if (res.statusCode !== 200) {
        bot.sendMessage(chatId, '❌ Сервіс недоступний');
        reject(new Error(`Status ${res.statusCode}`));
        return;
      }
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          if (!rawData.trim().startsWith('{') && !rawData.trim().startsWith('[')) {
            throw new Error('Invalid JSON');
          }
          const rates = JSON.parse(rawData);
          const usd = rates.find(r => r.currencyCodeA === 840 && r.currencyCodeB === 980);
          const eur = rates.find(r => r.currencyCodeA === 978 && r.currencyCodeB === 980);
          let text = `💱 *Курс валют (Mono)*\n`;
          if (usd) text += `🇺🇸 USD: купівля ${usd.rateBuy?.toFixed(2)}, продаж ${usd.rateSell?.toFixed(2)}\n`;
          if (eur) text += `🇪🇺 EUR: купівля ${eur.rateBuy?.toFixed(2)}, продаж ${eur.rateSell?.toFixed(2)}`;
          bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          resolve(text);
        } catch (e) {
          bot.sendMessage(chatId, '❌ Не вдалося обробити дані');
          reject(e);
        }
      });
    }).on('error', () => {
      bot.sendMessage(chatId, "❌ Помилка з'єднання з Mono");
      reject();
    });
  });
}

module.exports = { getCurrency };