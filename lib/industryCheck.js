const axios = require('axios');

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';

async function checkIndustry(stockId) {
  const token = process.env.FINMIND_TOKEN;

  if (!token) {
    throw new Error('找不到 FINMIND_TOKEN，請檢查 .env.local');
  }

  const response = await axios.get(FINMIND_URL, {
    headers: { Authorization: `Bearer ${token}` },
    params: { dataset: 'TaiwanStockInfo' },
  });

  const rows = response.data.data || [];
  const match = rows.find((r) => r.stock_id === stockId);
  const category = match ? match.industry_category || '' : '';
  const isFinancial = category.includes('金融') || category.includes('保險');

  return { stockId, category, isFinancial };
}

module.exports = { checkIndustry };
