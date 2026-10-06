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

async function refreshDashboard(ctx, text, extra = {}) {
    await deleteOldDashboard(ctx);

    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    const userId = ctx.from?.id;
    const callbackQueryId = ctx.callbackQuery?.id;

    let msg = null;

    // В группах отправляем с параметрами приватности (Bot API 10.2 / 10.3)
    if (isGroup && userId) {
        // Попытка 1: Bot API 10.3 (EphemeralMessageParameters)
        try {
            const ephemeralParams = {
                receiver_user_id: userId,
                ...(callbackQueryId ? { callback_query_id: callbackQueryId, replace_callback_query_message: true } : {})
            };
            msg = await ctx.telegram.callApi('sendMessage', {
                chat_id: ctx.chat.id,
                text,
                ephemeral_message_parameters: ephemeralParams,
                ...extra
            });
        } catch (err1) {
            console.log(`[EPHEMERAL 10.3] Failed: ${err1.message}`);
        }

        // Попытка 2: Bot API 10.2 (receiver_user_id + callback_query_id напрямую)
        if (!msg) {
            try {
                msg = await ctx.telegram.callApi('sendMessage', {
                    chat_id: ctx.chat.id,
                    text,
                    receiver_user_id: userId,
                    ...(callbackQueryId ? { callback_query_id: callbackQueryId } : {}),
                    ...extra
                });
            } catch (err2) {
                console.log(`[EPHEMERAL 10.2] Failed: ${err2.message}`);
            }
        }
    }

    // Fallback: обычная отправка (если личка или если эфемерный API недоступен)
    if (!msg) {
        msg = await ctx.reply(text, extra);
    }

    const messageId = msg?.message_id || msg?.ephemeral_message_id;
    if (messageId && ctx.chat?.id) {
        const db = loadSettings();
        if (!db[ctx.chat.id]) db[ctx.chat.id] = {};
        db[ctx.chat.id].lastMessageId = messageId;
        if (userId) {
            if (!db[ctx.chat.id].userDashboards) db[ctx.chat.id].userDashboards = {};
            db[ctx.chat.id].userDashboards[userId] = messageId;
        }
        saveSettings(db);
    }

    return msg;
}

async function smartEdit(ctx, text, extra = {}) {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    const userId = ctx.from?.id;

    if (isGroup && userId) {
        // Попытка editEphemeralMessageText (Bot API 10.2 / 10.3)
        try {
            const messageId = ctx.callbackQuery?.message?.message_id;
            return await ctx.telegram.callApi('editEphemeralMessageText', {
                chat_id: ctx.chat.id,
                receiver_user_id: userId,
                ephemeral_message_id: messageId,
                text,
                ...extra
            });
        } catch (e) {
            // Игнорируем и переходим к стандартному редактированию
        }
    }

    try {
        await ctx.editMessageText(text, extra);
    } catch (e) {
        await refreshDashboard(ctx, text, extra);
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { cleanMsg, refreshDashboard, smartEdit, sleep };
