const axios = require('axios');
const { refreshDashboard, cleanMsg, smartEdit, setInputTimer, clearInputTimer } = require('../utils/helpers');
const { getMainMenu, getCancelMenu } = require('../keyboards');
const { getChatSettings } = require('../utils/db');
const { getSteamGameInfo, getUserLibrary, searchSteamGame } = require('../services/steam');
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

        // Устанавливаем состояние и время активности КОНКРЕТНОМУ пользователю
        userStates[chatId][userId] = 'WAITING_FOR_GAME_LINK';
        if (!userStates[chatId]._lastActivity) userStates[chatId]._lastActivity = {};
        userStates[chatId]._lastActivity[userId] = Date.now();
        setInputTimer(ctx, userStates);

        smartEdit(ctx, '🎮 <b>Добавление игры</b>\nОтправьте ссылку на игру в Steam <b>ИЛИ</b> просто её название.\n\n⏱ У вас есть 60 секунд на ввод.', { parse_mode: 'HTML', ...getCancelMenu() });
    });

    // Обработка текста (только когда пользователь в состоянии)
    bot.on('text', async (ctx, next) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        const state = userStates[chatId]?.[userId];
        if (!state) return next();
        clearInputTimer(userStates, chatId, userId);

        const text = ctx.message.text.trim();
        console.log(`[LOG] User ${userId} (${username}) in state ${state}: "${text}"`);

        // Обновляем таймер активности при каждом сообщении в состоянии
        if (!userStates[chatId]._lastActivity) userStates[chatId]._lastActivity = {};
        userStates[chatId]._lastActivity[userId] = Date.now();

        const settings = getChatSettings(chatId);

        if (state === 'WAITING_FOR_GAME_LINK') {
            await cleanMsg(ctx);
            let loadingMsg = null;
            if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
                try {
                    loadingMsg = await ctx.reply('⏳ Ищу игру...');
                } catch (e) {}
            }

            let game = null;
            if (text.includes('store.steampowered.com/app/')) {
                game = await getSteamGameInfo(text);
            } else {
                game = await searchSteamGame(text);
            }

            if (loadingMsg) {
                try { 
                    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id); 
                } catch(e) {
                    console.log(`[LOG] Failed to delete loading message for user ${userId}: ${e.message}`);
                }
            }

            if (!game) {
                console.log(`[LOG] Unable to find game for user ${userId} (${username}).`);
                return refreshDashboard(ctx, '❌ <b>Игра не найдена!</b>\nПроверьте ссылку или название.', { parse_mode: 'HTML', ...getCancelMenu() });
            }

            console.log(`[LOG] Game found for user ${userId} (${username}): ${game.title}. Checking owners...`);

            await refreshDashboard(ctx, `🔎 Найдено: <b>${game.title}</b>\nПроверяю владельцев...`, { parse_mode: 'HTML' });

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
                    owners: ownersStr,
                    price: game.priceText
                });

                delete userStates[chatId][userId];

                const msg = res.data.status === 'success'
                    ? `✅ <b>Добавлено!</b>\n🎮 <a href="${game.url}">${game.title}</a>\n💰 ${game.priceText}\n👤 ${ownersStr}`
                    : `✋ Игра уже есть.\n🎮 <a href="${game.url}">${game.title}</a>`;

                console.log(`[LOG] User ${userId} (${username}) successfully added game: ${game.title}`);
                return refreshDashboard(ctx, msg, { parse_mode: 'HTML', disable_web_page_preview: true, ...getMainMenu() });
            } catch (e) {
                console.log(`[LOG] Error writing to the table for user ${userId} (${username}): ${e.message}`);
                return refreshDashboard(ctx, '❌ Ошибка записи в таблицу.', { ...getMainMenu() });
            }
        }

        return next();
    });
};
