const { getStockList } = require('@/lib/stockList');
const { analyzeStock } = require('@/lib/financialAnalysis');
const { getFinancialIndustryMetrics } = require('@/lib/financialIndustryMetrics');

const DEFAULT_MAX_PEERS = 6;
const START_DATE = '2023-01-01';

const MANUFACTURING_METRICS = [
  { key: 'gross_profit_margin', direction: 'desc' },
  { key: 'operating_profit_margin', direction: 'desc' },
  { key: 'net_profit_margin', direction: 'desc' },
  { key: 'roe_annualized', direction: 'desc' },
  { key: 'free_cash_flow', direction: 'desc' },
];

const BANK_METRICS = [
  { key: 'net_profit_margin', direction: 'desc' },
  { key: 'roe_annualized', direction: 'desc' },
  { key: 'net_interest_income_ratio', direction: 'desc' },
  { key: 'cost_income_ratio', direction: 'asc' },
  { key: 'bad_debt_ratio', direction: 'asc' },
];

const INSURANCE_METRICS = [
  { key: 'net_profit_margin_vs_operating', direction: 'desc' },
  { key: 'roe_annualized', direction: 'desc' },
  { key: 'insurance_service_result_ratio', direction: 'desc' },
  { key: 'financial_result_ratio', direction: 'desc' },
];

const METRIC_CONFIG_BY_SUBTYPE = {
  bank: BANK_METRICS,
  holding_company: BANK_METRICS,
  insurance: INSURANCE_METRICS,
};

function isFinancialCategory(category) {
  return !!category && (category.includes('金融') || category.includes('保險'));
}

function getLatestDate(obj) {
  const dates = Object.keys(obj).sort();
  return dates[dates.length - 1];
}

async function fetchManufacturingSnapshot(stockId, stockName) {
  try {
    const analysisData = await analyzeStock(stockId, START_DATE);
    const latestDate = getLatestDate(analysisData);
    const latest = analysisData[latestDate];
    return {
      stock_id: stockId,
      stock_name: stockName,
      latest_date: latestDate,
      subtype: null,
      metrics: latest ? latest.metrics : null,
      error: null,
    };
  } catch (err) {
    return { stock_id: stockId, stock_name: stockName, latest_date: null, subtype: null, metrics: null, error: err.message };
  }
}

async function fetchFinancialSnapshot(stockId, stockName) {
  try {
    const result = await getFinancialIndustryMetrics(stockId);
    if (!result.available) {
      return {
        stock_id: stockId,
        stock_name: stockName,
        latest_date: result.latest_date || null,
        subtype: result.sub_type || 'unknown',
        metrics: null,
        error: result.reason,
      };
    }
    return {
      stock_id: stockId,
      stock_name: stockName,
      latest_date: result.latest_date,
      subtype: result.sub_type,
      metrics: result.metrics,
      error: null,
    };
  } catch (err) {
    return { stock_id: stockId, stock_name: stockName, latest_date: null, subtype: 'unknown', metrics: null, error: err.message };
  }
}

function computeRanking(snapshots, metricConfigs) {
  const ranking = {};

  for (const config of metricConfigs) {
    const key = config.key;
    const valid = snapshots
      .filter((s) => s.metrics && s.metrics[key] !== null && s.metrics[key] !== undefined && !Number.isNaN(s.metrics[key]))
      .map((s) => ({ stock_id: s.stock_id, value: s.metrics[key] }))
      .sort((a, b) => (config.direction === 'asc' ? a.value - b.value : b.value - a.value));

    valid.forEach((item, index) => {
      if (!ranking[item.stock_id]) ranking[item.stock_id] = {};
      ranking[item.stock_id][key] = {
        rank: index + 1,
        percentile: valid.length > 1 ? 1 - index / (valid.length - 1) : 1,
      };
    });
  }

  return ranking;
}

