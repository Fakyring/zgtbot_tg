const { Markup } = require('telegraf');

const getMainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('📚 Библиотека', 'menu_library'), Markup.button.callback('➕ Добавить игру', 'menu_add_game')],
    [Markup.button.callback('⚙️ Настройки', 'menu_settings'), Markup.button.callback('🗑 Удалить игру', 'menu_delete')],
    [Markup.button.callback('🗿 Ответ Дениса', 'denis_answer'), Markup.button.callback('✖️ Закрыть', 'action_close')]
]);

const getSettingsMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Привязать таблицу', 'set_link_table')],
    [Markup.button.callback('👤 Добавить друга', 'set_add_user')],
    [Markup.button.callback('🔄 Обновить цены', 'action_update_prices')],
    [Markup.button.callback('🔙 Назад', 'menu_main')]
]);

const getCancelMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('🔙 Отмена', 'action_cancel')]
]);

module.exports = { getMainMenu, getSettingsMenu, getCancelMenu };
