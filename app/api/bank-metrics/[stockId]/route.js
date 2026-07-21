import { NextResponse } from 'next/server';
const { getFinancialIndustryMetrics } = require('@/lib/financialIndustryMetrics');

export const maxDuration = 60; // Vercel Hobby 方案預設10秒逾時，這裡明確拉長到60秒

export async function GET(request, { params }) {
  try {
    const { stockId } = await params;
    const data = await getFinancialIndustryMetrics(stockId);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
