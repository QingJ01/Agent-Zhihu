'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { openLoginModal } from '@/lib/loginModal';

interface TuringEntry {
  messageId: string;
  anonymousLabel: string;
  contentPreview: string;
  voteCount: number;
  myGuess: 'human' | 'ai' | null;
  actualType?: 'ai' | 'user';
  stats?: { totalVotes: number; correctVotes: number; accuracy: number };
}

interface TuringAward {
  type: 'most_human_ai' | 'most_ai_human' | 'best_detective';
  displayName: string;
  stat: number;
  entryMessageId?: string;
  userId?: string;
}

interface TuringGameData {
  id: string;
  questionId: string;
  status: 'active' | 'revealed';
  startedAt: string;
  revealAt: string;
  revealedAt?: string;
  entries: TuringEntry[];
  awards?: TuringAward[];
  totalVoters: number;
}

interface Props {
  questionId: string;
}

function formatCountdown(targetDate: string): string {
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return '即将揭晓';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}小时${minutes}分钟`;
}

const AWARD_CONFIG: Record<string, { title: string; desc: string }> = {
  most_human_ai: { title: '最像人类的 AI', desc: '被最多人误判为人类' },
  most_ai_human: { title: '最像 AI 的人类', desc: '被最多人误判为 AI' },
  best_detective: { title: '火眼金睛', desc: '猜测准确率最高' },
};

export default function TuringGame({ questionId }: Props) {
  const { data: session } = useSession();
  const [game, setGame] = useState<TuringGameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canStart, setCanStart] = useState(false);
  const [starting, setStarting] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [showRevealAnim, setShowRevealAnim] = useState(false);
  const [revealedEntries, setRevealedEntries] = useState<Set<string>>(new Set());

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/turing/${questionId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.error) setError(data.error);
        setGame(null);
        return;
      }
      const data = await res.json();
      setGame(data.game);
      setCanStart(!!data.canStart);
      if (data.game) setError(null);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  const startGame = async () => {
    if (!session?.user) { openLoginModal(); return; }
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/turing/${questionId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '开启失败'); return; }
      setGame(data.game);
      setCanStart(false);
    } catch {
      setError('开启失败，请稍后重试');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => { fetchGame(); }, [fetchGame]);

  useEffect(() => {
    if (!game || game.status !== 'active') return;
    // Poll every 15s to show vote count updates (simulated votes trickle in)
    const timer = setInterval(() => {
      if (new Date(game.revealAt).getTime() <= Date.now()) {
        fetchGame();
        clearInterval(timer);
      } else {
        fetchGame();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [game, fetchGame]);

  const handleGuess = async (messageId: string, guess: 'human' | 'ai') => {
    if (!session?.user) {
      openLoginModal();
      return;
    }
    if (!game || votingId) return;
    setVotingId(messageId);

    try {
      const res = await fetch(`/api/turing/${questionId}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, guess }),
      });

      if (res.ok) {
        const data = await res.json();
        setGame(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            entries: prev.entries.map(e =>
              e.messageId === messageId
                ? { ...e, myGuess: guess, voteCount: data.updated.voteCount }
                : e
            ),
          };
        });
      }
    } catch { /* ignore */ }
    finally { setVotingId(null); }
  };

  const startRevealAnimation = () => {
    if (!game || game.status !== 'revealed') return;
    setShowRevealAnim(true);
    setRevealedEntries(new Set());
    game.entries.forEach((entry, i) => {
      setTimeout(() => {
        setRevealedEntries(prev => new Set([...prev, entry.messageId]));
      }, (i + 1) * 800);
    });
  };

  // Loading
  if (loading) {
    return (
      <div className="bg-white p-5 border border-[var(--zh-border)] rounded-[2px]">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-[var(--zh-blue)] rounded-full animate-spin" />
          <span className="text-[14px] text-[var(--zh-text-gray)]">加载盲猜游戏...</span>
        </div>
      </div>
    );
  }

  // No game — show start button or error
  if (!game) {
    return (
      <div className="bg-white border border-[var(--zh-border)] rounded-[2px]">
        <div className="py-12 px-5 text-center">
          <div className="w-14 h-14 mx-auto mb-3 bg-[var(--zh-bg)] rounded-full flex items-center justify-center text-[24px]">🕵️</div>
          <p className="text-[16px] font-medium text-[var(--zh-text-main)] mb-1">盲猜人机</p>
          {error && <p className="text-[13px] text-[#FF4D4F] mb-3">{error}</p>}
          {canStart ? (
            <>
              <p className="text-[14px] text-[var(--zh-text-gray)] mb-4">隐藏所有回答的身份，看看你能否分辨 AI 和真人</p>
              <button
                onClick={startGame}
                disabled={starting}
                className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors disabled:opacity-50"
              >
                {starting ? '开启中...' : '开启盲猜'}
              </button>
            </>
          ) : (
            <p className="text-[14px] text-[var(--zh-text-gray)]">{error || '该问题回答数不足，暂无法开启盲猜'}</p>
          )}
        </div>
      </div>
    );
  }

  const isActive = game.status === 'active';
  const isRevealed = game.status === 'revealed';

  return (
    <div className="bg-white border border-[var(--zh-border)] rounded-[2px] overflow-hidden">
      {/* Banner */}
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-[var(--zh-text-main)]">
              {isActive ? '盲猜进行中' : '揭晓结果'}
            </h3>
            <p className="text-[13px] text-[var(--zh-text-gray)] mt-0.5">
              {isActive
                ? `${game.totalVoters} 人参与 · 还剩 ${formatCountdown(game.revealAt)} 揭晓`
                : `${game.totalVoters} 人参与了猜测`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="text-[12px] px-2 py-0.5 bg-[#EBF5FF] text-[var(--zh-blue)] rounded-[2px]">进行中</span>
            )}
            {isRevealed && (
              <button
                onClick={startRevealAnimation}
                className="text-[13px] text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)] transition-colors"
              >
                重播揭晓
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Awards */}
      {isRevealed && game.awards && game.awards.length > 0 && (
        <div className="px-5 py-4 border-b border-[var(--zh-border)] bg-[var(--zh-bg)]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {game.awards.map(award => {
              const config = AWARD_CONFIG[award.type];
              return (
                <div key={award.type} className="p-3 bg-white rounded-[3px] border border-[var(--zh-border)]">
                  <div className="text-[13px] font-bold text-[var(--zh-text-main)]">{config?.title}</div>
                  <div className="text-[14px] font-medium text-[var(--zh-blue)] mt-0.5">{award.displayName}</div>
                  <div className="text-[12px] text-[var(--zh-text-gray)] mt-0.5">
                    {award.type === 'best_detective'
                      ? `准确率 ${(award.stat * 100).toFixed(0)}%`
                      : `误判率 ${(award.stat * 100).toFixed(0)}%`
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="divide-y divide-[var(--zh-border)]">
        {game.entries.map(entry => {
          const isEntryRevealed = isRevealed && (!showRevealAnim || revealedEntries.has(entry.messageId));
          const isFlipping = showRevealAnim && !revealedEntries.has(entry.messageId) && isRevealed;

          return (
            <div
              key={entry.messageId}
              className={`px-5 py-4 transition-all duration-500 ${isFlipping ? 'opacity-50' : ''}`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-[4px] flex items-center justify-center text-white text-[13px] font-bold ${
                  isEntryRevealed
                    ? entry.actualType === 'ai' ? 'bg-[var(--zh-blue)]' : 'bg-[#00B96B]'
                    : 'bg-[#8590A6]'
                }`}>
                  {isEntryRevealed
                    ? entry.actualType === 'ai' ? 'AI' : '人'
                    : '?'
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--zh-text-main)]">
                      {entry.anonymousLabel}
                    </span>
                    {isEntryRevealed && (
                      <span className={`text-[12px] px-2 py-0.5 rounded-[2px] font-medium animate-fadeIn ${
                        entry.actualType === 'ai'
                          ? 'bg-[#EBF5FF] text-[var(--zh-blue)]'
                          : 'bg-[#F0FFF5] text-[#00B96B]'
                      }`}>
                        {entry.actualType === 'ai' ? 'AI 专家' : '真人用户'}
                      </span>
                    )}
                  </div>
                  {isEntryRevealed && entry.stats && (
                    <div className="text-[12px] text-[var(--zh-text-gray)]">
                      {entry.stats.totalVotes} 人猜测 · {(entry.stats.accuracy * 100).toFixed(0)}% 猜对
                    </div>
                  )}
                </div>
              </div>

              {/* Content */}
              <p className="text-[14px] md:text-[15px] text-[var(--zh-text-main)] leading-7 mb-3 pl-11">
                {entry.contentPreview}
                {entry.contentPreview.length >= 300 && '...'}
              </p>

              {/* Guess Buttons */}
              {isActive && (
                <div className="flex items-center gap-2 pl-11">
                  <button
                    onClick={() => handleGuess(entry.messageId, 'human')}
                    disabled={votingId === entry.messageId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[13px] font-medium transition-colors ${
                      entry.myGuess === 'human'
                        ? 'bg-[#00B96B] text-white'
                        : 'border border-[var(--zh-border)] text-[var(--zh-text-secondary)] hover:border-[#00B96B] hover:text-[#00B96B]'
                    }`}
                  >
                    我猜是人
                  </button>
                  <button
                    onClick={() => handleGuess(entry.messageId, 'ai')}
                    disabled={votingId === entry.messageId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[13px] font-medium transition-colors ${
                      entry.myGuess === 'ai'
                        ? 'bg-[var(--zh-blue)] text-white'
                        : 'border border-[var(--zh-border)] text-[var(--zh-text-secondary)] hover:border-[var(--zh-blue)] hover:text-[var(--zh-blue)]'
                    }`}
                  >
                    我猜是 AI
                  </button>
                  <span className="text-[12px] text-[var(--zh-text-gray)] ml-1">{entry.voteCount} 人已猜</span>
                </div>
              )}

              {/* Stats Bar */}
              {isEntryRevealed && entry.stats && entry.stats.totalVotes > 0 && (
                <div className="pl-11 mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] text-[var(--zh-text-gray)]">猜测分布</span>
                    {entry.myGuess && (
                      <span className={`text-[12px] font-medium ${
                        (entry.actualType === 'ai' && entry.myGuess === 'ai') ||
                        (entry.actualType === 'user' && entry.myGuess === 'human')
                          ? 'text-[#00B96B]' : 'text-[#FF4D4F]'
                      }`}>
                        {(entry.actualType === 'ai' && entry.myGuess === 'ai') ||
                         (entry.actualType === 'user' && entry.myGuess === 'human')
                          ? '猜对了' : '猜错了'
                        }
                      </span>
                    )}
                  </div>
                  <div className="w-full h-4 bg-[var(--zh-bg)] rounded-[2px] overflow-hidden flex">
                    <div
                      className="h-full bg-[#FF4D4F] flex items-center justify-center text-[10px] text-white font-medium transition-all duration-700"
                      style={{ width: `${(1 - entry.stats.accuracy) * 100}%`, minWidth: entry.stats.accuracy < 1 ? '16px' : '0' }}
                    >
                      {entry.stats.totalVotes - entry.stats.correctVotes > 0 && `${entry.stats.totalVotes - entry.stats.correctVotes}`}
                    </div>
                    <div
                      className="h-full bg-[#00B96B] flex items-center justify-center text-[10px] text-white font-medium transition-all duration-700"
                      style={{ width: `${entry.stats.accuracy * 100}%`, minWidth: entry.stats.accuracy > 0 ? '16px' : '0' }}
                    >
                      {entry.stats.correctVotes > 0 && `${entry.stats.correctVotes}`}
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px] text-[var(--zh-text-gray)] mt-0.5">
                    <span>猜错</span>
                    <span>猜对</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {isActive && (
        <div className="px-5 py-3 bg-[var(--zh-bg)] border-t border-[var(--zh-border)] text-center">
          <p className="text-[13px] text-[var(--zh-text-gray)]">
            {session?.user
              ? '猜猜每条回答是 AI 写的还是真人写的，揭晓后看看你的准确率'
              : '登录后即可参与投票猜测'
            }
          </p>
          {!session?.user && (
            <button
              onClick={openLoginModal}
              className="mt-2 px-4 py-1.5 bg-[var(--zh-blue)] text-white rounded-[3px] text-[13px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
            >
              登录 / 注册
            </button>
          )}
        </div>
      )}
    </div>
  );
}
