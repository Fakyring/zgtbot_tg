const { refreshDashboard, cleanMsg, smartEdit } = require('../utils/helpers');
const { getMainMenu, getCancelMenu } = require('../keyboards');
const { updateChatSettings } = require('../utils/db');

module.exports = (bot, userStates) => {
    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        await cleanMsg(ctx);
        userStates[chatId] = null;

        console.log(`[LOG] User ${userId} (${username}) started the bot.`);

        await refreshDashboard(ctx, '👋 <b>Steam Library Bot</b>', { parse_mode: 'HTML', ...getMainMenu() });
    });

    bot.action('menu_main', (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        // Если объект чата существует, удаляем состояние пользователя
        if (userStates[chatId]) {
            delete userStates[chatId][userId];
            console.log(`[LOG] User ${userId} (${username}) returned to the main menu.`);
        }

        refreshDashboard(ctx, '🏠 <b>Главное меню</b>', { parse_mode: 'HTML', ...getMainMenu() });
    });

    bot.action('denis_answer', async (ctx) => {
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        await ctx.reply('Без комментариев');
        await ctx.answerCbQuery();
        console.log(`[LOG] User ${userId} (${username}) received a default answer to the 'denis_answer' action.`);
    });

    bot.action('action_close', async (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        try {
            await ctx.deleteMessage();
            updateChatSettings(chatId, 'lastMessageId', null);
            console.log(`[LOG] User ${userId} (${username}) closed the message successfully.`);
        } catch (e) {
            await ctx.answerCbQuery('Не удалось закрыть');
            console.log(`[LOG] User ${userId} (${username}) failed to close the message: ${e.message}`);
        }
    });

    bot.action('action_cancel', (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        if (userStates[chatId]) {
            delete userStates[chatId][userId];
            console.log(`[LOG] User ${userId} (${username}) canceled the action.`);
        }

        refreshDashboard(ctx, '🚫 Действие отменено.', { parse_mode: 'HTML', ...getMainMenu() });
    });

    // Middleware для авто-сброса состояний (таймер 5 минут)
    bot.use((ctx, next) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from?.id;
        if (!userId || !userStates[chatId] || !userStates[chatId][userId]) return next();

        const now = Date.now();
        if (!userStates[chatId]._lastActivity) userStates[chatId]._lastActivity = {};
        const last = userStates[chatId]._lastActivity[userId] || 0;

        if (now - last > 300000) { // 5 минут
            delete userStates[chatId][userId];
            delete userStates[chatId]._lastActivity[userId];
            console.log(`[STATE] Auto-reset state for user ${userId} (timeout 5min)`);
        } else {
            userStates[chatId]._lastActivity[userId] = now;
        }
        return next();
    });
};