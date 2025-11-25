const axios = require('axios');
const { USER_AGENT } = require('../config');

/**
 * Проверяет наличие игры на FreeTP.
 * Логика: Ищет в Google. Берет первую ссылку.
 * Проверяет, что это freetp.org И что в URL есть название игры.
 */
async function checkFreeTp(gameName) {
    try {
        // Очищаем имя для поиска: оставляем буквы и цифры
        const cleanName = gameName.replace(/[^\w\s]/gi, '').trim();
        const query = encodeURIComponent(`site:freetp.org ${cleanName}`);

        const response = await axios.get(`https://www.google.com/search?q=${query}`, {
            headers: { 'User-Agent': USER_AGENT }
        });

        const html = response.data;

        // Регулярка ищет первую ссылку в выдаче Google
        // Обычно это <a href="/url?q=https://freetp.org/..."
        const regex = /<a href="\/url\?q=(https:\/\/freetp\.org\/[^"&]+)/;
        const match = html.match(regex);

        if (match && match[1]) {
            const foundUrl = match[1]; // Это прямая ссылка, например https://freetp.org/games/123-game.html

            // Проверка: Содержит ли URL название игры?
            // Разбиваем название игры на слова (минимум 3 символа)
            const nameParts = cleanName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            const urlLower = foundUrl.toLowerCase();

            // Если хотя бы одно значимое слово из названия есть в URL - считаем успехом
            // (Для "Sea of Thieves" ищем "sea" или "thieves" в url)
            const isMatch = nameParts.some(part => urlLower.includes(part));

            if (isMatch) {
                return '✅'; // Найдено и совпадает
            } else {
                return '❓'; // Ссылка есть, но название подозрительно не похоже
            }
        }

        return '❌'; // Ссылок на freetp не найдено
    } catch (e) {
        console.error("FreeTP Check Error:", e.message);
        return '❓';
    }
}

module.exports = { checkFreeTp };