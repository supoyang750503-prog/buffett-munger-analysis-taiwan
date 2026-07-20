const axios = require('axios');
const { analyzeStock } = require('@/lib/financialAnalysis');

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';

const SCENARIOS = {
  conservative: { growthMultiplier: 0.5, growthCap: 0.08, discountRate: 0.11, terminalGrowth: 0.02, label: '保守情境' },
  base: { growthMultiplier: 1.0, growthCap: 0.15, discountRate: 0.09, terminalGrowth: 0.025, label: '中性情境' },
  optimistic: { growthMultiplier: 1.3, growthCap: 0.25, discountRate: 0.08, terminalGrowth: 0.03, label: '樂觀情境' },
};

const PROJECTION_YEARS = 5;
const DEFAULT_GROWTH_FALLBACK = 0.05; // 歷史資料不足時的保守預設成長率

async function fetchLatestPrice(stockId) {
  const token = process.env.FINMIND_TOKEN;
  if (!token) throw new Error('找不到 FINMIND_TOKEN，請檢查 .env.local');

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const fmt = (d) => d.toISOString().slice(0, 10);

  const response = await axios.get(FINMIND_URL, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      dataset: 'TaiwanStockPrice',
      data_id: stockId,
      start_date: fmt(startDate),
      end_date: fmt(endDate),
    },
  });

  const rows = response.data.data || [];
  if (rows.length === 0) {
    throw new Error('近30天內查無股價資料');
  }

  const sorted = rows.sort((a, b) => (a.date > b.date ? 1 : -1));
  const latest = sorted[sorted.length - 1];

  return { price: latest.close, date: latest.date };
}

function sumLastNQuarters(analysisData, dates, n, extractor) {
  const slice = dates.slice(-n);
  let sum = 0;
  let count = 0;
  for (const d of slice) {
    const v = extractor(analysisData[d]);
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      sum += v;
      count += 1;
    }
  }
  return count === n ? sum : null;
}

function estimateSharesOutstanding(analysisData, dates) {
  // 用近4季淨利加總 / 近4季EPS加總，反推約略股數（假設股數在期間內變動不大）
  const ttmNetIncome = sumLastNQuarters(analysisData, dates, 4, (d) => {
    if (!d || !d.income) return null;
    return d.income.IncomeAfterTaxes !== undefined ? d.income.IncomeAfterTaxes : d.income.NetIncome;
  });
  const ttmEPS = sumLastNQuarters(analysisData, dates, 4, (d) => (d && d.income ? d.income.EPS : null));

  if (ttmNetIncome === null || ttmEPS === null || ttmEPS === 0) {
    return null;
  }

  return ttmNetIncome / ttmEPS;
}

function computeHistoricalRevenueCAGR(analysisData, dates) {
  if (dates.length < 16) {
    return { cagr: null, note: '歷史資料不足3年（需至少16季），無法計算可靠的營收成長率' };
  }

  const recentTTM = sumLastNQuarters(analysisData, dates, 4, (d) => (d && d.income ? d.income.Revenue : null));
  const olderDates = dates.slice(-16, -12);
  let olderTTM = 0;
  let olderCount = 0;
  for (const d of olderDates) {
    const v = analysisData[d] && analysisData[d].income ? analysisData[d].income.Revenue : null;
    if (v !== null && v !== undefined) {
      olderTTM += v;
      olderCount += 1;
    }
  }
  olderTTM = olderCount === 4 ? olderTTM : null;

  if (recentTTM === null || olderTTM === null || olderTTM <= 0) {
    return { cagr: null, note: '歷史營收資料不完整，無法計算成長率' };
  }

  const cagr = Math.pow(recentTTM / olderTTM, 1 / 3) - 1;
  return { cagr, note: `依近3年營收變化計算（${olderTTM.toFixed(0)} -> ${recentTTM.toFixed(0)}）` };
}

function runDCF(ttmFCF, growthRate, scenario) {
  const { discountRate, terminalGrowth } = scenario;
  let fcf = ttmFCF;
  let presentValueSum = 0;

  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    fcf = fcf * (1 + growthRate);
    const discounted = fcf / Math.pow(1 + discountRate, year);
    presentValueSum += discounted;
  }

  const terminalValue = (fcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  const discountedTerminalValue = terminalValue / Math.pow(1 + discountRate, PROJECTION_YEARS);

  return presentValueSum + discountedTerminalValue;
}

async function getValuation(stockId, providedAnalysisData) {
  const analysisData = providedAnalysisData || (await analyzeStock(stockId, '2019-01-01'));
  const dates = Object.keys(analysisData).sort();

  const ttmFCF = sumLastNQuarters(analysisData, dates, 4, (d) => (d && d.metrics ? d.metrics.free_cash_flow : null));
  const ttmRevenue = sumLastNQuarters(analysisData, dates, 4, (d) => (d && d.income ? d.income.Revenue : null));
  const sharesOutstanding = estimateSharesOutstanding(analysisData, dates);
  const { cagr: historicalCAGR, note: cagrNote } = computeHistoricalRevenueCAGR(analysisData, dates);

  let priceInfo = null;
  let priceError = null;
  try {
    priceInfo = await fetchLatestPrice(stockId);
  } catch (err) {
    priceError = err.message;
  }

  if (ttmFCF === null || ttmFCF <= 0) {
    return {
      available: false,
      reason: '近4季自由現金流資料不足或為負值，簡易DCF模型無法計算（負自由現金流無法用標準成長模型估值）',
      ttm_free_cash_flow: ttmFCF,
      current_price: priceInfo,
    };
  }

  if (sharesOutstanding === null || sharesOutstanding <= 0) {
    return {
      available: false,
      reason: '無法估算在外流通股數（近4季淨利或每股盈餘資料不足），無法換算每股內在價值',
      ttm_free_cash_flow: ttmFCF,
      current_price: priceInfo,
    };
  }

  const baseGrowth = historicalCAGR !== null ? historicalCAGR : DEFAULT_GROWTH_FALLBACK;

  const scenarios = {};
  for (const [key, scenario] of Object.entries(SCENARIOS)) {
    let growthRate = baseGrowth * scenario.growthMultiplier;
    growthRate = Math.max(-0.1, Math.min(growthRate, scenario.growthCap));

    const equityValue = runDCF(ttmFCF, growthRate, scenario);
    const intrinsicValuePerShare = equityValue / sharesOutstanding;

    const marginOfSafetyPct =
      priceInfo && priceInfo.price > 0
        ? (intrinsicValuePerShare - priceInfo.price) / intrinsicValuePerShare
        : null;

    scenarios[key] = {
      label: scenario.label,
      assumed_growth_rate: growthRate,
      discount_rate: scenario.discountRate,
      terminal_growth: scenario.terminalGrowth,
      intrinsic_value_per_share: intrinsicValuePerShare,
      margin_of_safety_pct: marginOfSafetyPct,
    };
  }

  return {
    available: true,
    ttm_free_cash_flow: ttmFCF,
    ttm_revenue: ttmRevenue,
    shares_outstanding_estimate: sharesOutstanding,
    historical_revenue_cagr: historicalCAGR,
    historical_cagr_note: cagrNote,
    current_price: priceInfo,
    price_error: priceError,
    scenarios,
    disclaimer:
      '本估值為簡化版DCF模型，股數以近4季淨利/EPS反推估算、成長率以歷史營收CAGR外推，' +
      '未考慮債務結構、業外損益、產業週期等因素，僅供教育與研究參考，不構成投資建議。',
  };
}

module.exports = { getValuation };
