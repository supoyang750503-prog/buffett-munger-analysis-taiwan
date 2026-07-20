const axios = require('axios');

const FINMIND_URL = 'https://api.finmindtrade.com/api/v4/data';

async function fetchDataset(dataset, stockId, token, startDate) {
  const response = await axios.get(FINMIND_URL, {
    headers: { Authorization: `Bearer ${token}` },
    params: { dataset, data_id: stockId, start_date: startDate },
  });
  return response.data.data || [];
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

function resolveEquity(latestBalance) {
  if (latestBalance && latestBalance.EquityAttributableToOwnersOfParent !== undefined && latestBalance.EquityAttributableToOwnersOfParent !== null) {
    return { value: latestBalance.EquityAttributableToOwnersOfParent, source: 'direct' };
  }
  if (latestBalance && latestBalance.Equity !== undefined && latestBalance.Equity !== null) {
    return { value: latestBalance.Equity, source: 'equity_field' };
  }
  const totalAssets = latestBalance ? latestBalance.TotalAssets : null;
  const liabilities = latestBalance ? latestBalance.Liabilities : null;
  if (totalAssets !== undefined && totalAssets !== null && liabilities !== undefined && liabilities !== null) {
    return { value: totalAssets - liabilities, source: 'derived' };
  }
  return { value: null, source: 'unavailable' };
}

function getLatestDate(obj) {
  const dates = Object.keys(obj).sort();
  return dates[dates.length - 1];
}

function resolveNetIncome(income) {
  if (income.IncomeAfterTax !== undefined) return income.IncomeAfterTax;
  if (income.IncomeAfterTaxes !== undefined) return income.IncomeAfterTaxes;
  if (income.NetIncome !== undefined) return income.NetIncome;
  return null;
}

function detectSubType(income) {
  if (income['保險服務結果'] !== undefined) return 'insurance';
  if (income.NetInterestIncome !== undefined) {
    return income.Revenue !== undefined ? 'holding_company' : 'bank';
  }
  return 'unknown';
}

function computeBankOrHoldingMetrics(income, equity, subType) {
  const netIncome = resolveNetIncome(income);

  const revenue =
    subType === 'holding_company'
      ? income.Revenue
      : (income.NetInterestIncome || 0) + (income.NetNonInterestIncome || 0);

  if (!revenue) {
    return { available: false, reason: '無法取得或計算「淨收益」（利息淨收益＋非利息淨收益），無法計算指標' };
  }

  const netProfitMargin = netIncome !== null ? netIncome / revenue : null;
  const roeQuarterly = netIncome !== null && equity ? netIncome / equity : null;

  return {
    available: true,
    sub_type: subType,
    metrics: {
      net_profit_margin: netProfitMargin,
      roe_annualized: roeQuarterly !== null ? roeQuarterly * 4 : null,
      net_interest_income_ratio: income.NetInterestIncome !== undefined ? income.NetInterestIncome / revenue : null,
      cost_income_ratio: income.OperatingExpenses !== undefined ? income.OperatingExpenses / revenue : null,
      bad_debt_ratio: income.BadDebts !== undefined ? income.BadDebts / revenue : null,
    },
  };
}

function computeInsuranceMetrics(income, equity) {
  const operatingIncome = income.OperatingIncome;
  const netIncome = resolveNetIncome(income);

  if (!operatingIncome) {
    return { available: false, reason: '無法取得「營業利益」欄位，無法計算保險業（IFRS17）指標' };
  }

  const roeQuarterly = netIncome !== null && equity ? netIncome / equity : null;

  return {
    available: true,
    sub_type: 'insurance',
    metrics: {
      net_profit_margin_vs_operating: netIncome !== null ? netIncome / operatingIncome : null,
      roe_annualized: roeQuarterly !== null ? roeQuarterly * 4 : null,
      insurance_service_result_ratio:
        income['保險服務結果'] !== undefined ? income['保險服務結果'] / operatingIncome : null,
      financial_result_ratio: income['財務結果'] !== undefined ? income['財務結果'] / operatingIncome : null,
    },
  };
}

async function getFinancialIndustryMetrics(stockId) {
  const token = process.env.FINMIND_TOKEN;
  if (!token) throw new Error('找不到 FINMIND_TOKEN，請檢查 .env.local');

  const startDate = '2019-01-01';

  const [incomeRaw, balanceRaw] = await Promise.all([
    fetchDataset('TaiwanStockFinancialStatements', stockId, token, startDate),
    fetchDataset('TaiwanStockBalanceSheet', stockId, token, startDate),
  ]);

  const pivotedIncome = pivotByDate(incomeRaw);
  const pivotedBalance = pivotByDate(balanceRaw);

  const latestDate = getLatestDate(pivotedIncome);
  if (!latestDate) {
    return { available: false, reason: '查無損益表資料' };
  }

  const latestIncome = pivotedIncome[latestDate] || {};
  const latestBalance = pivotedBalance[latestDate] || {};
  const equityResolved = resolveEquity(latestBalance);

  const subType = detectSubType(latestIncome);

  let result;
  if (subType === 'insurance') {
    result = computeInsuranceMetrics(latestIncome, equityResolved.value);
  } else if (subType === 'bank' || subType === 'holding_company') {
    result = computeBankOrHoldingMetrics(latestIncome, equityResolved.value, subType);
  } else {
    result = {
      available: false,
      reason:
        '無法辨識此公司的金融子類型（非金控／銀行／IFRS17保險格式），' +
        '目前金融業指標框架僅支援這三種類型，其他金融子類型（如票券金融公司）尚未支援。',
    };
  }

  if (!result.available) {
    return { available: false, reason: result.reason, latest_date: latestDate };
  }

  return {
    available: true,
    latest_date: latestDate,
    sub_type: result.sub_type,
    equity_source: equityResolved.source,
    metrics: result.metrics,
  };
}

module.exports = { getFinancialIndustryMetrics };
