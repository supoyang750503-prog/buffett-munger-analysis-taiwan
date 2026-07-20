'use client';

import { useState, useEffect, useRef } from 'react';

const SCORE_LABELS = {
  moat: '護城河強度',
  capital_allocation: '資本配置紀律',
  management_integrity: '管理層品格',
  business_understandability: '能力圈／可理解度',
  roe_stability: 'ROE 穩定性',
  margin_of_safety: '安全邊際',
};

function ScoreBar(props) {
  const score = props.score;
  const label = props.label;
  const rationale = props.rationale;
  const pct = score === null || score === undefined ? 0 : score * 10;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-semibold text-gray-900">
          {score === null || score === undefined ? '尚無資料' : `${score} / 10`}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-amber-600 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {rationale ? <p className="text-xs text-gray-500 mt-1">{rationale}</p> : null}
    </div>
  );
}

function formatNumber(n) {
  if (n === null || n === undefined) return 'N/A';
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1) + '億';
  return n.toLocaleString();
}

const PEER_METRIC_LABELS = {
  gross_profit_margin: '毛利率',
  operating_profit_margin: '營業利益率',
  net_profit_margin: '淨利率',
  roe_annualized: '年化ROE',
  free_cash_flow: '自由現金流',
  net_interest_income_ratio: '利息淨收益占比',
  cost_income_ratio: '成本收入比',
  bad_debt_ratio: '呆帳費用率',
  net_profit_margin_vs_operating: '淨利率（對營業利益）',
  insurance_service_result_ratio: '保險服務結果占營業利益比',
  financial_result_ratio: '財務結果占營業利益比',
};

function formatPeerMetricValue(key, value) {
  return key === 'free_cash_flow' ? formatNumber(value) : formatPercent(value);
}

function formatPercent(n) {
  if (n === null || n === undefined) return 'N/A';
  return (n * 100).toFixed(1) + '%';
}

