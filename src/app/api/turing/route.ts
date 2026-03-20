import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import TuringGameModel from '@/models/TuringGame';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api-security';

// GET /api/turing — list all turing games (for sorting the turing page)
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const limiter = checkRateLimit(`turing:list:${ip}`, 30, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    await connectDB();

    const games = await TuringGameModel.find({})
      .sort({ status: 1, createdAt: -1 })
      .select('questionId status totalVoters startedAt revealAt')
      .lean();

    return new Response(JSON.stringify({ games }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error('Turing list error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch turing games' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
