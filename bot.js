const { Telegraf } = require('telegraf');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('./src/config');

if (!config.BOT_TOKEN) {
    console.error('❌ ERR: BOT_TOKEN environment variable is missing');
    process.exit(1);
}

function createProxyAgent(proxyUrl) {
    if (!proxyUrl) return undefined;

    if (proxyUrl.startsWith('socks://') || proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks5h://')) {
        return new SocksProxyAgent(proxyUrl);
    }

    return new HttpsProxyAgent(proxyUrl);
}

const proxyAgent = createProxyAgent(config.PROXY_URL);
const botOptions = proxyAgent ? { telegram: { agent: proxyAgent } } : undefined;

const bot = new Telegraf(config.BOT_TOKEN, botOptions);
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

async function launchBot() {
    while (true) {
        try {
            await bot.launch({ dropPendingUpdates: true });
            console.log('✅ Bot started successfully');
            break;
        } catch (error) {
            console.error(`❌ Failed to start bot: ${error.message}`);
            console.error(`Retrying in ${Math.round(config.START_RETRY_DELAY_MS / 1000)} seconds...`);
            await new Promise((resolve) => setTimeout(resolve, config.START_RETRY_DELAY_MS));
        }
    }
}

launchBot();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
