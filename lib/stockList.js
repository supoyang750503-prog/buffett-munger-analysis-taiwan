const axios = require('axios');

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';

let cachedList = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 快取6小時，避免每次都重新打 FinMind

async function fetchAllStockInfo() {
  const token = process.env.FINMIND_TOKEN;

  if (!token) {
    throw new Error('找不到 FINMIND_TOKEN，請檢查 .env.local');
  }

  const response = await axios.get(FINMIND_URL, {
    headers: { Authorization: `Bearer ${token}` },
    params: { dataset: 'TaiwanStockInfo' },
  });

  return response.data.data || [];
}

async function getStockList() {
  const now = Date.now();

  if (cachedList && now - cachedAt < CACHE_TTL_MS) {
    return cachedList;
  }

  const rows = await fetchAllStockInfo();

  // TaiwanStockInfo 可能包含同一檔股票的多筆歷史紀錄，只取每檔股票最新的一筆
  const latestByStockId = {};
  for (const row of rows) {
    const existing = latestByStockId[row.stock_id];
    if (!existing || row.date > existing.date) {
      latestByStockId[row.stock_id] = row;
    }
  }

  const list = Object.values(latestByStockId).map((r) => ({
    stock_id: r.stock_id,
    stock_name: r.stock_name,
    industry_category: r.industry_category || '',
    type: r.type || '',
  }));

  cachedList = list;
  cachedAt = now;

  return list;
}

module.exports = { getStockList };
