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
        <div className="bg-white rounded-[2px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">热门话题</h3>
            </div>
            <div className="p-4">
                {sortedTags.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">
                        暂无话题
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {sortedTags.map((tag) => {
                            return (
                                <button
                                    key={tag.name}
                                    onClick={() => onTagClick?.(tag.name)}
                                    className="px-3 py-1.5 bg-[#f6f6f6] text-[#8590A6] text-sm rounded-[3px] hover:bg-[#ebf5ff] hover:text-[#0066FF] transition-colors"
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
