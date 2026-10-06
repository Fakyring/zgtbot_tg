const axios = require('axios');
const { Markup } = require('telegraf');
const { refreshDashboard, smartEdit } = require('../utils/helpers');
const { getMainMenu, getCancelMenu } = require('../keyboards');
const { getChatSettings } = require('../utils/db');
const { getUserLibrary } = require('../services/steam');
const { fetchGameData } = require('../services/sheets');

// --- КЭШ ---
const libraryCache = {}; // { chatId: { games: [], users: [] } }
const deleteCache = {};  // { chatId: { games: [] } } - отдельный кэш для меню удаления

// ==================================================================
// 1. ФУНКЦИЯ ПРОСМОТРА БИБЛИОТЕКИ
// ==================================================================
async function showLibrary(ctx, page = 1, isPagination = false) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.first_name || ctx.from.username || 'Unknown';
    const settings = getChatSettings(chatId);

    if (!settings?.scriptUrl) {
        console.log(`[LOG] User ${userId} (${username}) attempted to view library but bot not configured.`);
        return smartEdit(ctx, '⚠️ Бот не настроен.', { ...getMainMenu() });
    }

    // Если первый вход - грузим данные
    if (!isPagination) {
        await smartEdit(ctx, '⏳ Загрузка библиотеки...', { ...getCancelMenu() });
        try {
            const data = await fetchGameData(settings.scriptUrl);
            const games = data.games || [];
            const users = data.users || [];

            console.log(`[LOG] User ${userId} (${username}) fetched game data: ${games.length} games and ${users.length} users.`);

            if (games.length === 0) {
                console.log(`[LOG] User ${userId} (${username}) found an empty library.`);
                return smartEdit(ctx, '📭 Библиотека пуста.', { ...getMainMenu() });
            }

            // --- Проверка владельцев ---
            const userLibraries = {};
            await Promise.allSettled(users.map(async (u) => {
                if (u.steamId) userLibraries[u.name] = await getUserLibrary(u.steamId);
            }));

            const updatesForTable = [];
            for (const g of games) {
                const appMatch = g.url.match(/\/app\/(\d+)/);
                if (!appMatch) continue;
                
                const appId = parseInt(appMatch[1]);
                let currentOwners = g.owners && g.owners !== '-' ? g.owners.split(',').map(s => s.trim()) : [];
                let changed = false;

                for (const [uName, uLib] of Object.entries(userLibraries)) {
                    if (uLib && uLib.includes(appId) && !currentOwners.includes(uName)) {
                        currentOwners.push(uName); changed = true;
                    }
                }
                if (changed) {
                    g.owners = currentOwners.join(', ');
                    updatesForTable.push({ id: g.id, owners: g.owners });
                }
            }
            if (updatesForTable.length > 0) {
                console.log(`[LOG] User ${userId} (${username}) updated owners for games:`, updatesForTable);
                axios.post(settings.scriptUrl, { action: 'update_owners_batch', updates: updatesForTable })
                    .catch(e => console.error(e));
            }
            // -----------------------------------------------------------------------

            libraryCache[chatId] = { games, users };
        } catch (e) {
            console.error(`[LOG] User ${userId} (${username}) encountered an error while loading library: ${e.message}`);
            return smartEdit(ctx, '❌ Ошибка загрузки.', { ...getMainMenu() });
        }
    }

    const cache = libraryCache[chatId];
    if (!cache) {
        console.log(`[LOG] User ${userId} (${username}) found outdated data.`);
        return smartEdit(ctx, '⚠️ Данные устарели.', { ...getMainMenu() });
    }

    const games = cache.games;
    const limit = 5;
    const totalPages = Math.ceil(games.length / limit) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    const chunk = games.slice((page - 1) * limit, page * limit);

    let text = `📚 <b>Библиотека (Стр. ${page}/${totalPages})</b>\n\n`;
    for (const g of chunk) {
        const priceShow = g.price ? `💰 ${g.price} | ` : '';
        text += `🆔 <b>${g.id}</b> | <a href="${g.url}">${g.name}</a>\n${priceShow}👥 ${g.owners}\n\n`;
    }

    const buttons = [];
    if (page > 1) buttons.push(Markup.button.callback('⬅️', `lib_page_${page - 1}`));
    if (page < totalPages) buttons.push(Markup.button.callback('➡️', `lib_page_${page + 1}`));
    const navRow = buttons.length > 0 ? [buttons] : [];
    navRow.push([Markup.button.callback('🔙 В меню', 'menu_main')]);

    await smartEdit(ctx, text, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard(navRow) });
}

