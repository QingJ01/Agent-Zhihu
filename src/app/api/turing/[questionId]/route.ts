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
const AGENT_VOTE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AGENT_VOTE_MIN = 10;
const AGENT_VOTE_MAX = 100;

// Check if a question is eligible for a turing game
async function checkEligibility(questionId: string): Promise<{ eligible: boolean; messageCount: number }> {
  const messages = await MessageModel.find({ questionId }).lean();
  return { eligible: messages.length >= MIN_MESSAGES, messageCount: messages.length };
}

// Create a new turing game
async function createTuringGame(questionId: string) {
  const existing = await TuringGameModel.findOne({ questionId }).lean();
  if (existing) return { game: existing, created: false };

  const messages = await MessageModel.find({ questionId }).lean();
  if (messages.length < MIN_MESSAGES) {
    return { game: null, error: `需要至少 ${MIN_MESSAGES} 条回答才能开启盲猜` };
  }

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

  return { game: JSON.parse(JSON.stringify(gameDoc)), created: true };
}

// Schedule simulated votes over 10 minutes (non-blocking)
function scheduleSimulatedVotes(questionId: string, entryMessageIds: string[], entryActualTypes: string[]) {
  const totalVoters = Math.floor(Math.random() * (AGENT_VOTE_MAX - AGENT_VOTE_MIN + 1)) + AGENT_VOTE_MIN;

  for (let i = 0; i < totalVoters; i++) {
    const delay = Math.floor(Math.random() * AGENT_VOTE_WINDOW_MS);
    const voterId = generateId('u'); // looks like a normal user id

    setTimeout(async () => {
      try {
        await connectDB();
        const game = await TuringGameModel.findOne({ questionId, status: 'active' });
        if (!game) return;

        // Each voter guesses on 50%-100% of entries
        const entriesToVote = entryMessageIds.filter(() => Math.random() > 0.3);
        if (entriesToVote.length === 0) entriesToVote.push(entryMessageIds[0]);

        for (const messageId of entriesToVote) {
          const entryIdx = entryMessageIds.indexOf(messageId);
          const actualType = entryActualTypes[entryIdx];

          // 50%-70% accuracy to simulate realistic human guessing
          const isCorrect = Math.random() < (0.5 + Math.random() * 0.2);
          let guess: string;
          if (actualType === 'ai') {
            guess = isCorrect ? 'ai' : 'human';
          } else {
            guess = isCorrect ? 'human' : 'ai';
          }

          await TuringGameModel.updateOne(
            { questionId, 'entries.messageId': messageId },
            {
              $push: {
                'entries.$.guesses': {
                  guess,
                  voterId,
                  voterType: 'human', // disguised as human
                  votedAt: new Date(),
                },
              },
            }
          );
        }

        // Update totalVoters count
        const updated = await TuringGameModel.findOne({ questionId }).lean();
        if (updated) {
          const allVoterIds = new Set<string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const entry of (updated as any).entries) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const g of entry.guesses) allVoterIds.add(g.voterId);
          }
          await TuringGameModel.updateOne({ questionId }, { totalVoters: allVoterIds.size });
        }
      } catch (err) {
        console.error('Simulated vote error:', err);
      }
    }, delay);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatGame(game: any, userId?: string) {
  const isActive = game.status === 'active';

  if (isActive && new Date(game.revealAt) <= new Date()) {
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

  const awards = [];

  const aiEntries = entries.filter((e: { actualType: string; stats: { totalVotes: number } }) => e.actualType === 'ai' && e.stats.totalVotes > 0);
  if (aiEntries.length > 0) {
    const mostHuman = aiEntries.reduce((a: { stats: { accuracy: number } }, b: { stats: { accuracy: number } }) => a.stats.accuracy < b.stats.accuracy ? a : b);
    awards.push({ type: 'most_human_ai', entryMessageId: mostHuman.messageId, displayName: mostHuman.anonymousLabel, stat: 1 - mostHuman.stats.accuracy });
  }

  const userEntries = entries.filter((e: { actualType: string; stats: { totalVotes: number } }) => e.actualType === 'user' && e.stats.totalVotes > 0);
  if (userEntries.length > 0) {
    const mostAI = userEntries.reduce((a: { stats: { accuracy: number } }, b: { stats: { accuracy: number } }) => a.stats.accuracy < b.stats.accuracy ? a : b);
    awards.push({ type: 'most_ai_human', entryMessageId: mostAI.messageId, displayName: mostAI.anonymousLabel, stat: 1 - mostAI.stats.accuracy });
  }

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

// GET: fetch game status, or return canStart if no game
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

    const existing = await TuringGameModel.findOne({ questionId }).lean();

    if (!existing) {
      // No game yet — check eligibility
      const { eligible, messageCount } = await checkEligibility(questionId);
      return Response.json({ game: null, canStart: eligible, messageCount });
    }

    // Auto-reveal if expired
    const formatted = formatGame(existing, userId || undefined);
    if ('autoRevealed' in formatted) {
      await TuringGameModel.findOneAndUpdate(
        { questionId, status: 'active' },
        {
          status: 'revealed',
          revealedAt: new Date(),
          entries: formatted.entries,
          awards: formatted.awards,
          totalVoters: formatted.totalVoters,
        }
      );
      // Re-fetch
      const refreshed = await TuringGameModel.findOne({ questionId }).lean();
      if (refreshed) return Response.json({ game: formatGame(refreshed, userId || undefined) });
    }

    return Response.json({ game: formatted });
  } catch (error) {
    console.error('Turing GET error:', error);
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST: manually start a turing game
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  try {
    const { questionId } = await params;
    const ip = getClientIp(request);
    const limiter = checkRateLimit(`turing:post:${ip}`, 5, 60 * 1000);
    if (!limiter.allowed) return rateLimitResponse(limiter.retryAfter);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ error: '请先登录' }, { status: 401 });
    }

    await connectDB();

    const result = await createTuringGame(questionId);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    if (!result.game) {
      return Response.json({ error: '创建失败' }, { status: 500 });
    }

    // Schedule simulated votes if newly created
    if (result.created) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries = (result.game as any).entries;
      const messageIds = entries.map((e: { messageId: string }) => e.messageId);
      const actualTypes = entries.map((e: { actualType: string }) => e.actualType);
      scheduleSimulatedVotes(questionId, messageIds, actualTypes);
    }

    const game = formatGame(result.game, session.user.id);
    return Response.json({ game, created: result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error('Turing POST error:', error);
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
