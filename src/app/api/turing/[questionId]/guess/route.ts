import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api-security';
import TuringGameModel from '@/models/TuringGame';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const { questionId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const ip = getClientIp(request);
    const limiter = checkRateLimit(`turing:guess:${session.user.id}:${ip}`, 30, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    const { messageId, guess } = await request.json();
    if (!messageId || !['human', 'ai'].includes(guess)) {
      return new Response(JSON.stringify({ error: 'Invalid messageId or guess' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    await connectDB();

    const game = await TuringGameModel.findOne({ questionId });
    if (!game) {
      return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (game.status !== 'active') {
      return new Response(JSON.stringify({ error: '盲猜已结束' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (new Date(game.revealAt) <= new Date()) {
      return new Response(JSON.stringify({ error: '盲猜已过期' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const entryIndex = game.entries.findIndex(e => e.messageId === messageId);
    if (entryIndex === -1) {
      return new Response(JSON.stringify({ error: 'Entry not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const entry = game.entries[entryIndex];
    const existingGuessIndex = entry.guesses.findIndex(g => g.voterId === session.user.id);

    if (existingGuessIndex >= 0) {
      // Update existing guess
      entry.guesses[existingGuessIndex].guess = guess;
      entry.guesses[existingGuessIndex].votedAt = new Date();
    } else {
      // New guess
      entry.guesses.push({
        guess,
        voterId: session.user.id,
        voterType: 'human',
        votedAt: new Date(),
      });
    }

    // Recalculate total voters
    const allVoterIds = new Set<string>();
    game.entries.forEach(e => e.guesses.forEach(g => allVoterIds.add(g.voterId)));
    game.totalVoters = allVoterIds.size;

    await game.save();

    return new Response(JSON.stringify({
      success: true,
      updated: {
        messageId,
        myGuess: guess,
        voteCount: entry.guesses.length,
      },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Turing guess error:', error);
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
