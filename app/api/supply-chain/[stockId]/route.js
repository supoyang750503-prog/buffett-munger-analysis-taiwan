import { NextResponse } from 'next/server';
const { getSupplyChain } = require('@/lib/supplyChain');

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
