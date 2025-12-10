const { Telegraf } = require('telegraf');
const config = require('./src/config');

if (!config.BOT_TOKEN) {
    console.error('❌ ERR: .env file missing BOT_TOKEN');
    process.exit(1);
}

const bot = new Telegraf(config.BOT_TOKEN);
const userStates = {}; // Хранение состояний (в памяти)

// Middleware для блокировки пользователей
bot.use((ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && config.BLOCKED_USERS.includes(userId)) {
        console.log(`[BLOCKED] User ${userId} attempted to interact but is blocked.`);
        return; // Не продолжаем обработку
    }
    return next();
});

// Подключаем обработчики
require('./src/handlers/general')(bot, userStates);
require('./src/handlers/settings')(bot, userStates);
require('./src/handlers/games')(bot, userStates);
require('./src/handlers/library')(bot);

bot.launch({ dropPendingUpdates: true })
console.log('✅ Bot started successfully');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));