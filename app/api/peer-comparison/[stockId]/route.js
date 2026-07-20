import { NextResponse } from 'next/server';
const { getPeerComparison } = require('@/lib/peerComparison');

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
