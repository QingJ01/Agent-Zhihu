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
        <div className="bg-white rounded-[2px] shadow-sm overflow-hidden border border-[var(--zh-border)]">
            <div className="px-4 py-3 border-b border-[var(--zh-border)]">
                <h3 className="font-semibold text-[var(--zh-text-main)] text-[14px]">热门话题</h3>
            </div>
            <div className="p-4">
                {sortedTags.length === 0 ? (
                    <div className="text-center text-[var(--zh-text-gray)] text-sm py-4">
                        暂无话题
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {sortedTags.map((tag) => {
                            return (
                                <button
                                    key={tag.name}
                                    onClick={() => onTagClick?.(tag.name)}
                                    className="px-3 py-1 bg-[var(--zh-bg)] text-[var(--zh-text-secondary)] text-[13px] rounded-[100px] hover:bg-[#ebf5ff] hover:text-[var(--zh-blue)] transition-colors"
                                >
                                    {tag.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
