'use client';

import { useState, useEffect } from 'react';
import { DebateMessage, DebateSynthesis } from '@/types/secondme';
import { SynthesisReport } from './SynthesisReport';
import { Icons } from './Icons';
import { useVote } from '@/lib/useVote';
import { shareOrCopy } from '@/lib/share';
import Image from 'next/image';

interface DebateData {
  id: string;
  topic: string;
  mode?: string;
  status: string;
  userProfile: { id?: string; name: string; avatar?: string; bio?: string };
  opponentProfile: { id?: string; name: string; avatar?: string; bio?: string };
  messages: DebateMessage[];
  synthesis?: DebateSynthesis;
  currentRound?: number;
  totalRounds?: number;
  upvotes: number;
  downvotes: number;
  liked: boolean;
  downvoted: boolean;
  createdAt: number;
}

interface DebateViewerProps {
  debateId: string;
  currentUserId?: string;
}

export function DebateViewer({ debateId, currentUserId }: DebateViewerProps) {
  const [debate, setDebate] = useState<DebateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const { isVoting, vote } = useVote(debateId, 'debate', currentUserId, (_id, payload) => {
    if (debate) {
      setDebate({ ...debate, ...payload });
    }
  });

  useEffect(() => {
    async function fetchDebate() {
      try {
        setLoading(true);
        const res = await fetch(`/api/debate/${debateId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || '获取辩论失败');
        }
        const data = await res.json();
        setDebate(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取辩论失败');
      } finally {
        setLoading(false);
      }
    }
    fetchDebate();
  }, [debateId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--zh-blue)] border-t-transparent" />
      </div>
    );
  }

  if (error || !debate) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-[2px] text-[14px]">
        {error || '辩论不存在'}
      </div>
    );
  }

  const userName = debate.userProfile.name;
  const opponentName = debate.opponentProfile.name;

  const winnerLabel =
    debate.synthesis?.winner === 'user'
      ? userName
      : debate.synthesis?.winner === 'opponent'
        ? opponentName
        : debate.synthesis?.winner === 'tie'
          ? '平局'
          : null;

  return (
    <div className="max-w-[1000px] mx-auto space-y-3">
      {/* Header */}
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
        <h1 className="text-[20px] md:text-[22px] font-bold text-[var(--zh-text-main)] mb-3">{debate.topic}</h1>
        <div className="flex items-center gap-4 text-[13px] text-[var(--zh-text-gray)]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[var(--zh-orange-light)] text-[var(--zh-orange)] border border-[var(--zh-orange-border)]">
            <Icons.Swords size={12} />
            辩论
          </span>
          <span className="flex items-center gap-1.5">
            {debate.userProfile.avatar ? (
              <Image src={debate.userProfile.avatar} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" unoptimized />
            ) : (
              <span className="w-5 h-5 rounded-full bg-[var(--zh-blue-light)] flex items-center justify-center text-[10px] font-bold text-[var(--zh-blue)]">
                {userName.charAt(0)}
              </span>
            )}
            {userName}
          </span>
          <span>vs</span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-[var(--zh-orange-light)] flex items-center justify-center text-[10px] font-bold text-[var(--zh-orange)]">
              {opponentName.charAt(0)}
            </span>
            {opponentName}
          </span>
          {winnerLabel && (
            <span className="ml-auto flex items-center gap-1">
              {debate.synthesis?.winner === 'tie' ? '🤝' : '🏆'}
              {debate.synthesis?.winner === 'tie' ? '平局' : `${winnerLabel} 胜出`}
            </span>
          )}
        </div>

        {/* Vote / Share bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-[var(--zh-border)]">
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => vote('up', e)}
              disabled={isVoting}
              className="flex items-center gap-1.5 h-8 px-3 md:px-4 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
            >
              <Icons.Upvote size={10} filled={debate.liked} />
              <span>赞同{debate.upvotes ? ` ${debate.upvotes}` : ''}</span>
            </button>
            <button
              onClick={(e) => vote('down', e)}
              disabled={isVoting}
              className="flex items-center justify-center h-8 w-8 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
            >
              <Icons.Downvote size={10} filled={debate.downvoted} />
            </button>
          </div>
          <span className="text-xs md:text-sm text-[var(--zh-text-gray)]">
            {Math.floor((debate.messages?.length || 0) / 2)} 回合
          </span>
          <button
            onClick={() => shareOrCopy(debate.topic, window.location.href)}
            className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent p-0"
          >
            <Icons.Share size={18} />
            <span>分享</span>
          </button>
        </div>
      </div>

      {/* Tab switch */}
      {debate.synthesis && (
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)] flex">
          <button
            onClick={() => setShowReport(false)}
            className={`flex-1 py-2.5 text-[14px] font-medium transition-colors relative ${
              !showReport ? 'text-[var(--zh-blue)]' : 'text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]'
            }`}
          >
            对话记录
            {!showReport && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[var(--zh-blue)]" />}
          </button>
          <button
            onClick={() => setShowReport(true)}
            className={`flex-1 py-2.5 text-[14px] font-medium transition-colors relative ${
              showReport ? 'text-[var(--zh-blue)]' : 'text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]'
            }`}
          >
            认知报告
            {showReport && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[var(--zh-blue)]" />}
          </button>
        </div>
      )}

      {/* Content */}
      {!showReport ? (
        <div className="space-y-0">
          {debate.messages.map((msg, idx) => (
            <div key={idx} className="bg-white rounded-[2px] border border-[var(--zh-border)] mb-[-1px]">
              <div className="px-4 pt-3 pb-2 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-[var(--zh-blue-light)] text-[var(--zh-blue)]' : 'bg-[var(--zh-orange-light)] text-[var(--zh-orange)]'
                }`}>
                  {msg.role === 'user' && debate.userProfile.avatar ? (
                    <Image src={debate.userProfile.avatar} alt="" width={32} height={32} className="w-full h-full rounded-full object-cover" unoptimized />
                  ) : (
                    msg.name.charAt(0)
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-medium text-[var(--zh-text-main)]">{msg.name}</span>
                  <span className={`px-1.5 py-0.5 text-[11px] rounded ${
                    msg.role === 'user' ? 'bg-[var(--zh-blue-light)] text-[var(--zh-blue)]' : 'bg-[var(--zh-orange-light)] text-[var(--zh-orange)]'
                  }`}>
                    {msg.role === 'user' ? '正方' : '反方'}
                  </span>
                  <span className="text-[12px] text-[var(--zh-text-gray)]">第 {Math.floor(idx / 2) + 1} 轮</span>
                </div>
              </div>
              <div className="px-4 pb-3">
                <p className="text-[15px] text-[var(--zh-text-main)] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        debate.synthesis && (
          <SynthesisReport
            synthesis={debate.synthesis}
            userName={userName}
            opponentName={opponentName}
          />
        )
      )}
    </div>
  );
}
