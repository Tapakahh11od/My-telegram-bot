// currency.js
const https = require('https');

/**
 * Отримує курс валют з MonoBank API
 * @param {string} chatId - ID чату для відправки повідомлення
 * @param {Object} bot - Екземпляр TelegramBot
 * @param {Function} answerCallback - Функція для відповіді на callback
 */
function getCurrency(chatId, bot, answerCallback) {
  return new Promise((resolve, reject) => {
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
          resolve(text);
        } catch (e) {
          bot.sendMessage(chatId, '❌ Не вдалося обробити дані');
          reject(e);
        }
      });
    }).on('error', (err) => {
      bot.sendMessage(chatId, "❌ Помилка з'єднання з Mono");
      reject(err);
    });
  });
}

module.exports = { getCurrency };