export default function Home() {
  const [stockList, setStockList] = useState([]);
  const [stockId, setStockId] = useState('2330');
  const [companyName, setCompanyName] = useState('台積電');
  const [suggestions, setSuggestions] = useState([]);
  const [activeField, setActiveField] = useState(null);

  const [loading, setLoading] = useState(false);
  const [financials, setFinancials] = useState(null);
  const [supplyChain, setSupplyChain] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [industry, setIndustry] = useState(null);
  const [bankMetrics, setBankMetrics] = useState(null);
  const [peerComparison, setPeerComparison] = useState(null);
  const [valuation, setValuation] = useState(null);
  const [errors, setErrors] = useState({});

  const wrapperRef = useRef(null);

  useEffect(() => {
    fetch('/api/stock-list')
      .then((res) => res.json())
      .then((data) => setStockList(data.stocks || []))
      .catch(() => setStockList([]));
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setSuggestions([]);
        setActiveField(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleStockIdChange(value) {
    setStockId(value);
    setActiveField('id');

    if (!value) {
      setSuggestions([]);
      return;
    }

    const matches = stockList.filter((s) => s.stock_id.startsWith(value)).slice(0, 8);
    setSuggestions(matches);

    const exact = stockList.find((s) => s.stock_id === value);
    if (exact) {
      setCompanyName(exact.stock_name);
    }
  }

  function handleCompanyNameChange(value) {
    setCompanyName(value);
    setActiveField('name');

    if (!value) {
      setSuggestions([]);
      return;
    }

    const matches = stockList.filter((s) => s.stock_name.includes(value)).slice(0, 8);
    setSuggestions(matches);

    const exact = stockList.find((s) => s.stock_name === value);
    if (exact) {
      setStockId(exact.stock_id);
    }
  }

  function selectSuggestion(item) {
    setStockId(item.stock_id);
    setCompanyName(item.stock_name);
    setSuggestions([]);
    setActiveField(null);
  }

  async function handleAnalyze() {
    setLoading(true);
    setFinancials(null);
    setSupplyChain(null);
    setEvaluation(null);
    setIndustry(null);
    setBankMetrics(null);
    setPeerComparison(null);
    setValuation(null);
    setErrors({});
    setSuggestions([]);

    const nextErrors = {};

    let isFinancialIndustry = false;
    try {
      const res = await fetch(`/api/industry/${stockId}`);
      const data = await res.json();
      if (res.ok) {
        setIndustry(data);
        isFinancialIndustry = data.isFinancial;
      }
    } catch (err) {
      // 產業別檢查失敗不影響主流程，安靜略過
    }

    if (isFinancialIndustry) {
      try {
        const res = await fetch(`/api/bank-metrics/${stockId}`);
        const data = await res.json();
        if (res.ok) setBankMetrics(data);
      } catch (err) {
        // 金融業指標查詢失敗不影響主流程，安靜略過
      }
    }

    try {
      const res = await fetch(`/api/peer-comparison/${stockId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '水平分析失敗');
      setPeerComparison(data);
    } catch (err) {
      nextErrors.peerComparison = err.message;
    }

    let financialsData = null;
    try {
      const res = await fetch(`/api/financials/${stockId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '財務分析失敗');
      setFinancials(data);
      financialsData = data;
    } catch (err) {
      nextErrors.financials = err.message;
    }

    let valuationData = null;
    try {
      const res = await fetch(`/api/valuation/${stockId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisData: financialsData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '估值分析失敗');
      setValuation(data);
      valuationData = data;
    } catch (err) {
      nextErrors.valuation = err.message;
    }

    try {
      const res = await fetch(`/api/supply-chain/${stockId}?name=${encodeURIComponent(companyName)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '供應鏈查詢失敗');
      setSupplyChain(data);
    } catch (err) {
      nextErrors.supplyChain = err.message;
    }

    try {
      const res = await fetch(`/api/evaluation/${stockId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, analysisData: financialsData, valuationData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '評價生成失敗');
      setEvaluation(data);
    } catch (err) {
      nextErrors.evaluation = err.message;
    }

    setErrors(nextErrors);
    setLoading(false);
  }

  const latestDate = financials ? Object.keys(financials).sort().slice(-1)[0] : null;
  const latest = latestDate ? financials[latestDate] : null;
  const recentQuarters = financials ? Object.keys(financials).sort().slice(-8) : [];

  return (
    <main className="min-h-screen bg-stone-50 text-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-stone-900">巴菲特／蒙格投資分析系統</h1>
          <p className="text-sm text-gray-500 mt-1">
            輸入台股股票代號或公司名稱，模擬巴神與蒙格的投資思維進行評價分析
          </p>
        </header>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-8" ref={wrapperRef}>
          <div className="flex flex-col sm:flex-row gap-3 relative">
            <div className="flex-1 relative">
              <input
                type="text"
                value={stockId}
                onChange={(e) => handleStockIdChange(e.target.value)}
                onFocus={() => setActiveField('id')}
                placeholder="股票代號，例如 2330"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
              {activeField === 'id' && suggestions.length > 0 ? (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-md mt-1 max-h-56 overflow-auto">
                  {suggestions.map((s) => (
                    <li
                      key={s.stock_id}
                      onClick={() => selectSuggestion(s)}
                      className="px-3 py-2 text-sm hover:bg-amber-50 cursor-pointer"
                    >
                      {s.stock_id} － {s.stock_name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="flex-1 relative">
              <input
                type="text"
                value={companyName}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                onFocus={() => setActiveField('name')}
                placeholder="公司名稱，例如 台積電"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600"
              />
              {activeField === 'name' && suggestions.length > 0 ? (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-md mt-1 max-h-56 overflow-auto">
                  {suggestions.map((s) => (
                    <li
                      key={s.stock_id}
                      onClick={() => selectSuggestion(s)}
                      className="px-3 py-2 text-sm hover:bg-amber-50 cursor-pointer"
                    >
                      {s.stock_id} － {s.stock_name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="bg-amber-700 hover:bg-amber-800 disabled:bg-gray-300 text-white px-6 py-2 rounded-md text-sm font-medium transition-colors"
            >
              {loading ? '分析中...' : '開始分析'}
            </button>
          </div>
          {loading ? (
            <p className="text-xs text-gray-400 mt-3">
              財務分析約需數秒，供應鏈與評價生成需呼叫 AI 搜尋與推理，可能需要 20～40 秒，請耐心等候。
            </p>
          ) : null}
          {stockList.length === 0 ? (
            <p className="text-xs text-gray-400 mt-3">股票清單載入中，載入完成前可先手動輸入代號查詢。</p>
          ) : null}
        </div>

        {industry && industry.isFinancial ? (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">提醒：</span>
              此公司產業別為「{industry.category}」，屬於金融／保險業。金融業的財報科目結構與一般製造業不同，
              下方「財務分析」區塊的毛利率、營業利益率等一般產業指標會顯示為不適用；
              請參考下方「金融業專屬指標」區塊（依銀行／金控或保險子類型呈現對應指標）。
            </p>
          </div>
        ) : null}

        {industry && industry.isFinancial ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-1">
              金融業專屬指標
              {bankMetrics && bankMetrics.available
                ? `（${bankMetrics.sub_type === 'insurance' ? '保險' : '銀行／金控'}，最新一季：${bankMetrics.latest_date}）`
                : ''}
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {bankMetrics && bankMetrics.sub_type === 'insurance'
                ? '淨利率、營業利益率、保險服務結果占比、財務結果占比均以「營業收入」為分母。財務結果占比越高，代表獲利越依賴業外投資／利率環境，而非本業承保。'
                : '淨利率與ROE以「淨收益」（利息淨收益＋非利息淨收益）為分母，非一般產業的營業收入概念。'}
            </p>

            {!bankMetrics ? (
              <p className="text-sm text-gray-500">金融業指標載入中或查詢失敗。</p>
            ) : !bankMetrics.available ? (
              <p className="text-sm text-gray-500">{bankMetrics.reason}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {Object.keys(bankMetrics.metrics).map((key) => (
                  <div key={key}>
                    <p className="text-xs text-gray-500">{PEER_METRIC_LABELS[key] || key}</p>
                    <p className="text-lg font-semibold">{formatPercent(bankMetrics.metrics[key])}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {financials ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-4">財務分析（最新一季：{latestDate}）</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-xs text-gray-500">毛利率</p>
                <p className="text-lg font-semibold">{formatPercent(latest.metrics.gross_profit_margin)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">淨利率</p>
                <p className="text-lg font-semibold">{formatPercent(latest.metrics.net_profit_margin)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">年化 ROE</p>
                <p className="text-lg font-semibold">{formatPercent(latest.metrics.roe_annualized)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">自由現金流</p>
                <p className="text-lg font-semibold">{formatNumber(latest.metrics.free_cash_flow)}</p>
              </div>
            </div>

            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="py-1 pr-2">季度</th>
                  <th className="py-1 pr-2">營收</th>
                  <th className="py-1 pr-2">毛利率</th>
                  <th className="py-1 pr-2">年化ROE</th>
                  <th className="py-1 pr-2">營收年增率</th>
                </tr>
              </thead>
              <tbody>
                {recentQuarters.map((q) => {
                  const row = financials[q];
                  return (
                    <tr key={q} className="border-b border-gray-100">
                      <td className="py-1 pr-2">{q}</td>
                      <td className="py-1 pr-2">{formatNumber(row.income.Revenue)}</td>
                      <td className="py-1 pr-2">{formatPercent(row.metrics.gross_profit_margin)}</td>
                      <td className="py-1 pr-2">{formatPercent(row.metrics.roe_annualized)}</td>
                      <td className="py-1 pr-2">{formatPercent(row.metrics.revenue_yoy)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        {errors.financials ? (
          <p className="text-sm text-red-600 mb-6">財務分析錯誤：{errors.financials}</p>
        ) : null}

        {peerComparison ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-1">水平分析（同業比較）</h2>
            <p className="text-xs text-gray-400 mb-4">
              產業別：{peerComparison.industry_category || '未知'}｜{peerComparison.sample_note}
              {peerComparison.is_financial
                ? '｜此產業採金融業專屬指標比較，成本收入比與呆帳費用率為越低排名越前面。'
                : ''}
            </p>

            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="py-1 pr-2">公司</th>
                  {peerComparison.metric_keys.map((key) => (
                    <th key={key} className="py-1 pr-2">
                      {PEER_METRIC_LABELS[key] || key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(peerComparison.comparison).map((id) => {
                  const row = peerComparison.comparison[id];
                  const isTarget = id === peerComparison.target_stock_id;
                  const metrics = row.metrics;
                  const ranking = row.ranking;

                  return (
                    <tr
                      key={id}
                      className={`border-b border-gray-100 ${isTarget ? 'bg-amber-50 font-medium' : ''}`}
                    >
                      <td className="py-1 pr-2">
                        {id} {row.stock_name}
                        {isTarget ? <span className="text-amber-700 ml-1">★</span> : null}
                      </td>
                      {metrics ? (
                        peerComparison.metric_keys.map((key) => (
                          <td key={key} className="py-1 pr-2">
                            {formatPeerMetricValue(key, metrics[key])}
                            {ranking && ranking[key] ? (
                              <span className="text-gray-400 ml-1">#{ranking[key].rank}</span>
                            ) : null}
                          </td>
                        ))
                      ) : (
                        <td className="py-1 pr-2 text-gray-400" colSpan={peerComparison.metric_keys.length}>
                          {row.error || '無資料'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        {errors.peerComparison ? (
          <p className="text-sm text-red-600 mb-6">水平分析錯誤：{errors.peerComparison}</p>
        ) : null}

        {supplyChain ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-1">供應鏈</h2>
            <p className="text-xs text-gray-400 mb-4">{supplyChain._meta ? supplyChain._meta.disclaimer : ''}</p>

            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">主要供應商</h3>
                <ul className="space-y-2">
                  {(supplyChain.suppliers || []).map((s, i) => (
                    <li key={i} className="text-sm border-l-2 border-amber-600 pl-3">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-2">[{s.confidence}]</span>
                      <p className="text-xs text-gray-500">{s.relationship}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">主要客戶</h3>
                <ul className="space-y-2">
                  {(supplyChain.customers || []).map((c, i) => (
                    <li key={i} className="text-sm border-l-2 border-stone-500 pl-3">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-gray-400 ml-2">[{c.confidence}]</span>
                      <p className="text-xs text-gray-500">{c.relationship}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {supplyChain.notes ? (
              <p className="text-xs text-gray-500 mt-4 bg-stone-50 p-3 rounded">{supplyChain.notes}</p>
            ) : null}
          </section>
        ) : null}

        {errors.supplyChain ? (
          <p className="text-sm text-red-600 mb-6">供應鏈查詢錯誤：{errors.supplyChain}</p>
        ) : null}

        {valuation && valuation.available ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-1">安全邊際／簡易估值分析</h2>
            <p className="text-xs text-gray-400 mb-4">{valuation.disclaimer}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <p className="text-xs text-gray-500">現價</p>
                <p className="text-lg font-semibold">
                  {valuation.current_price ? `${valuation.current_price.price} 元` : 'N/A'}
                </p>
                <p className="text-xs text-gray-400">
                  {valuation.current_price ? valuation.current_price.date : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">近4季自由現金流</p>
                <p className="text-lg font-semibold">{formatNumber(valuation.ttm_free_cash_flow)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">歷史營收年化成長率</p>
                <p className="text-lg font-semibold">
                  {valuation.historical_revenue_cagr !== null
                    ? formatPercent(valuation.historical_revenue_cagr)
                    : '資料不足'}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {Object.keys(valuation.scenarios).map((key) => {
                const s = valuation.scenarios[key];
                const mos = s.margin_of_safety_pct;
                const mosColor =
                  mos === null || mos === undefined
                    ? 'text-gray-500'
                    : mos >= 0
                    ? 'text-green-700'
                    : 'text-red-600';

                return (
                  <div key={key} className="border border-gray-200 rounded-md p-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">{s.label}</p>
                    <p className="text-xs text-gray-500">假設成長率：{formatPercent(s.assumed_growth_rate)}</p>
                    <p className="text-xs text-gray-500">折現率：{formatPercent(s.discount_rate)}</p>
                    <p className="text-sm mt-2">
                      隱含價值：<span className="font-semibold">{s.intrinsic_value_per_share.toFixed(1)} 元</span>
                    </p>
                    <p className={`text-sm font-semibold ${mosColor}`}>
                      安全邊際：{mos !== null && mos !== undefined ? formatPercent(mos) : 'N/A'}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {valuation && !valuation.available ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">安全邊際分析暫不可用：</span>
              {valuation.reason}
            </p>
          </div>
        ) : null}

        {errors.valuation ? (
          <p className="text-sm text-red-600 mb-6">估值分析錯誤：{errors.valuation}</p>
        ) : null}

        {evaluation ? (
          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <h2 className="text-lg font-semibold mb-4">巴菲特／蒙格式評價</h2>

            <div className="mb-6">
              {Object.keys(SCORE_LABELS).map((key) => {
                const item = evaluation.scores[key];
                if (!item) return null;
                return (
                  <ScoreBar
                    key={key}
                    label={SCORE_LABELS[key]}
                    score={item.score}
                    rationale={item.rationale}
                  />
                );
              })}
            </div>

            <div className="bg-stone-50 rounded-md p-5 mb-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">總評</h3>
              <p className="text-sm leading-relaxed whitespace-pre-line text-gray-800">
                {evaluation.narrative}
              </p>
            </div>

            {evaluation.caveats ? (
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">限制與但書</h3>
                <ul className="text-xs text-gray-500 list-disc pl-5 space-y-1">
                  {(Array.isArray(evaluation.caveats) ? evaluation.caveats : [evaluation.caveats]).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {errors.evaluation ? (
          <p className="text-sm text-red-600 mb-6">評價生成錯誤：{errors.evaluation}</p>
        ) : null}
      </div>
    </main>
  );
}
