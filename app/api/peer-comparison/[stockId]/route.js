import { NextResponse } from 'next/server';
const { getPeerComparison } = require('@/lib/peerComparison');

export const maxDuration = 60; // Vercel Hobby 方案預設10秒逾時，這裡明確拉長到60秒

export async function GET(request, { params }) {
  try {
    const { stockId } = await params;
    const { searchParams } = new URL(request.url);
    const maxPeersParam = searchParams.get('maxPeers');
    const maxPeers = maxPeersParam ? parseInt(maxPeersParam, 10) : undefined;

    const data = await getPeerComparison(stockId, maxPeers);
    return NextResponse.json(data);
  } catch (err) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
