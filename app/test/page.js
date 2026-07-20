'use client';
import { useState } from 'react';

export default function TestPage() {
  const [stockId, setStockId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/financials/${stockId}`);
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>財務分析 API 測試</h1>
      <input 
        value={stockId} 
        onChange={(e) => setStockId(e.target.value)} 
        placeholder="輸入股票代號 (例如 2330)"
        style={{ marginRight: '10px', color: 'black' }}
      />
      <button onClick={handleFetch} disabled={loading}>
        {loading ? '載入中...' : '查詢'}
      </button>
      <div style={{ marginTop: '20px' }}>
        <pre style={{ backgroundColor: '#f0f0f0', color: 'black', padding: '10px', overflow: 'auto' }}>
          {result ? JSON.stringify(result, null, 2) : '請輸入代號並按下查詢'}
        </pre>
      </div>
    </div>
  );
}
