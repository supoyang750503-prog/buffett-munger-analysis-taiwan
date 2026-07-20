import { NextResponse } from 'next/server';
const { getStockList } = require('@/lib/stockList');

export async function GET() {
  try {
    const list = await getStockList();
    return NextResponse.json({ stocks: list });
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
