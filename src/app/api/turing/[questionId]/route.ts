import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { connectDB } from '@/lib/mongodb';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/api-security';
import TuringGameModel from '@/models/TuringGame';
import MessageModel from '@/models/Message';
import { generateId } from '@/lib/id';

const TURING_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_MESSAGES = 3;

// Auto-create Turing game for a question if eligible
async function ensureTuringGame(questionId: string): Promise<{ game: ReturnType<typeof formatGame> | null; error?: string }> {
  const existing = await TuringGameModel.findOne({ questionId }).lean();
  if (existing) return { game: formatGame(existing) };

  const messages = await MessageModel.find({ questionId }).lean();
  const aiCount = messages.filter(m => m.authorType === 'ai').length;
  const userCount = messages.filter(m => m.authorType === 'user').length;

  if (messages.length < MIN_MESSAGES || aiCount < 1 || userCount < 1) {
    return { game: null, error: `需要至少${MIN_MESSAGES}条回答（含AI和用户回答）才能开启盲猜` };
  }

  // Create game
  const entries = messages.map((m, i) => ({
    messageId: m.id,
    actualType: m.authorType as 'ai' | 'user',
    anonymousLabel: `神秘答主 #${i + 1}`,
    contentPreview: m.content.slice(0, 300),
    guesses: [],
  }));

  const gameDoc = await TuringGameModel.create({
    id: generateId('tg'),
    questionId,
    entries,
    status: 'active' as const,
    startedAt: new Date(),
    revealAt: new Date(Date.now() + TURING_DURATION_MS),
    totalVoters: 0,
  });

  return { game: formatGame(JSON.parse(JSON.stringify(gameDoc))) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatGame(game: any, userId?: string) {
  const isActive = game.status === 'active';

  // Check if should auto-reveal
  if (isActive && new Date(game.revealAt) <= new Date()) {
    // Auto-reveal on next access (lazy reveal)
    return { ...formatRevealedGame(game), autoRevealed: true };
  }

  const entries = game.entries.map((entry: { messageId: string; anonymousLabel: string; contentPreview: string; actualType: string; guesses: { voterId: string; guess: string }[]; stats?: { totalVotes: number; correctVotes: number; accuracy: number } }) => {
    const base = {
      messageId: entry.messageId,
      anonymousLabel: entry.anonymousLabel,
      contentPreview: entry.contentPreview,
      voteCount: entry.guesses.length,
      myGuess: userId ? entry.guesses.find((g: { voterId: string }) => g.voterId === userId)?.guess || null : null,
    };

    if (isActive) return base;

    // Revealed
    return {
      ...base,
      actualType: entry.actualType,
      stats: entry.stats,
    };
  });

  return {
    id: game.id,
    questionId: game.questionId,
    status: game.status,
    startedAt: game.startedAt,
    revealAt: game.revealAt,
    revealedAt: game.revealedAt,
    entries,
    awards: isActive ? undefined : game.awards,
    totalVoters: game.totalVoters,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatRevealedGame(game: any) {
  // Calculate stats and awards
  const entries = game.entries.map((entry: { messageId: string; anonymousLabel: string; contentPreview: string; actualType: string; guesses: { voterId: string; guess: string; voterType: string }[] }) => {
    const correct = entry.actualType === 'ai'
      ? entry.guesses.filter((g: { guess: string }) => g.guess === 'ai').length
      : entry.guesses.filter((g: { guess: string }) => g.guess === 'human').length;

    return {
      ...entry,
      stats: {
        totalVotes: entry.guesses.length,
        correctVotes: correct,
        accuracy: entry.guesses.length > 0 ? correct / entry.guesses.length : 0,
      },
    };
  });

  // Awards
  const awards = [];

  // Most human AI: AI entry with lowest accuracy (most people guessed wrong)
  const aiEntries = entries.filter((e: { actualType: string; stats: { totalVotes: number } }) => e.actualType === 'ai' && e.stats.totalVotes > 0);
  if (aiEntries.length > 0) {
    const mostHuman = aiEntries.reduce((a: { stats: { accuracy: number } }, b: { stats: { accuracy: number } }) => a.stats.accuracy < b.stats.accuracy ? a : b);
    awards.push({
      type: 'most_human_ai',
      entryMessageId: mostHuman.messageId,
      displayName: mostHuman.anonymousLabel,
      stat: 1 - mostHuman.stats.accuracy,
    });
  }

  // Most AI human: user entry with lowest accuracy
  const userEntries = entries.filter((e: { actualType: string; stats: { totalVotes: number } }) => e.actualType === 'user' && e.stats.totalVotes > 0);
  if (userEntries.length > 0) {
    const mostAI = userEntries.reduce((a: { stats: { accuracy: number } }, b: { stats: { accuracy: number } }) => a.stats.accuracy < b.stats.accuracy ? a : b);
    awards.push({
      type: 'most_ai_human',
      entryMessageId: mostAI.messageId,
      displayName: mostAI.anonymousLabel,
      stat: 1 - mostAI.stats.accuracy,
    });
  }

  // Best detective: voter with highest accuracy
  const voterAccuracy = new Map<string, { correct: number; total: number; name: string }>();
  for (const entry of entries) {
    for (const guess of entry.guesses) {
      const isCorrect = (entry.actualType === 'ai' && guess.guess === 'ai') || (entry.actualType === 'user' && guess.guess === 'human');
      const v = voterAccuracy.get(guess.voterId) || { correct: 0, total: 0, name: guess.voterId };
      v.total++;
      if (isCorrect) v.correct++;
      voterAccuracy.set(guess.voterId, v);
    }
  }

  let bestDetective: { id: string; accuracy: number; name: string } | null = null;
  voterAccuracy.forEach((v, id) => {
    const acc = v.total > 0 ? v.correct / v.total : 0;
    if (!bestDetective || acc > bestDetective.accuracy) {
      bestDetective = { id, accuracy: acc, name: v.name };
    }
  });

  if (bestDetective) {
    awards.push({
      type: 'best_detective',
      userId: (bestDetective as { id: string }).id,
      displayName: (bestDetective as { name: string }).name,
      stat: (bestDetective as { accuracy: number }).accuracy,
    });
  }

  return {
    id: game.id,
    questionId: game.questionId,
    status: 'revealed',
    startedAt: game.startedAt,
    revealAt: game.revealAt,
    revealedAt: new Date(),
    entries,
    awards,
    totalVoters: voterAccuracy.size,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const { questionId } = await params;
    const ip = getClientIp(request);
    const limiter = checkRateLimit(`turing:get:${ip}`, 30, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    await connectDB();

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    const result = await ensureTuringGame(questionId);

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error, game: null }), { headers: { 'Content-Type': 'application/json' } });
    }

    // If auto-revealed, persist
    if (result.game && 'autoRevealed' in result.game) {
      await TuringGameModel.findOneAndUpdate(
        { questionId, status: 'active' },
        {
          status: 'revealed',
          revealedAt: new Date(),
          entries: result.game.entries,
          awards: result.game.awards,
          totalVoters: result.game.totalVoters,
        }
      );
    }

    // Re-format with user context
    const game = await TuringGameModel.findOne({ questionId }).lean();
    if (!game) {
      return new Response(JSON.stringify({ game: null }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ game: formatGame(game, userId || undefined) }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Turing GET error:', error);
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