// ==================================================================
// 2. ФУНКЦИЯ МЕНЮ УДАЛЕНИЯ (С КЭШИРОВАНИЕМ)
// ==================================================================
async function showDeleteMenu(ctx, page = 1, isPagination = false) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const username = ctx.from.first_name || ctx.from.username || 'Unknown';
    const settings = getChatSettings(chatId);
    
    if (!settings) {
        console.log(`[LOG] User ${userId} (${username}) attempted to open delete menu but bot not configured.`);
        return smartEdit(ctx, '⚠️ Бот не настроен.', { ...getMainMenu() });
    }

    if (!isPagination || !deleteCache[chatId]) {
        if (!isPagination) await smartEdit(ctx, '⏳ Загрузка списка...', { ...getCancelMenu() });

        try {
            const data = await fetchGameData(settings.scriptUrl);
            const games = (data.games || []).sort((a, b) => b.id - a.id);

            console.log(`[LOG] User ${userId} (${username}) fetched delete menu data: ${games.length} games.`);

            if (games.length === 0) {
                console.log(`[LOG] User ${userId} (${username}) found nothing to delete.`);
                return smartEdit(ctx, '📭 Нечего удалять.', { ...getMainMenu() });
            }

            deleteCache[chatId] = { games };
        } catch (e) {
            console.error(`[LOG] User ${userId} (${username}) encountered an error while loading delete menu: ${e.message}`);
            return smartEdit(ctx, '❌ Ошибка загрузки.', { ...getMainMenu() });
        }
    }

    const games = deleteCache[chatId].games;

    if (games.length === 0) {
        console.log(`[LOG] User ${userId} (${username}) found an empty delete menu.`);
        return smartEdit(ctx, '📭 Библиотека пуста.', { ...getMainMenu() });
    }

    const limit = 10;
    const totalPages = Math.ceil(games.length / limit) || 1;

    // Корректировка страницы (если удалили всё на последней странице)
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const chunk = games.slice((page - 1) * limit, page * limit);
    const buttons = chunk.map(g => [Markup.button.callback(`❌ ${g.name}`, `del_game_${g.id}`)]);

    const navRow = [];
    if (page > 1) navRow.push(Markup.button.callback('⬅️', `del_page_${page - 1}`));
    if (page < totalPages) navRow.push(Markup.button.callback('➡️', `del_page_${page + 1}`));

    buttons.push(navRow);
    buttons.push([Markup.button.callback('🔙 В меню', 'menu_main')]);

    const text = `🗑 <b>Удаление (Стр. ${page}/${totalPages})</b>\nНажмите, чтобы удалить. Игра исчезнет из списка сразу.`;
    const extra = { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) };

    await smartEdit(ctx, text, extra);
}

module.exports = (bot) => {
    bot.action('menu_library', (ctx) => {
        console.log(`[LOG] User ${ctx.from.id} (${ctx.from.first_name || ctx.from.username || 'Unknown'}) opened the library menu.`);
        showLibrary(ctx, 1, false);
    });
    
    bot.action(/lib_page_(\d+)/, (ctx) => {
        console.log(`[LOG] User ${ctx.from.id} (${ctx.from.first_name || ctx.from.username || 'Unknown'}) navigated to page ${ctx.match[1]} of the library.`);
        showLibrary(ctx, parseInt(ctx.match[1]), true);
        ctx.answerCbQuery();
    });

    bot.action('menu_delete', (ctx) => {
        console.log(`[LOG] User ${ctx.from.id} (${ctx.from.first_name || ctx.from.username || 'Unknown'}) opened the delete menu.`);
        showDeleteMenu(ctx, 1, false);
    });

    bot.action(/del_page_(\d+)/, (ctx) => {
        console.log(`[LOG] User ${ctx.from.id} (${ctx.from.first_name || ctx.from.username || 'Unknown'}) navigated to page ${ctx.match[1]} of the delete menu.`);
        showDeleteMenu(ctx, parseInt(ctx.match[1]), true);
        ctx.answerCbQuery();
    });

    bot.action(/del_game_(\d+)/, async (ctx) => {
        const idToRemove = parseInt(ctx.match[1]);
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';
        const settings = getChatSettings(chatId);

        try {
            await axios.post(settings.scriptUrl, { action: 'remove_game', id: idToRemove });

            if (deleteCache[chatId] && deleteCache[chatId].games) {
                const idx = deleteCache[chatId].games.findIndex(g => g.id === idToRemove);
                if (idx !== -1) {
                    deleteCache[chatId].games.splice(idx, 1);
                }
            }

            delete libraryCache[chatId];

            console.log(`[LOG] User ${userId} (${username}) removed game with id ${idToRemove}.`);
            await ctx.answerCbQuery('✅ Игра удалена');
            await showDeleteMenu(ctx, 1, true);

        } catch (e) {
            console.error(`[LOG] User ${userId} (${username}) encountered an error while deleting game: ${e.message}`);
            await ctx.answerCbQuery('⚠️ Запрос отправлен, но ответ не получен.');
            await showDeleteMenu(ctx, 1, true);
        }
    });

    // ОЧИСТКА КЭША ПРИ ВЫХОДЕ В МЕНЮ
    bot.use((ctx, next) => {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'menu_main') {
            const chatId = ctx.chat.id;
            console.log(`[LOG] User ${ctx.from.id} (${ctx.from.first_name || ctx.from.username || 'Unknown'}) is clearing caches on returning to main menu.`);
            if (libraryCache[chatId]) delete libraryCache[chatId];
            if (deleteCache[chatId]) delete deleteCache[chatId];
        }
        return next();
    });
};
