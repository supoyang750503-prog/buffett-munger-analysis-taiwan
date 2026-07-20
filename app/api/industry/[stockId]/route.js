import { NextResponse } from 'next/server';
const { checkIndustry } = require('@/lib/industryCheck');

export async function GET(request, { params }) {
  try {
    const { stockId } = await params;
    const data = await checkIndustry(stockId);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
