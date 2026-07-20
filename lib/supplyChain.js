const axios = require('axios');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function buildPrompt(stockId, companyName) {
  const lines = [];
  lines.push(`你是一位產業研究助理。請根據公開可查的資訊（新聞報導、公司法說會內容、產業報告等），`);
  lines.push(`整理出「${companyName}（股票代號 ${stockId}）」目前主要的上游供應商與下游客戶。`);
  lines.push('');
  lines.push('請只輸出一個 JSON 物件，不要加上任何說明文字、不要用 markdown 的三個反引號包起來，格式如下：');
  lines.push('');
  lines.push('{');
  lines.push(`  "company": "${companyName}",`);
  lines.push(`  "stock_id": "${stockId}",`);
  lines.push('  "suppliers": [');
  lines.push('    { "name": "供應商名稱", "relationship": "供應的產品或服務簡述", "confidence": "high|medium|low" }');
  lines.push('  ],');
  lines.push('  "customers": [');
  lines.push('    { "name": "客戶名稱", "relationship": "採購的產品或服務簡述", "confidence": "high|medium|low" }');
  lines.push('  ],');
  lines.push('  "notes": "任何重要的但書或不確定性說明"');
  lines.push('}');
  lines.push('');
  lines.push('規則：');
  lines.push('- confidence 請誠實標註：財報或法說會明確提到的標 high，新聞推測的標 medium，僅產業常識推論的標 low。');
  lines.push('- 每個陣列最多列出 8 筆，優先列出關係最明確、最重要的。');
  lines.push('- 如果找不到足夠的公開資訊，陣列可以留空，並在 notes 說明原因，不要編造。');

  return lines.join('\n');
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiWithRetry(payload, apiKey) {
  const maxRetries = 3;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios.post(GEMINI_URL, payload, {
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      });
    } catch (err) {
      lastErr = err;
      const status = err.response ? err.response.status : null;
      const isRetryable = status === 503 || status === 429 || status === 500;
      if (isRetryable && attempt < maxRetries) {
        await sleepMs(2000 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

async function getSupplyChain(stockId, companyName) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('找不到 GEMINI_API_KEY，請檢查 .env.local');
  }

  const response = await callGeminiWithRetry(
    {
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(stockId, companyName) }],
        },
      ],
      tools: [{ google_search: {} }],
    },
    apiKey
  );

  const candidate = response.data.candidates && response.data.candidates[0];
  if (!candidate) {
    throw new Error('Gemini API 沒有回傳任何內容');
  }

  const parts = (candidate.content && candidate.content.parts) || [];
  const rawText = parts.map((p) => p.text || '').join('');
  const cleaned = rawText.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Gemini 回傳的內容無法解析成 JSON');
  }

  const groundingMetadata = candidate.groundingMetadata || {};
  const groundingChunks = groundingMetadata.groundingChunks || [];
  const sources = groundingChunks
    .map((chunk) => chunk.web && { title: chunk.web.title, url: chunk.web.uri })
    .filter(Boolean);
  const searchQueries = groundingMetadata.webSearchQueries || [];

  return Object.assign({}, parsed, {
    _meta: {
      disclaimer: '本資料由 AI 綜合公開資訊整理產生，非官方申報資料，可能有遺漏或錯誤，僅供研究參考。',
      search_queries: searchQueries,
      sources: sources,
      generated_at: new Date().toISOString(),
    },
  });
}

module.exports = { getSupplyChain };
