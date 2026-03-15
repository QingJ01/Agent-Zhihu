'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Icons } from './Icons';

export interface DebateFeedItem {
  id: string;
  type: 'debate';
  topic: string;
  userName: string;
  userAvatar?: string;
  opponentName: string;
  opponentAvatar?: string;
  winner?: 'user' | 'opponent' | 'tie';
  conclusion?: string;
  roundCount: number;
  upvotes: number;
  downvotes: number;
  liked: boolean;
  downvoted: boolean;
  createdAt: number;
}

interface DebateFeedCardProps {
  debate: DebateFeedItem;
  currentUserId?: string;
  onVoteChange?: (debateId: string, payload: { liked: boolean; downvoted: boolean; upvotes: number; downvotes: number }) => void;
}

export function DebateFeedCard({ debate, currentUserId, onVoteChange }: DebateFeedCardProps) {
  const [isVoting, setIsVoting] = useState(false);

  const winnerLabel =
    debate.winner === 'user'
      ? debate.userName
      : debate.winner === 'opponent'
        ? debate.opponentName
        : debate.winner === 'tie'
          ? '平局'
          : null;

  const winnerColor =
    debate.winner === 'user'
      ? 'text-[var(--zh-blue)]'
      : debate.winner === 'opponent'
        ? 'text-orange-600'
        : 'text-[var(--zh-text-gray)]';

  const handleVoteClick = useCallback(async (e: React.MouseEvent, voteType: 'up' | 'down') => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUserId || isVoting) {
      if (!currentUserId) window.alert('请先登录后再操作');
      return;
    }

    setIsVoting(true);
    try {
      const response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: debate.id, targetType: 'debate', voteType }),
      });

      if (!response.ok) {
        throw new Error('操作失败');
      }

      const result = await response.json();
      onVoteChange?.(debate.id, {
        liked: !!result.liked,
        downvoted: !!result.downvoted,
        upvotes: Number(result.upvotes) || 0,
        downvotes: Number(result.downvotes) || 0,
      });
    } catch (error) {
      console.error('Debate vote failed:', error);
      window.alert('操作失败，请稍后再试');
    } finally {
      setIsVoting(false);
    }
  }, [currentUserId, isVoting, onVoteChange, debate.id]);

  return (
    <div className="p-4 md:p-[20px] bg-white border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
      {/* Type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-orange-50 text-orange-600 border border-orange-100">
          <Icons.Swords size={12} />
          辩论
        </span>
        <span className="text-[12px] text-[var(--zh-text-gray)]">
          {debate.userName} vs {debate.opponentName}
        </span>
      </div>

      {/* Title / Topic */}
      <h2 className="text-[16px] md:text-[18px] font-bold text-[var(--zh-text-main)] leading-snug mb-2">
        <Link href={`/debate?id=${debate.id}`} className="hover:underline decoration-[var(--zh-blue)]">
          {debate.topic}
        </Link>
      </h2>

      {/* Conclusion preview */}
      {debate.conclusion && (
        <div className="mb-2">
          <p className="text-[15px] text-[var(--zh-text-main)] leading-[1.67] line-clamp-3">
            {debate.conclusion}
            <Link
              href={`/debate?id=${debate.id}`}
              className="inline-flex mt-1 md:mt-0 md:float-right text-[13px] md:text-[14px] text-[var(--zh-blue)] font-medium hover:text-[var(--zh-text-secondary)] ml-1 items-center gap-0.5"
            >
              查看辩论 <Icons.CaretDown size={14} />
            </Link>
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        {/* Vote buttons */}
        <div className="flex items-center rounded-[3px] overflow-hidden">
          <button
            onClick={(e) => handleVoteClick(e, 'up')}
            disabled={isVoting}
            className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]"
          >
            <Icons.Upvote size={12} filled={debate.liked} />
            <span>{`赞同 ${debate.upvotes || ''}`}</span>
          </button>
          <button
            onClick={(e) => handleVoteClick(e, 'down')}
            className="px-2 py-1.5 text-xs md:text-sm font-medium transition-colors ml-[2px] bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]"
            title={`反对 ${debate.downvotes || 0}`}
          >
            <Icons.Downvote size={12} filled={debate.downvoted} />
          </button>
        </div>

        {/* Round count */}
        <Link href={`/debate?id=${debate.id}`} className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors p-0">
          <Icons.Comment size={18} className="text-[#8590A6]" />
          <span>{debate.roundCount} 回合</span>
        </Link>

        {/* Winner */}
        {winnerLabel && (
          <span className={`flex items-center gap-1.5 text-xs md:text-sm ${winnerColor}`}>
            {debate.winner === 'tie' ? '🤝' : '🏆'}
            <span>{debate.winner === 'tie' ? '平局' : `${winnerLabel} 胜出`}</span>
          </span>
        )}

        {/* Share */}
        <button
          onClick={() => {
            const url = `${window.location.origin}/debate?id=${debate.id}`;
            if (navigator.share) {
              navigator.share({ title: debate.topic, url });
            } else {
              navigator.clipboard.writeText(url);
            }
          }}
          className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
        >
          <Icons.Share size={18} className="text-[#8590A6]" />
          <span>分享</span>
        </button>
      </div>
    </div>
  );
}
