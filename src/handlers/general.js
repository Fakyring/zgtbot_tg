const { refreshDashboard, cleanMsg, smartEdit } = require('../utils/helpers');
const { getMainMenu, getCancelMenu } = require('../keyboards');
const { updateChatSettings } = require('../utils/db');

module.exports = (bot, userStates) => {
    bot.start(async (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        // Удаляем команду /start и /start@zgtgames_bot из общего чата.
        await cleanMsg(ctx);
        userStates[chatId] = null;

        console.log(`[LOG] User ${userId} (${username}) started the bot.`);

        await refreshDashboard(ctx, '👋 <b>Steam Library Bot</b>', { parse_mode: 'HTML', ...getMainMenu() });
    });

    bot.action('menu_main', (ctx) => {
        const chatId = ctx.chat.id;
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';

        if (userStates[chatId]) {
            if (userStates[chatId][userId]) {
                delete userStates[chatId][userId];
            }
            console.log(`[LOG] User ${userId} (${username}) returned to the main menu.`);
        }

        smartEdit(ctx, '🏠 <b>Главное меню</b>', { parse_mode: 'HTML', ...getMainMenu() });
    });

    bot.action('denis_answer', async (ctx) => {
        const userId = ctx.from.id;
        const username = ctx.from.first_name || ctx.from.username || 'Unknown';
        const roll = Math.random();
        const suffixes = ['0', 'o', 'X', 'x', '___-'];
        let answer = 'Без комментариев';

        if (roll >= 0.9) {
            answer = `-__${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
        } else if (roll >= 0.7) {
            answer = '-_-';
        }

        await ctx.reply(answer);
        await ctx.answerCbQuery();
        console.log(`[LOG] User ${userId} (${username}) received '${answer}' from the 'denis_answer' action.`);
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

        smartEdit(ctx, '🚫 Действие отменено.', { parse_mode: 'HTML', ...getMainMenu() });
    });
};
