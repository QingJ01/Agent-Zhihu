'use client';

import { DebateSession } from '@/types/secondme';

interface DebateHistoryProps {
    history: DebateSession[];
    onSelect: (debate: DebateSession) => void;
}

export function DebateHistory({ history, onSelect }: DebateHistoryProps) {
    if (history.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <p className="text-lg mb-2">📭 暂无历史记录</p>
                <p className="text-sm">开始一场辩论，记录将自动保存在这里</p>
            </div>
        );
    }

    return (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {history.map((debate) => (
                <button
                    key={debate.id}
                    onClick={() => onSelect(debate)}
                    className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                >
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
                                {debate.topic}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                                <span>vs {debate.opponentProfile.name}</span>
                                <span>•</span>
                                <span>{formatDate(debate.createdAt)}</span>
                            </div>
                        </div>
                        {debate.synthesis && (
                            <div className="ml-3 flex-shrink-0">
                                <span
                                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${debate.synthesis.winner === 'user'
                                            ? 'bg-green-100 text-green-700'
                                            : debate.synthesis.winner === 'opponent'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-gray-100 text-gray-700'
                                        }`}
                                >
                                    {debate.synthesis.winner === 'user'
                                        ? '🏆 胜利'
                                        : debate.synthesis.winner === 'opponent'
                                            ? '💔 惜败'
                                            : '🤝 平局'}
                                </span>
                            </div>
                        )}
                    </div>
                    {debate.synthesis?.conclusion && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">
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

    if (diff < 60000) {
        return '刚刚';
    } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)} 分钟前`;
    } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)} 小时前`;
    } else if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)} 天前`;
    } else {
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
}
