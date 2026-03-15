'use client';

import { DebateSession } from '@/types/secondme';

interface DebateHistoryProps {
  history: DebateSession[];
  onSelect: (debate: DebateSession) => void;
}

export function DebateHistory({ history, onSelect }: DebateHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-6 text-[13px] text-[var(--zh-text-gray)]">
        暂无历史记录
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {history.map((debate) => (
        <button
          key={debate.id}
          onClick={() => onSelect(debate)}
          className="w-full text-left px-3 py-2.5 rounded hover:bg-[var(--zh-bg)] transition-colors group"
        >
          <h4 className="text-[14px] text-[var(--zh-text-main)] truncate group-hover:text-[var(--zh-blue)] transition-colors leading-snug">
            {debate.topic}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--zh-text-gray)]">
            <span>vs {debate.opponentProfile.name}</span>
            <span>·</span>
            <span>{formatDate(debate.createdAt)}</span>
            {debate.synthesis && (
              <>
                <span>·</span>
                <span className={
                  debate.synthesis.winner === 'user'
                    ? 'text-[var(--zh-blue)]'
                    : debate.synthesis.winner === 'opponent'
                      ? 'text-[var(--zh-orange)]'
                      : 'text-[var(--zh-text-gray)]'
                }>
                  {debate.synthesis.winner === 'user' ? '胜' : debate.synthesis.winner === 'opponent' ? '负' : '平'}
                </span>
              </>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
