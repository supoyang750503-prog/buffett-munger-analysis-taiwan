import { NextResponse } from 'next/server';
const { generateEvaluation } = require('@/lib/evaluation');

export const maxDuration = 300; // Vercel Hobby 方案(Fluid Compute)最高可設300秒，評價生成含多次外部API呼叫，拉長時間上限避免逾時

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
