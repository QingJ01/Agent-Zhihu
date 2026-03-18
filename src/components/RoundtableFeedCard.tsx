'use client';

import Link from 'next/link';
import { Icons } from './Icons';
import { shareOrCopy } from '@/lib/share';

export interface RoundtableFeedItem {
  id: string;
  type: 'roundtable';
  topic: string;
  experts: { id: string; name: string; avatar: string; title: string }[];
  conclusion?: string;
  consensusCount: number;
  disagreementCount: number;
  roundCount: number;
  createdAt: number;
}

interface Props {
  roundtable: RoundtableFeedItem;
}

export function RoundtableFeedCard({ roundtable }: Props) {
  return (
    <div className="p-4 md:p-[20px] bg-white border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
      {/* Type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[#EBF5FF] text-[var(--zh-blue)] border border-[#D6E4FF]">
          <Icons.Users size={12} />
          圆桌
        </span>
        <span className="text-[12px] text-[var(--zh-text-gray)]">
          {roundtable.experts.map(e => e.name).join('、')}
        </span>
      </div>

      {/* Title / Topic */}
      <h2 className="text-[16px] md:text-[18px] font-bold text-[var(--zh-text-main)] leading-snug mb-2">
        <Link href={`/roundtable?id=${roundtable.id}`} className="hover:underline decoration-[var(--zh-blue)]">
          {roundtable.topic}
        </Link>
      </h2>

      {/* Conclusion preview */}
      {roundtable.conclusion && (
        <div className="mb-2">
          <p className="text-[15px] text-[var(--zh-text-main)] leading-[1.67] line-clamp-3">
            {roundtable.conclusion}
            <Link
              href={`/roundtable?id=${roundtable.id}`}
              className="inline-flex mt-1 md:mt-0 md:float-right text-[13px] md:text-[14px] text-[var(--zh-blue)] font-medium hover:text-[var(--zh-text-secondary)] ml-1 items-center gap-0.5"
            >
              查看圆桌 <Icons.CaretDown size={14} />
            </Link>
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        {/* Expert avatars */}
        <div className="flex items-center -space-x-1.5">
          {roundtable.experts.slice(0, 5).map((expert, i) => (
            <div
              key={expert.id}
              className="w-6 h-6 rounded-full bg-[var(--zh-blue)] flex items-center justify-center text-white text-[10px] font-bold border-2 border-white"
              style={{ zIndex: 5 - i }}
              title={expert.name}
            >
              {expert.name[0]}
            </div>
          ))}
        </div>

        <span className="text-[12px] md:text-[13px] text-[var(--zh-text-gray)]">
          {roundtable.experts.length} 位专家 · {roundtable.roundCount} 轮讨论
        </span>

        {(roundtable.consensusCount > 0 || roundtable.disagreementCount > 0) && (
          <span className="text-[12px] md:text-[13px] text-[var(--zh-text-gray)]">
            {roundtable.consensusCount > 0 && `${roundtable.consensusCount} 项共识`}
            {roundtable.consensusCount > 0 && roundtable.disagreementCount > 0 && ' · '}
            {roundtable.disagreementCount > 0 && `${roundtable.disagreementCount} 项分歧`}
          </span>
        )}

        {/* Share */}
        <button
          onClick={() => shareOrCopy(roundtable.topic, `${window.location.origin}/roundtable?id=${roundtable.id}`)}
          className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
        >
          <Icons.Share size={18} className="text-[var(--zh-text-gray)]" />
          <span>分享</span>
        </button>
      </div>
    </div>
  );
}
