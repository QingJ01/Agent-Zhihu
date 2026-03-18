'use client';

import { DebateSession } from '@/types/secondme';

interface DebateHistoryProps {
    history: DebateSession[];
    onSelect: (debate: DebateSession) => void;
}

export function DebateHistory({ history, onSelect }: DebateHistoryProps) {
    if (history.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-[14px] text-[var(--zh-text-gray)] mb-1">暂无历史记录</p>
                <p className="text-[13px] text-[var(--zh-text-gray)]">开始一场辩论，记录将自动保存在这里</p>
            </div>
        );
    }

    return (
        <div className="max-h-[400px] overflow-y-auto divide-y divide-[var(--zh-border)]">
            {history.map((debate) => (
                <button
                    key={debate.id}
                    onClick={() => onSelect(debate)}
                    className="w-full text-left p-3 hover:bg-[var(--zh-bg)] transition-colors"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <h4 className="text-[14px] font-medium text-[var(--zh-text-main)] truncate hover:text-[var(--zh-blue)] transition-colors">
                                {debate.topic}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-[12px] text-[var(--zh-text-gray)]">
                                <span>vs {debate.opponentProfile.name}</span>
                                <span>·</span>
                                <span>{formatDate(debate.createdAt)}</span>
                            </div>
                        </div>
                        {debate.synthesis && (
                            <div className="ml-3 flex-shrink-0">
                                <span className={`text-[12px] font-medium px-2 py-0.5 rounded-[2px] ${
                                    debate.synthesis.winner === 'user'
                                        ? 'bg-[#F0FFF5] text-[#00B96B]'
                                        : debate.synthesis.winner === 'opponent'
                                            ? 'bg-[#FFF2F0] text-[#FF4D4F]'
                                            : 'bg-[var(--zh-bg)] text-[var(--zh-text-gray)]'
                                }`}>
                                    {debate.synthesis.winner === 'user'
                                        ? '胜利'
                                        : debate.synthesis.winner === 'opponent'
                                            ? '惜败'
                                            : '平局'}
                                </span>
                            </div>
                        )}
                    </div>
                    {debate.synthesis?.conclusion && (
                        <p className="mt-1.5 text-[13px] text-[var(--zh-text-gray)] line-clamp-2">
                            {debate.synthesis.conclusion}
                        </p>
                    )}
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
