require('dotenv').config({ quiet: true });
const path = require('path');

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    STEAM_API_KEY: process.env.STEAM_API_KEY,
    PROXY_URL: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
    START_RETRY_DELAY_MS: Number(process.env.START_RETRY_DELAY_MS || 30000),
    DB_FILE: process.env.DB_FILE || path.join(__dirname, '../settings.json'),
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    BLOCKED_USERS: [11111111] // Добавьте сюда userId пользователей для блокировки
};
