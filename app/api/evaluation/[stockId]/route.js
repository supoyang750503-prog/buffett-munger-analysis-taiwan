import { NextResponse } from 'next/server';
const { generateEvaluation } = require('@/lib/evaluation');

export const maxDuration = 60; // Vercel Hobby 方案預設10秒逾時，這裡明確拉長到60秒

export async function POST(request, { params }) {
  try {
    const { stockId } = await params;
    const body = await request.json();
    const companyName = body.companyName || stockId;
    const analysisData = body.analysisData || null;
    const valuationData = body.valuationData || null;

    const data = await generateEvaluation(stockId, companyName, analysisData, valuationData);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
