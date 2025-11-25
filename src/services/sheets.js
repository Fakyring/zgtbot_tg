const axios = require('axios');
const { sleep } = require('../utils/helpers');

async function fetchGameData(scriptUrl) {
    const res = await axios.get(scriptUrl);
    return res.data; // { games: [], users: [] }
}

module.exports = { fetchGameData };