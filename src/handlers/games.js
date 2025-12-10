const axios = require('axios');
const { refreshDashboard, cleanMsg } = require('../utils/helpers');
const { getMainMenu, getCancelMenu } = require('../keyboards');
const { getChatSettings } = require('../utils/db');
const { getSteamGameInfo, getUserLibrary, searchSteamGame } = require('../services/steam');
const { checkFreeTp } = require('../services/freetp');
const { fetchGameData } = require('../services/sheets');

module.exports = (bot, userStates) => {

    // Нажатие на кнопку "Добавить игру"
    bot.action('menu_add_game', (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        console.log(`[LOG] User ${userId} (${username}) triggered the 'Add Game' button.`);

        // Инициализируем объект чата, если его нет
        if (!userStates[chatId]) userStates[chatId] = {};

        // Устанавливаем состояние КОНКРЕТНОМУ пользователю
        userStates[chatId][userId] = 'WAITING_FOR_GAME_LINK';

        refreshDashboard(ctx, '🎮 <b>Добавление игры</b>\nОтправьте ссылку на игру в Steam <b>ИЛИ</b> просто её название.', { parse_mode: 'HTML', ...getCancelMenu() });
    });

    // Обработка текста
    bot.on('text', async (ctx, next) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        // Проверяем состояние именно этого пользователя
        if (userStates[chatId]?.[userId] !== 'WAITING_FOR_GAME_LINK') return next();

        const text = ctx.message.text.trim();
        console.log(`[LOG] User ${userId} (${username}) sent a message for processing: "${text}".`);

        const settings = getChatSettings(chatId);
        if (!settings?.scriptUrl) {
            delete userStates[chatId][userId]; // Сбрасываем состояние
            console.log(`[LOG] User ${userId} (${username}) found no scriptUrl, resetting state.`);
            return refreshDashboard(ctx, '⚠️ Бот не настроен (нет ссылки на таблицу).', { ...getMainMenu() });
        }

        // Сообщение "Ищу..." отправляем, но сообщение пользователя пока НЕ трогаем
        const loadingMsg = await ctx.reply('⏳ Ищу игру...');

        let game = null;

        // Проверка: Ссылка это или название?
        if (text.includes('store.steampowered.com/app/')) {
            game = await getSteamGameInfo(text);
        } else {
            game = await searchSteamGame(text);
        }

        // Удаляем сообщение "Ищу..."
        try { 
            await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id); 
        } catch(e) {
            console.log(`[LOG] Failed to delete loading message for user ${userId}: ${e.message}`);
        }

        // ЕСЛИ ИГРА НЕ НАЙДЕНА
        if (!game) {
            console.log(`[LOG] Unable to find game for user ${userId} (${username}).`);
            return refreshDashboard(ctx, '❌ <b>Игра не найдена!</b>\nПроверьте ссылку или название.\nВаше сообщение оставлено, чтобы вы могли его отредактировать.', { parse_mode: 'HTML', ...getCancelMenu() });
        }

        // ЕСЛИ ИГРА НАЙДЕНА -> Удаляем сообщение пользователя
        await cleanMsg(ctx);
        console.log(`[LOG] Game found for user ${userId} (${username}): ${game.title}. Checking FreeTP and owners...`);

        await refreshDashboard(ctx, `🔎 Найдено: <b>${game.title}</b>\nПроверяю FreeTP и владельцев...`, { parse_mode: 'HTML' });

        const freetpStatus = await checkFreeTp(game.title);

        let ownersStr = '-';
        try {
            const data = await fetchGameData(settings.scriptUrl);
            const users = data.users || [];
            let foundOwners = [];
            await Promise.all(users.map(async (user) => {
                const lib = await getUserLibrary(user.steamId);
                if (lib.includes(parseInt(game.appId))) foundOwners.push(user.name);
            }));
            if (foundOwners.length > 0) {
                ownersStr = foundOwners.join(', ');
            }
        } catch (e) {
            console.log(`[LOG] Error fetching game owners for user ${userId}: ${e.message}`);
        }

        try {
            const res = await axios.post(settings.scriptUrl, {
                action: 'add',
                title: game.title,
                url: game.url,
                date: new Date().toLocaleDateString('ru-RU'),
                freetp: freetpStatus,
                owners: ownersStr,
                price: game.priceText
            });

            // Сбрасываем состояние пользователя
            delete userStates[chatId][userId];

            const msg = res.data.status === 'success'
                ? `✅ <b>Добавлено!</b>\n🎮 <a href="${game.url}">${game.title}</a>\n💰 ${game.priceText}\n👤 ${ownersStr}\n🏴‍☠️ FreeTP: ${freetpStatus}`
                : `✋ Игра уже есть.\n🎮 <a href="${game.url}">${game.title}</a>`;

            console.log(`[LOG] User ${userId} (${username}) successfully added game: ${game.title}`);
            return refreshDashboard(ctx, msg, { parse_mode: 'HTML', disable_web_page_preview: true, ...getMainMenu() });
        } catch (e) {
            console.log(`[LOG] Error writing to the table for user ${userId} (${username}): ${e.message}`);
            return refreshDashboard(ctx, '❌ Ошибка записи в таблицу.', { ...getMainMenu() });
        }
    });
};