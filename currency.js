const https = require('https');

function formatRate(rateObj) {
  if (!rateObj) return 'н/д';

  // якщо є нормальні курси
  if (rateObj.rateBuy && rateObj.rateSell) {
    return `купівля ${rateObj.rateBuy.toFixed(2)}, продаж ${rateObj.rateSell.toFixed(2)}`;
  }

  // fallback (іноді тільки cross)
  if (rateObj.rateCross) {
    return `≈ ${rateObj.rateCross.toFixed(2)}`;
  }

  return 'н/д';
}

function getCurrency(chatId, bot) {
  return new Promise((resolve, reject) => {

    https.get('https://api.monobank.ua/api/v1/currency', {
      timeout: 10000,
      headers: { 'User-Agent': 'TelegramBot/1.0' }
    }, (res) => {

      let rawData = '';

      if (res.statusCode !== 200) {
        bot.sendMessage(chatId, `❌ Mono API: ${res.statusCode}`);
        return reject(new Error(`Status ${res.statusCode}`));
      }

      res.on('data', chunk => rawData += chunk);

      res.on('end', () => {
        try {
          const rates = JSON.parse(rawData);

          const usd = rates.find(r => r.currencyCodeA === 840 && r.currencyCodeB === 980);
          const eur = rates.find(r => r.currencyCodeA === 978 && r.currencyCodeB === 980);

          let text = `💱 *Курс валют (Mono)*\n\n`;

          text += `🇺🇸 USD: ${formatRate(usd)}\n`;
          text += `🇪🇺 EUR: ${formatRate(eur)}`;

          bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });

          resolve(text);

        } catch (e) {
          console.error('❌ JSON parse error:', rawData);
          bot.sendMessage(chatId, '❌ Помилка обробки даних');
          reject(e);
        }
      });

    }).on('error', (e) => {
      console.error('❌ Request error:', e.message);
      bot.sendMessage(chatId, "❌ Помилка з'єднання з Mono");
      reject(e);
    });

  });
}

module.exports = { getCurrency };