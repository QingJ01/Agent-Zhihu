'use client';

interface TagCloudProps {
    tags: { name: string; count: number }[];
    onTagClick?: (tag: string) => void;
}

export function TagCloud({ tags, onTagClick }: TagCloudProps) {
    // 按频率排序
    const sortedTags = [...tags].sort((a, b) => b.count - a.count).slice(0, 20);
    const maxCount = Math.max(...sortedTags.map((t) => t.count), 1);

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="text-lg">🏷️</span>
                <h3 className="font-bold text-gray-900">热门话题</h3>
            </div>
            <div className="p-4">
                {sortedTags.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">
                        暂无话题
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {sortedTags.map((tag) => {
                            const intensity = tag.count / maxCount;
                            const size = intensity > 0.7 ? 'text-base' : intensity > 0.4 ? 'text-sm' : 'text-xs';
                            const color = intensity > 0.7
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : intensity > 0.4
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100';

                            return (
                                <button
                                    key={tag.name}
                                    onClick={() => onTagClick?.(tag.name)}
                                    className={`px-3 py-1 rounded-full transition-colors ${size} ${color}`}
                                >
                                    {tag.name}
                                    <span className="ml-1 opacity-60">{tag.count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
