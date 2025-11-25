require('dotenv').config();
const path = require('path');

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    STEAM_API_KEY: process.env.STEAM_API_KEY,
    DB_FILE: path.join(__dirname, '../settings.json'),
    // User Agents для Google запросов
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};