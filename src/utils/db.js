const fs = require('fs');
const { DB_FILE } = require('../config');

function loadSettings() {
    if (!fs.existsSync(DB_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        return {};
    }
}

function saveSettings(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getChatSettings(chatId) {
    return loadSettings()[chatId];
}

function updateChatSettings(chatId, key, value) {
    const db = loadSettings();
    if (!db[chatId]) db[chatId] = {};
    db[chatId][key] = value;
    saveSettings(db);
}

module.exports = { loadSettings, saveSettings, getChatSettings, updateChatSettings };
