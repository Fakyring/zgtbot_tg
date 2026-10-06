const { loadSettings, saveSettings } = require('./db');

async function cleanMsg(ctx) {
    try { await ctx.deleteMessage(); } catch (e) {}
}

async function deleteOldDashboard(ctx) {
    const db = loadSettings();
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    // Идентификаторы для удаления: из базы (по пользователю или общий) и текущее сообщение callback
    const idsToDelete = new Set();

    const userLastId = userId && db[chatId]?.userDashboards?.[userId];
    if (userLastId) idsToDelete.add(userLastId);

    const chatLastId = db[chatId]?.lastMessageId;
    if (chatLastId) idsToDelete.add(chatLastId);

    if (ctx.callbackQuery?.message?.message_id) {
        idsToDelete.add(ctx.callbackQuery.message.message_id);
    }

    for (const msgId of idsToDelete) {
        try {
            await ctx.telegram.deleteMessage(chatId, msgId);
        } catch (e) {
            try {
                if (userId) {
                    await ctx.telegram.callApi('deleteEphemeralMessage', {
                        chat_id: chatId,
                        receiver_user_id: userId,
                        ephemeral_message_id: msgId
                    });
                }
            } catch (err) {}
        }
    }
}

function isGroupChat(ctx) {
    return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

function getEphemeralParams(ctx) {
    const userId = ctx.from?.id;
    const callbackQueryId = ctx.callbackQuery?.id;
    if (!userId) return null;

    return {
        receiver_user_id: userId,
        ...(callbackQueryId ? { callback_query_id: callbackQueryId, replace_callback_query_message: true } : {})
    };
}

function saveDashboardMessage(ctx, msg) {
    const messageId = msg?.message_id || msg?.ephemeral_message_id;
    const userId = ctx.from?.id;
    if (!messageId || !ctx.chat?.id) return;

    const db = loadSettings();
    if (!db[ctx.chat.id]) db[ctx.chat.id] = {};
    db[ctx.chat.id].lastMessageId = messageId;
    if (userId) {
        if (!db[ctx.chat.id].userDashboards) db[ctx.chat.id].userDashboards = {};
        db[ctx.chat.id].userDashboards[userId] = messageId;
    }
    saveSettings(db);
}

async function sendEphemeralMessage(ctx, text, extra = {}) {
    const userId = ctx.from?.id;
    const params = getEphemeralParams(ctx);
    if (!params) return null;

    try {
        const msg = await ctx.telegram.callApi('sendMessage', {
            chat_id: ctx.chat.id,
            text,
            ephemeral_message_parameters: params,
            ...extra
        });
        saveDashboardMessage(ctx, msg);
        return msg;
    } catch (err1) {
        console.log(`[EPHEMERAL 10.3] Failed: ${err1.message}`);
    }

    try {
        const msg = await ctx.telegram.callApi('sendMessage', {
            chat_id: ctx.chat.id,
            text,
            receiver_user_id: userId,
            ...(ctx.callbackQuery?.id ? { callback_query_id: ctx.callbackQuery.id } : {}),
            ...extra
        });
        saveDashboardMessage(ctx, msg);
        return msg;
    } catch (err2) {
        console.log(`[EPHEMERAL 10.2] Failed: ${err2.message}`);
    }

    if (ctx.callbackQuery?.id) {
        try {
            await ctx.answerCbQuery('Не удалось отправить приватное сообщение. Проверьте права бота.', { show_alert: true });
        } catch (e) {}
    }

    return null;
}

async function refreshDashboard(ctx, text, extra = {}) {
    await deleteOldDashboard(ctx);

    if (isGroupChat(ctx)) {
        return sendEphemeralMessage(ctx, text, extra);
    }

    const msg = await ctx.reply(text, extra);
    saveDashboardMessage(ctx, msg);

    return msg;
}

async function smartEdit(ctx, text, extra = {}) {
    if (isGroupChat(ctx)) {
        // В группе нельзя падать на обычный editMessageText: он меняет публичное сообщение для всех.
        await deleteOldDashboard(ctx);
        return sendEphemeralMessage(ctx, text, extra);
    }

    try {
        const msg = await ctx.editMessageText(text, extra);
        saveDashboardMessage(ctx, msg);
        return msg;
    } catch (e) {
        return refreshDashboard(ctx, text, extra);
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function clearInputTimer(userStates, chatId, userId) {
    const timer = userStates[chatId]?._timers?.[userId];
    if (timer) clearTimeout(timer);
    if (userStates[chatId]?._timers) delete userStates[chatId]._timers[userId];
}

function setInputTimer(ctx, userStates, timeoutMs = 60000) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (!userStates[chatId]) userStates[chatId] = {};
    if (!userStates[chatId]._timers) userStates[chatId]._timers = {};

    clearInputTimer(userStates, chatId, userId);

    userStates[chatId]._timers[userId] = setTimeout(async () => {
        if (!userStates[chatId]?.[userId]) return;

        delete userStates[chatId][userId];
        delete userStates[chatId]._timers[userId];
        if (userStates[chatId]._lastActivity) delete userStates[chatId]._lastActivity[userId];

        console.log(`[STATE] Auto-reset state for user ${userId} (timeout 60s)`);
        const timeoutCtx = Object.create(ctx);
        timeoutCtx.callbackQuery = null;
        await refreshDashboard(timeoutCtx, '⌛ Время ожидания истекло. Возвращаю в главное меню.', { parse_mode: 'HTML', ...require('../keyboards').getMainMenu() });
    }, timeoutMs);
}

module.exports = { cleanMsg, refreshDashboard, smartEdit, sleep, setInputTimer, clearInputTimer };
