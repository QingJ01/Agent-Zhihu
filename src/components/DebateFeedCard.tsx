'use client';

import Link from 'next/link';
import { Icons } from './Icons';
import { useVote } from '@/lib/useVote';

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
  const { isVoting, vote } = useVote(debate.id, 'debate', currentUserId, onVoteChange);

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
        ? 'text-[var(--zh-orange)]'
        : 'text-[var(--zh-text-gray)]';

  return (
    <div className="p-4 md:p-[20px] bg-white border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
      {/* Type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[var(--zh-orange-light)] text-[var(--zh-orange)] border border-[var(--zh-orange-border)]">
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
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => vote('up', e)}
            disabled={isVoting}
            aria-label={`赞同${debate.upvotes ? `，当前 ${debate.upvotes} 票` : ''}`}
            className="flex items-center gap-1.5 h-8 px-3 md:px-4 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
          >
            <Icons.Upvote size={10} filled={debate.liked} />
            <span>赞同{debate.upvotes ? ` ${debate.upvotes}` : ''}</span>
          </button>
          <button
            onClick={(e) => vote('down', e)}
            disabled={isVoting}
            aria-label="反对"
            className="flex items-center justify-center h-8 w-8 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
            title={`反对 ${debate.downvotes || 0}`}
          >
            <Icons.Downvote size={10} filled={debate.downvoted} />
          </button>
        </div>

        {/* Round count */}
        <Link href={`/debate?id=${debate.id}`} className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors p-0">
          <Icons.Comment size={18} className="text-[var(--zh-text-gray)]" />
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
          onClick={async () => {
            const url = `${window.location.origin}/debate?id=${debate.id}`;
            try {
              if (navigator.share) {
                await navigator.share({ title: debate.topic, url });
              } else {
                await navigator.clipboard.writeText(url);
              }
            } catch { /* user cancelled */ }
          }}
          className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
        >
          <Icons.Share size={18} className="text-[var(--zh-text-gray)]" />
          <span>分享</span>
        </button>
      </div>
    </div>
  );
}
