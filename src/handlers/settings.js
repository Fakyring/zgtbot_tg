const axios = require('axios');
const { refreshDashboard, cleanMsg } = require('../utils/helpers');
const { getSettingsMenu, getCancelMenu, getMainMenu } = require('../keyboards');
const { getChatSettings, updateChatSettings } = require('../utils/db');
const { fetchGameData } = require('../services/sheets');
const { sleep } = require('../utils/helpers');

module.exports = (bot, userStates) => {
    bot.action('menu_settings', (ctx) => {
        userStates[ctx.chat.id] = null;
        refreshDashboard(ctx, '⚙️ <b>Настройки</b>', { parse_mode: 'HTML', ...getSettingsMenu() });
    });

    bot.action('set_link_table', (ctx) => {
        userStates[ctx.chat.id] = 'WAITING_FOR_SCRIPT_URL';
        refreshDashboard(ctx, '🔗 <b>Привязка</b>\nОтправьте ссылку на Google Apps Script (Web App URL).', { parse_mode: 'HTML', ...getCancelMenu() });
    });

    bot.action('set_add_user', (ctx) => {
        userStates[ctx.chat.id] = 'WAITING_FOR_USER_DATA';
        refreshDashboard(ctx, '👤 <b>Добавить друга</b>\nОтправьте: SteamID64 Имя', { parse_mode: 'HTML', ...getCancelMenu() });
    });

    // --- ИСПРАВЛЕННОЕ ОБНОВЛЕНИЕ ЦЕН ---
    bot.action('action_update_prices', async (ctx) => {
        const settings = getChatSettings(ctx.chat.id);
        if (!settings?.scriptUrl) return ctx.answerCbQuery('❌ Таблица не привязана');

        await ctx.answerCbQuery('Запускаю обновление...');
        await refreshDashboard(ctx, '🔄 <b>Обновление цен...</b>\nСчитываю список игр...', { parse_mode: 'HTML' });

        try {
            // 1. Сбрасываем кэш, чтобы получить актуальный список игр
            const data = await fetchGameData(settings.scriptUrl);
            const games = data.games || [];
            const updates = [];

            if (games.length === 0) {
                return refreshDashboard(ctx, '📭 В таблице нет игр.', { ...getMainMenu() });
            }

            let count = 0;
            // 2. Проходим по играм
            for (const game of games) {
                count++;
                // Каждые 5 игр обновляем статус, чтобы пользователь видел прогресс
                if (count % 5 === 0) {
                    try {
                        await ctx.telegram.editMessageText(
                            ctx.chat.id,
                            settings.lastMessageId,
                            null,
                            `🔄 Обработано: ${count}/${games.length}`
                        );
                    } catch (e) {}
                }

                const appMatch = game.url.match(/\/app\/(\d+)/);
                if (appMatch) {
                    const appId = appMatch[1];
                    try {
                        const sRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=russian&cc=ru`);
                        // Ждем 700мс, чтобы Steam не забанил IP
                        await sleep(700);

                        if (sRes.data && sRes.data[appId] && sRes.data[appId].success) {
                            const d = sRes.data[appId].data;
                            let pStr = 'Нет цены';

                            if (d.is_free) {
                                pStr = 'Бесплатно';
                            } else if (d.price_overview) {
                                const p = d.price_overview;
                                const final = (p.final / 100).toFixed(0) + '₽';
                                pStr = p.discount_percent > 0
                                    ? `<s>${(p.initial/100).toFixed(0)}₽</s> ➡️ <b>${final}</b>`
                                    : `<b>${final}</b>`;
                            }

                            // Добавляем в массив на обновление
                            updates.push({ id: game.id, price: pStr });
                        }
                    } catch (e) {
                        console.error(`Ошибка обновления цены для ${game.name}:`, e.message);
                    }
                }
            }

            await refreshDashboard(ctx, '💾 <b>Сохраняю новые цены в таблицу...</b>', { parse_mode: 'HTML' });

            // 3. Отправляем данные
            await axios.post(settings.scriptUrl, { action: 'update_price_batch', updates });

            await refreshDashboard(ctx, `✅ <b>Готово!</b>\nОбновлено игр: ${updates.length}`, { parse_mode: 'HTML', ...getMainMenu() });

        } catch (e) {
            console.error(e);
            await refreshDashboard(ctx, '❌ Ошибка при обновлении.\nВозможно, таблица недоступна.', { ...getMainMenu() });
        }
    });

    // Текстовые обработчики
    bot.on('text', async (ctx, next) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;

        const state = userStates[chatId]?.[userId];

        const text = ctx.message.text.trim();

        if (state === 'WAITING_FOR_SCRIPT_URL') {
            await cleanMsg(ctx);
            if (!text.startsWith('http')) {
                return refreshDashboard(ctx, '❌ <b>Ошибка!</b>\nНекорректная ссылка.', { parse_mode: 'HTML', ...getCancelMenu() });
            }
            updateChatSettings(chatId, 'scriptUrl', text);
            if(userStates[chatId]) delete userStates[chatId][userId];

            return refreshDashboard(ctx, '✅ Таблица привязана!', { parse_mode: 'HTML', ...getMainMenu() });
        }

        if (state === 'WAITING_FOR_USER_DATA') {
            await cleanMsg(ctx);
            const parts = text.split(/\s+/);
            if (parts.length < 2 || parts[0].length !== 17) {
                return refreshDashboard(ctx, '❌ <b>Ошибка формата!</b>\nSteamID (17 цифр) и Имя.', { parse_mode: 'HTML', ...getCancelMenu() });
            }

            const settings = getChatSettings(chatId);
            try {
                await axios.post(settings.scriptUrl, { action: 'add_user', steamId: parts[0], name: parts.slice(1).join(' ') });

                if(userStates[chatId]) delete userStates[chatId][userId];

                return refreshDashboard(ctx, '✅ Друг добавлен!', { parse_mode: 'HTML', ...getMainMenu() });
            } catch (e) {
                return refreshDashboard(ctx, '❌ Ошибка API.', { ...getMainMenu() });
            }
        }

        return next();
    });
};