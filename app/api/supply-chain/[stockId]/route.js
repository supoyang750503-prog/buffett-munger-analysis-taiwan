import { NextResponse } from 'next/server';
const { getSupplyChain } = require('@/lib/supplyChain');

export const maxDuration = 60; // Vercel Hobby 方案預設10秒逾時，這裡明確拉長到60秒

export async function GET(request, { params }) {
  try {
    const { stockId } = await params;
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('name') || stockId;

    const data = await getSupplyChain(stockId, companyName);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
