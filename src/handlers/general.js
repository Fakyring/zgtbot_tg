const { refreshDashboard, cleanMsg, smartEdit } = require('../utils/helpers');
const { getMainMenu, getCancelMenu } = require('../keyboards');
const { updateChatSettings } = require('../utils/db');

module.exports = (bot, userStates) => {
    bot.start(async (ctx) => {
        await cleanMsg(ctx);
        userStates[ctx.chat.id] = null;
        await refreshDashboard(ctx, '👋 <b>Steam Library Bot</b>', { parse_mode: 'HTML', ...getMainMenu() });
    });

    bot.action('menu_main', (ctx) => {
        // Если объект чата существует, удаляем состояние пользователя
        if (userStates[ctx.chat.id]) delete userStates[ctx.chat.id][ctx.from.id];

        refreshDashboard(ctx, '🏠 <b>Главное меню</b>', { parse_mode: 'HTML', ...getMainMenu() });
    });

    bot.action('denis_answer', async (ctx) => {
        await ctx.reply('Без комментариев');
        await ctx.answerCbQuery();
    });

    bot.action('action_close', async (ctx) => {
        try {
            await ctx.deleteMessage();
            updateChatSettings(ctx.chat.id, 'lastMessageId', null);
        } catch (e) {
            await ctx.answerCbQuery('Не удалось закрыть');
        }
    });

    bot.action('action_cancel', (ctx) => {
        if (userStates[ctx.chat.id]) delete userStates[ctx.chat.id][ctx.from.id];
        refreshDashboard(ctx, '🚫 Действие отменено.', { parse_mode: 'HTML', ...getMainMenu() });
    });
};
