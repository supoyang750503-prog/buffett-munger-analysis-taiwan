import { NextResponse } from 'next/server';
const { getValuation } = require('@/lib/valuation');

export const maxDuration = 60; // Vercel Hobby 方案預設10秒逾時，這裡明確拉長到60秒

export async function POST(request, { params }) {
  try {
    const { stockId } = await params;
    const body = await request.json();
    const analysisData = body.analysisData || null;

    const data = await getValuation(stockId, analysisData);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
