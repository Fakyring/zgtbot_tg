const axios = require('axios');
const { STEAM_API_KEY } = require('../config');

// Получение инфо по ссылке (или ID)
async function getSteamGameInfo(urlOrId) {
    try {
        // Если передали ID числом или строкой
        let appId = urlOrId;

        // Если передали ссылку, вытаскиваем ID
        if (typeof urlOrId === 'string' && urlOrId.includes('store.steampowered.com')) {
            const appMatch = urlOrId.match(/\/app\/(\d+)/);
            if (!appMatch) return null;
            appId = appMatch[1];
        }

        const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian&cc=ru`);
        if (!response.data || !response.data[appId].success) return null;

        const data = response.data[appId].data;
        if (data.type !== 'game' && data.type !== 'dlc') return null; // Отсеиваем саундтреки и прочее, если нужно

        let priceInfo = 'Нет цены';

        if (data.is_free) {
            priceInfo = 'Бесплатно';
        } else if (data.price_overview) {
            const p = data.price_overview;
            const final = (p.final / 100).toFixed(0) + '₽';
            if (p.discount_percent > 0) {
                const initial = (p.initial / 100).toFixed(0) + '₽';
                priceInfo = `<s>${initial}</s> ➡️ <b>${final}</b> (-${p.discount_percent}%)`;
            } else {
                priceInfo = `<b>${final}</b>`;
            }
        }

        return {
            appId: appId.toString(),
            title: data.name,
            url: `https://store.steampowered.com/app/${appId}/`,
            priceText: priceInfo
        };
    } catch (e) {
        return null;
    }
}

// Поиск игры по названию
async function searchSteamGame(query) {
    try {
        // Steam Store Search API
        const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=russian&cc=ru`;
        const response = await axios.get(url);

        if (response.data && response.data.items && response.data.items.length > 0) {
            // Берем самый первый результат
            const firstItem = response.data.items[0];
            // Передаем ID в функцию выше, чтобы получить полные данные (цену, форматирование)
            return await getSteamGameInfo(firstItem.id);
        }
        return null;
    } catch (e) {
        console.error("Steam Search Error:", e.message);
        return null;
    }
}

async function getUserLibrary(steamId) {
    if (!STEAM_API_KEY) return [];
    try {
        const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json`;
        const res = await axios.get(url);
        return (res.data?.response?.games || []).map(g => g.appid);
    } catch (e) {
        return [];
    }
}

module.exports = { getSteamGameInfo, getUserLibrary, searchSteamGame };