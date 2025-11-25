const { loadSettings, saveSettings } = require('./db');

async function cleanMsg(ctx) {
    try { await ctx.deleteMessage(); } catch (e) {}
}

async function deleteOldDashboard(ctx) {
    const db = loadSettings();
    const lastId = db[ctx.chat.id]?.lastMessageId;
    if (lastId) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, lastId); } catch (e) {}
    }
}

async function refreshDashboard(ctx, text, extra) {
    await deleteOldDashboard(ctx);
    const msg = await ctx.reply(text, extra);

    const db = loadSettings();
    if (!db[ctx.chat.id]) db[ctx.chat.id] = {};
    db[ctx.chat.id].lastMessageId = msg.message_id;
    saveSettings(db);

    return msg;
}

async function smartEdit(ctx, text, extra) {
    try {
        await ctx.editMessageText(text, extra);
    } catch (e) {
        await refreshDashboard(ctx, text, extra);
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { cleanMsg, refreshDashboard, smartEdit, sleep };