async function getPeerComparison(stockId, maxPeers) {
  const limit = maxPeers || DEFAULT_MAX_PEERS;

  const stockList = await getStockList();
  const target = stockList.find((s) => s.stock_id === stockId);

  if (!target) {
    throw new Error(`找不到股票代號 ${stockId} 的基本資料`);
  }

  const industryCategory = target.industry_category;
  const isFinancial = isFinancialCategory(industryCategory);

  const candidatePeers = stockList
    .filter((s) => s.stock_id !== stockId && s.industry_category === industryCategory && s.type === 'twse')
    .sort((a, b) => a.stock_id.localeCompare(b.stock_id))
    .slice(0, limit * 2); // 金融業要抓多一點候選，因為子類型不同的會被排除

  if (!isFinancial) {
    const peers = candidatePeers.slice(0, limit);
    const targets = [{ stock_id: stockId, stock_name: target.stock_name }, ...peers.map((p) => ({ stock_id: p.stock_id, stock_name: p.stock_name }))];
    const snapshots = await Promise.all(targets.map((t) => fetchManufacturingSnapshot(t.stock_id, t.stock_name)));
    const ranking = computeRanking(snapshots, MANUFACTURING_METRICS);

    const comparison = {};
    for (const snap of snapshots) {
      comparison[snap.stock_id] = {
        stock_name: snap.stock_name,
        latest_date: snap.latest_date,
        metrics: snap.metrics,
        ranking: ranking[snap.stock_id] || null,
        error: snap.error,
      };
    }

    return {
      target_stock_id: stockId,
      industry_category: industryCategory,
      is_financial: false,
      metric_keys: MANUFACTURING_METRICS.map((m) => m.key),
      peer_count: peers.length,
      sample_note: `為求網頁回應速度，僅抽樣同產業前 ${limit} 家公司（依股票代號排序），非完整同業清單，亦未依市值排序，僅供參考。`,
      comparison,
    };
  }

  // 金融業：先取得目標公司本身的子類型
  const targetSnapshot = await fetchFinancialSnapshot(stockId, target.stock_name);
  const targetSubtype = targetSnapshot.subtype;
  const metricConfigs = METRIC_CONFIG_BY_SUBTYPE[targetSubtype] || BANK_METRICS;

  const peerSnapshots = await Promise.all(
    candidatePeers.map((p) => fetchFinancialSnapshot(p.stock_id, p.stock_name))
  );

  // 只保留跟目標公司同子類型的同業，子類型不同的排除並標註原因
  const usablePeers = [];
  const excludedPeers = [];
  for (const snap of peerSnapshots) {
    if (snap.subtype === targetSubtype && snap.metrics) {
      usablePeers.push(snap);
    } else if (snap.subtype && snap.subtype !== targetSubtype && snap.subtype !== 'unknown') {
      excludedPeers.push({
        ...snap,
        error: `子類型為「${snap.subtype}」，與目標公司「${targetSubtype}」不同，不納入比較`,
      });
    } else {
      excludedPeers.push(snap);
    }
    if (usablePeers.length >= limit) break;
  }

  const allSnapshots = [targetSnapshot, ...usablePeers];
  const ranking = computeRanking(allSnapshots, metricConfigs);

  const comparison = {};
  for (const snap of [...allSnapshots, ...excludedPeers.slice(0, Math.max(0, limit - usablePeers.length))]) {
    comparison[snap.stock_id] = {
      stock_name: snap.stock_name,
      latest_date: snap.latest_date,
      metrics: snap.metrics,
      ranking: ranking[snap.stock_id] || null,
      error: snap.error,
    };
  }

  return {
    target_stock_id: stockId,
    industry_category: industryCategory,
    is_financial: true,
    financial_subtype: targetSubtype,
    metric_keys: metricConfigs.map((m) => m.key),
    peer_count: usablePeers.length,
    sample_note: `目標公司金融子類型為「${targetSubtype}」，僅與相同子類型的同業比較（銀行/金控與保險科目結構不同，不混合比較），非完整同業清單。`,
    comparison,
  };
}

module.exports = { getPeerComparison };
