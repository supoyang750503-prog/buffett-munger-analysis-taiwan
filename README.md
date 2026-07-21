# 巴菲特／蒙格投資分析系統

用 AI 模擬華倫·巴菲特與查理·蒙格的投資思維，對台股上市公司進行多維度分析與評價的網頁工具。

🔗 **線上展示**：[buffett-munger-analysis-taiwan.vercel.app](https://buffett-munger-analysis-taiwan.vercel.app)

---

## 這是什麼

輸入任何一支台股股票代號或公司名稱，系統會自動完成：

1. **垂直分析** — 抓取近 5～7 年財報，計算毛利率、營業利益率、淨利率、年化 ROE、自由現金流等指標的歷史趨勢
2. **水平分析** — 抽樣同產業公司做橫向比較與排名（含金控／銀行／保險三種金融子類型的專屬指標框架）
3. **供應鏈分析** — 用 AI 搜尋公開資訊，整理出主要上游供應商與下游客戶
4. **安全邊際／簡易估值** — 用簡化版 DCF 模型，依保守／中性／樂觀三組情境估算隱含價值，與現價比較
5. **巴菲特／蒙格式評價** — 從 1977～2025 年全部 Berkshire Hathaway 股東信（約 3,760 個語意段落）中檢索相關投資原則，結合上述財務數據，生成六項結構化評分（護城河、資本配置、管理層品格、能力圈、ROE穩定性、安全邊際）與一段模擬巴菲特股東信風格的散文總評

## 使用方式

打開[線上展示網址](https://buffett-munger-analysis-taiwan.vercel.app)，在輸入框打股票代號（例如 `2330`）或公司名稱（例如「台積電」），另一個欄位會自動帶出對應內容，也可以從下拉建議清單直接點選。按下「開始分析」，財務分析約數秒完成，供應鏈與評價生成因為要呼叫 AI 搜尋與推理，可能需要 20～40 秒。

## 技術架構

| 項目 | 使用技術 |
|---|---|
| 前端／後端 | Next.js（App Router）+ Tailwind CSS |
| 部署 | Vercel |
| 台股財報資料 | [FinMind API](https://finmindtrade.com) |
| AI 生成與檢索 | Google Gemini API（`gemini-2.5-flash` 生成、`gemini-embedding-001` 向量化、Google Search grounding 查供應鏈） |
| 向量資料庫 | Pinecone |
| 語料庫 | Berkshire Hathaway 歷年股東信全文（1977～2025） |

## 已知限制

這個工具誠實揭露目前尚未涵蓋的部分，而不是假裝完整：

- **僅支援台股**，不含美股或其他市場
- **金融業僅支援金控／銀行／保險三種子類型**，票券金融公司等其他子類型尚未支援
- **供應鏈分析僅列出關係**，未做量化依賴度或多層供應鏈追蹤
- **水平分析為抽樣比較**（同產業前幾家，依股票代號排序），非完整同業清單，亦未依市值排序
- **估值模型為簡化版**，股數以近4季淨利／EPS反推估算，未考慮債務結構、業外損益、產業週期等因素
- 所有 AI 生成內容（供應鏈、評價）僅供研究與教育參考，**不構成投資建議**

## 本地開發

```bash
git clone <this-repo-url>
cd web
npm install
```

在 `web/` 底下建立 `.env.local`，填入三組 API Key：

```
FINMIND_TOKEN=你的FinMind Token
GEMINI_API_KEY=你的Gemini API Key
PINECONE_API_KEY=你的Pinecone API Key
```

（RAG 語料庫需另外建置 Pinecone index 並執行語料匯入腳本，不包含在這個 repo 內）

```bash
npm run dev
```

打開 `http://localhost:3000`。

## 免責聲明

本工具由 AI 綜合公開資訊自動生成分析內容，可能有遺漏、過時或誤判之處，僅供研究與教育用途，不構成任何投資建議，使用者應自行查證並承擔投資決策風險。
