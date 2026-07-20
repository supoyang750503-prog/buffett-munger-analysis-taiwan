import { NextResponse } from 'next/server';
const { getValuation } = require('@/lib/valuation');

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
