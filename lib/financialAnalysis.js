/**
 * web/lib/financialAnalysis.js
 * 
 * 整合抓取、Pivot、合併與指標計算邏輯
 */

const axios = require('axios');

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';

async function fetchFinMind(dataset, stockId, startDate) {
  const token = process.env.FINMIND_TOKEN;
  if (!token) throw new Error('找不到 FINMIND_TOKEN');

  const params = {
    dataset,
    data_id: stockId,
    start_date: startDate,
  };

  const response = await axios.get(FINMIND_URL, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });

  if (response.data.status !== 200 && response.data.status !== undefined) {
    throw new Error(`FinMind 回應異常: ${JSON.stringify(response.data).slice(0, 300)}`);
  }

  return response.data.data;
}

function pivotByDate(rawRows) {
  const pivoted = {};
  for (const row of rawRows) {
    const { date, type, value } = row;
    if (!pivoted[date]) pivoted[date] = {};
    pivoted[date][type] = value;
  }
  return pivoted;
}

async function analyzeStock(stockId, startDate) {
  // 1. 平行抓取三張表
  const [incomeRaw, balanceRaw, cashflowRaw] = await Promise.all([
    fetchFinMind('TaiwanStockFinancialStatements', stockId, startDate),
    fetchFinMind('TaiwanStockBalanceSheet', stockId, startDate),
    fetchFinMind('TaiwanStockCashFlowsStatement', stockId, startDate),
  ]);

  const incomePivoted = pivotByDate(incomeRaw);
  const balancePivoted = pivotByDate(balanceRaw);
  const cashflowPivoted = pivotByDate(cashflowRaw);

  const allDates = Array.from(
    new Set([
      ...Object.keys(incomePivoted),
      ...Object.keys(balancePivoted),
      ...Object.keys(cashflowPivoted),
    ])
  ).sort();

  const analysis = {};
  const prevCumulativeValues = {};
  let lastYear = null;

  for (const date of allDates) {
    const [year] = date.split('-');
    
    if (year !== lastYear) {
      for (const key in prevCumulativeValues) delete prevCumulativeValues[key];
      lastYear = year;
    }

    const income = incomePivoted[date] || {};
    const balance = balancePivoted[date] || {};
    const cashflow = cashflowPivoted[date] || {};

    // 現金流量表：累計數 (YTD) -> 單季數
    const quarterlyCashflow = {};
    const cfFields = ['CashFlowsFromOperatingActivities', 'PropertyAndPlantAndEquipment'];
    for (const field of cfFields) {
      const cumulativeValue = cashflow[field];
      if (cumulativeValue !== undefined) {
        const prevValue = prevCumulativeValues[field] || 0;
        quarterlyCashflow[field] = cumulativeValue - prevValue;
        prevCumulativeValues[field] = cumulativeValue;
      }
    }

    // 提取欄位
    const merged = {
      income: {
        Revenue: income.Revenue,
        CostOfGoodsSold: income.CostOfGoodsSold,
        GrossProfit: income.GrossProfit,
        OperatingIncome: income.OperatingIncome,
        NetIncome: income.IncomeAfterTaxes ?? income.NetIncome,
        EPS: income.EPS,
      },
      balance: {
        TotalAssets: balance.TotalAssets,
        CurrentAssets: balance.CurrentAssets,
        CurrentLiabilities: balance.CurrentLiabilities,
      },
      cashflow: {
        CashFlowsFromOperatingActivities: quarterlyCashflow.CashFlowsFromOperatingActivities,
        PropertyAndPlantAndEquipment: quarterlyCashflow.PropertyAndPlantAndEquipment,
      },
    };

    // 股東權益備援鏈
    let equity = null;
    let equitySource = 'unavailable';

    if (balance.EquityAttributableToOwnersOfParent !== undefined) {
      equity = balance.EquityAttributableToOwnersOfParent;
      equitySource = 'direct';
    } else if (balance.Equity !== undefined) {
      equity = balance.Equity;
      equitySource = 'equity_field';
    } else if (balance.TotalAssets !== undefined && balance.Liabilities !== undefined) {
      equity = balance.TotalAssets - balance.Liabilities;
      equitySource = 'derived';
    }

    merged.balance.EquityAttributableToOwnersOfParent = equity;
    merged.balance.equity_source = equitySource;

    // 計算指標
    const { income: inc, balance: bal, cashflow: cf } = merged;
    const metrics = {};

    if (inc.Revenue) {
      metrics.gross_profit_margin = inc.GrossProfit / inc.Revenue;
      metrics.operating_profit_margin = inc.OperatingIncome / inc.Revenue;
      metrics.net_profit_margin = inc.NetIncome / inc.Revenue;
    }

    if (inc.NetIncome !== undefined && bal.EquityAttributableToOwnersOfParent !== undefined) {
      const quarterlyRoe = inc.NetIncome / bal.EquityAttributableToOwnersOfParent;
      metrics.roe_quarterly = quarterlyRoe;
      metrics.roe_annualized = quarterlyRoe * 4;
    } else {
      metrics.roe_quarterly = null;
      metrics.roe_annualized = null;
    }

    if (cf.CashFlowsFromOperatingActivities !== undefined && cf.PropertyAndPlantAndEquipment !== undefined) {
      metrics.free_cash_flow = cf.CashFlowsFromOperatingActivities - cf.PropertyAndPlantAndEquipment;
    }

    analysis[date] = {
      ...merged,
      metrics,
    };
  }

  // 計算 YoY
  for (const date of allDates) {
    const [year, month, day] = date.split('-');
    const prevYearDate = `${parseInt(year) - 1}-${month}-${day}`;

    if (analysis[prevYearDate] && analysis[date].income.Revenue && analysis[prevYearDate].income.Revenue) {
      const currentRev = analysis[date].income.Revenue;
      const prevRev = analysis[prevYearDate].income.Revenue;
      analysis[date].metrics.revenue_yoy = (currentRev - prevRev) / prevRev;
    }
  }

  return analysis;
}

module.exports = { analyzeStock };
