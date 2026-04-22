const axios = require('axios');

const currencyHandler = async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const res = await axios.get('https://api.monobank.ua/bank/currency');

    const usd = res.data.find(
      (c) => c.currencyCodeA === 840 && c.currencyCodeB === 980
    );

    const eur = res.data.find(
      (c) => c.currencyCodeA === 978 && c.currencyCodeB === 980
    );

    await ctx.reply(
      `🚀 <b>Космічний курс валют</b> 🛰️\n\n` +
      `🇺🇸 <b>USD:</b> ${usd.rateBuy} / ${usd.rateSell}\n` +
      `🇪🇺 <b>EUR:</b> ${eur.rateBuy} / ${eur.rateSell}\n\n` +
      `<i>🕐 Оновлено: ${new Date().toLocaleTimeString('uk-UA')}</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await ctx.reply('❌ Помилка отримання курсу валют');
  }
};

module.exports = { currencyHandler };