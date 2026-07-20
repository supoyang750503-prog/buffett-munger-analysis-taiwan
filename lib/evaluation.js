const axios = require('axios');
const { Pinecone } = require('@pinecone-database/pinecone');
const { analyzeStock } = require('@/lib/financialAnalysis');
const { getSupplyChain } = require('@/lib/supplyChain');

const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
const OUTPUT_DIMENSIONALITY = 768;
const PINECONE_INDEX_NAME = 'buffett-munger-corpus';
const RAG_TOP_K = 3;

const GENERATION_MODEL = 'gemini-2.5-flash';
const GENERATION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent`;

const QUALITATIVE_DIMENSIONS = [
  { key: 'moat', label: '護城河強度', query: 'durable competitive advantage moat pricing power brand' },
  { key: 'capital_allocation', label: '資本配置紀律', query: 'capital allocation return on capital reinvestment discipline' },
  { key: 'management_integrity', label: '管理層品格', query: 'management integrity trustworthy honest shareholder-oriented leadership' },
  { key: 'business_understandability', label: '能力圈／業務可理解度', query: 'simple understandable predictable business circle of competence' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedText(text, apiKey) {
  const maxRetries = 2;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        EMBEDDING_URL,
        { content: { parts: [{ text }] }, output_dimensionality: OUTPUT_DIMENSIONALITY },
        { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } }
      );
      return response.data.embedding.values;
    } catch (err) {
      lastErr = err;
      const status = err.response ? err.response.status : null;
      const isRetryable = status === 503 || status === 429 || status === 500;
      if (isRetryable && attempt < maxRetries) {
        await sleep(1500 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

async function ragSearch(query, apiKey, index) {
  const vector = await embedText(query, apiKey);
  const result = await index.query({ vector, topK: RAG_TOP_K, includeMetadata: true });
  return result.matches.map((m) => ({
    year: m.metadata ? m.metadata.year : null,
    score: m.score,
    text: m.metadata ? m.metadata.text || '' : '',
  }));
}

function getLatestDate(obj) {
  const dates = Object.keys(obj).sort();
  return dates[dates.length - 1];
}

function computeRoeStability(analysisData) {
  const dates = Object.keys(analysisData).sort();
  const recentDates = dates.slice(-8);

  const roeValues = recentDates
    .map((d) => analysisData[d] && analysisData[d].metrics && analysisData[d].metrics.roe_annualized)
    .filter((v) => v !== null && v !== undefined);

  if (roeValues.length === 0) {
    return { score: null, note: '缺少足夠的 ROE 歷史資料，無法評估穩定性' };
  }

  const mean = roeValues.reduce((a, b) => a + b, 0) / roeValues.length;
  const variance = roeValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / roeValues.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean !== 0 ? stdDev / Math.abs(mean) : null;

  let score = 5;
  if (mean > 0.2) score += 2;
  else if (mean > 0.1) score += 1;
  else if (mean < 0) score -= 3;

  if (coefficientOfVariation !== null) {
    if (coefficientOfVariation < 0.15) score += 2;
    else if (coefficientOfVariation < 0.3) score += 1;
    else if (coefficientOfVariation > 0.6) score -= 2;
  }

  score = Math.max(1, Math.min(10, Math.round(score)));

  const meanPct = (mean * 100).toFixed(1);
  const cvText = coefficientOfVariation !== null ? coefficientOfVariation.toFixed(2) : 'N/A';

  return {
    score,
    mean_roe_annualized: mean,
    std_dev: stdDev,
    coefficient_of_variation: coefficientOfVariation,
    quarters_used: roeValues.length,
    note: `根據最近 ${roeValues.length} 季年化ROE計算，平均 ${meanPct}%，波動係數 ${cvText}`,
  };
}

function buildEvaluationPrompt(input) {
  const companyName = input.companyName;
  const stockId = input.stockId;
  const latestMetrics = input.latestMetrics;
  const supplyChain = input.supplyChain;
  const roeStability = input.roeStability;
  const ragContext = input.ragContext;

  const ragSection = ragContext
    .map((d) => {
      const passageLines = d.passages.map((p, i) => {
        const idx = i + 1;
        const year = p.year;
        const score = p.score.toFixed(2);
        const snippet = p.text.slice(0, 500);
        return `  ${idx}. (${year}年信件, 相似度${score}) ${snippet}`;
      });
      return `【${d.label}】相關的巴菲特/蒙格股東信原文段落：\n` + passageLines.join('\n');
    })
    .join('\n\n');

  const supplyChainSummary = supplyChain
    ? JSON.stringify({ suppliers: supplyChain.suppliers, customers: supplyChain.customers, notes: supplyChain.notes }, null, 2)
    : '無供應鏈資料';

  const lines = [];
  lines.push(`你是一位深入研究巴菲特與查理蒙格投資哲學的分析助理。請根據以下資料，`);
  lines.push(`用巴菲特與蒙格的投資原則，對「${companyName}（股票代號 ${stockId}）」進行評價分析。`);
  lines.push('');
  lines.push('===== 最新一季財務指標 =====');
  lines.push(JSON.stringify(latestMetrics, null, 2));
  lines.push('');
  lines.push('===== 供應鏈資訊（如有） =====');
  lines.push(supplyChainSummary);
  lines.push('');
  lines.push('===== ROE穩定性量化評分（已由程式計算，不需要你重新評分這項） =====');
  lines.push(JSON.stringify(roeStability, null, 2));
  lines.push('');
  lines.push('===== 巴菲特/蒙格原則參考段落（RAG檢索結果） =====');
  lines.push(ragSection);
  lines.push('');
  lines.push('請只輸出一個 JSON 物件，不要加上任何說明文字、不要用 markdown 的三個反引號包起來，格式如下：');
  lines.push('');
  lines.push('{');
  lines.push('  "scores": {');
  lines.push('    "moat": { "score": 1-10之間的整數, "rationale": "50字以內的中文說明，需引用上面提供的原文段落佐證" },');
  lines.push('    "capital_allocation": { "score": 1-10之間的整數, "rationale": "..." },');
  lines.push('    "management_integrity": { "score": 1-10之間的整數, "rationale": "...，並誠實說明這項評分主要基於財務數字側面推論，非直接管理層品格證據" },');
  lines.push('    "business_understandability": { "score": 1-10之間的整數, "rationale": "..." }');
  lines.push('  },');
  lines.push('  "narrative": "一段約400-600字、模擬巴菲特股東信散文風格的中文總評，需自然融入護城河、資本配置、管理層、能力圈這幾個面向的討論，語氣平實、重視長期思維，避免浮誇詞藻，可以適度使用巴菲特式的比喻或幽默",');
  lines.push('  "caveats": ["誠實列出這份評價的限制"]');
  lines.push('}');

  return lines.join('\n');
}

async function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt, apiKey) {
  const maxRetries = 3;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        GENERATION_URL,
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } }
      );

      const candidate = response.data.candidates && response.data.candidates[0];
      const parts = (candidate && candidate.content && candidate.content.parts) || [];
      const rawText = parts.map((p) => p.text || '').join('');
      const cleaned = rawText.replace(/```json|```/g, '').trim();

      try {
        return JSON.parse(cleaned);
      } catch (parseErr) {
        throw new Error('無法解析 Gemini 回傳的 JSON');
      }
    } catch (err) {
      lastErr = err;
      const status = err.response ? err.response.status : null;
      const isRetryable = status === 503 || status === 429 || status === 500;

      if (isRetryable && attempt < maxRetries) {
        const waitMs = 2000 * Math.pow(2, attempt);
        await sleepMs(waitMs);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

function computeMarginOfSafetyScore(valuation) {
  if (!valuation || !valuation.available) {
    return {
      score: null,
      rationale: valuation && valuation.reason
        ? `資料不足：${valuation.reason}`
        : '資料不足，需搭配估值分析才能評估',
    };
  }

  const base = valuation.scenarios.base;
  const pct = base.margin_of_safety_pct;

  if (pct === null || pct === undefined) {
    return { score: null, rationale: '缺少現價資料，無法計算安全邊際百分比', valuation };
  }

  let score;
  if (pct >= 0.3) score = 9;
  else if (pct >= 0.15) score = 7;
  else if (pct >= 0) score = 5;
  else if (pct >= -0.15) score = 3;
  else score = 1;

  const pctText = (pct * 100).toFixed(1);
  const rationale = `依簡易DCF中性情境估算，隱含價值約每股 ${base.intrinsic_value_per_share.toFixed(1)} 元，` +
    `現價相對隱含價值的安全邊際約 ${pctText}%（正值代表現價低於估算的內在價值）`;

  return { score, rationale, valuation };
}

async function generateEvaluation(stockId, companyName, providedAnalysisData, providedValuation) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const pineconeKey = process.env.PINECONE_API_KEY;

  if (!geminiKey) throw new Error('找不到 GEMINI_API_KEY，請檢查 .env.local');
  if (!pineconeKey) throw new Error('找不到 PINECONE_API_KEY，請檢查 .env.local');

  const analysisData = providedAnalysisData || (await analyzeStock(stockId, '2019-01-01'));
  const latestDate = getLatestDate(analysisData);
  const latestMetrics = analysisData[latestDate];

  let supplyChain = null;
  try {
    supplyChain = await getSupplyChain(stockId, companyName);
  } catch (err) {
    supplyChain = null;
  }

  const roeStability = computeRoeStability(analysisData);

  const pc = new Pinecone({ apiKey: pineconeKey });
  const index = pc.index(PINECONE_INDEX_NAME);

  const ragContext = [];
  for (const dim of QUALITATIVE_DIMENSIONS) {
    const passages = await ragSearch(dim.query, geminiKey, index);
    ragContext.push({ key: dim.key, label: dim.label, passages });
    await sleep(300);
  }

  const prompt = buildEvaluationPrompt({
    companyName,
    stockId,
    latestMetrics,
    supplyChain,
    roeStability,
    ragContext,
  });

  const evaluation = await callGemini(prompt, geminiKey);

  return {
    company: companyName,
    stock_id: stockId,
    evaluation_date: latestDate,
    scores: {
      moat: evaluation.scores.moat,
      capital_allocation: evaluation.scores.capital_allocation,
      management_integrity: evaluation.scores.management_integrity,
      business_understandability: evaluation.scores.business_understandability,
      roe_stability: {
        score: roeStability.score,
        rationale: roeStability.note,
        details: roeStability,
      },
      margin_of_safety: computeMarginOfSafetyScore(providedValuation),
    },
    narrative: evaluation.narrative,
    caveats: evaluation.caveats,
    _meta: {
      generated_at: new Date().toISOString(),
      rag_context_used: ragContext.map((d) => ({
        dimension: d.label,
        sources: d.passages.map((p) => ({ year: p.year, score: p.score })),
      })),
    },
  };
}

module.exports = { generateEvaluation };
