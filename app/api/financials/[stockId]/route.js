import { NextResponse } from 'next/server';
const { analyzeStock } = require('@/lib/financialAnalysis');

export async function GET(request, { params }) {
  try {
    const { stockId } = await params;
    const startDate = '2019-01-01'; // 預設開始日期
    const data = await analyzeStock(stockId, startDate);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
