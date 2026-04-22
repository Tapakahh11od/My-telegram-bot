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

  console.log(`⏰ Перевірка часу: ${time}`);

  // ================= РОЗКЛАД =================
  SCHEDULE.forEach(task => {
    if (!task.active) return;

    if (task.time === time) {
      const key = `${task.time}-${task.message}`;

      if (!sentScheduleTasks.includes(key)) {
        console.log(`📢 Відправка нагадування: ${task.message}`);

        let msg = task.message;

        if (task.userId) {
          msg = `<a href="tg://user?id=${task.userId}">User</a>, ${msg}`;
        }

        bot.sendMessage(ADMIN_CHAT_ID, msg, { parse_mode: 'HTML' });

        sentScheduleTasks.push(key);
      }
    }
  });

  // Скидання раз в день
  if (time === '00:01') {
    sentScheduleTasks = [];
    console.log('♻️ Скинуто список відправлених нагадувань');
  }

  // ================= ДН =================
  if (time === '10:00' && lastBirthdayNotified !== dateStr) {
    const today = getTodayBirthdays();

    if (today.length > 0) {
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `☀️ **Доброго ранку!**\n🎉 Сьогодні: ${today.map(p => `🎂 ${p.name}`).join(', ')}`,
        { parse_mode: 'Markdown' }
      );
    }

    lastBirthdayNotified = dateStr;
  }

  // ================= ІНТЕРНЕТ =================
  https.get('https://api.monobank.ua', { timeout: 5000 }, () => {
    if (routerAutoState.isOffline) {
      routerAutoState.isOffline = false;
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `🟢 **Інтернет відновлено!**\n⏰ ${time}`,
        { parse_mode: 'Markdown' }
      );
    }
  }).on('error', () => {
    if (!routerAutoState.isOffline) {
      routerAutoState.isOffline = true;
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `🔴 **Інтернет зник!**\n⏰ ${time}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

}, 60000);