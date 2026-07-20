import { NextResponse } from 'next/server';
const { getFinancialIndustryMetrics } = require('@/lib/financialIndustryMetrics');

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
