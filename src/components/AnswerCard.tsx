import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DiscussionMessage, AIExpert } from '@/types/zhihu';
import { Icons } from '@/components/Icons';

interface AnswerCardProps {
    message: DiscussionMessage;
    isTyping?: boolean;
    allMessages?: DiscussionMessage[];
    onLike?: (messageId: string) => void;
    onReply?: (message: DiscussionMessage) => void;
}

export function AnswerCard({ message, isTyping, allMessages, onLike, onReply }: AnswerCardProps) {
    const { data: session } = useSession();
    const [isLiked, setIsLiked] = useState(() => {
        const visitorId = session?.user?.id || getVisitorId();
        return message.likedBy?.includes(visitorId) || false;
    });
    const [likeCount, setLikeCount] = useState(message.upvotes || 0);

    const isAI = message.authorType === 'ai';
    const author = isAI ? (message.author as AIExpert) : message.author;
    const name = isAI ? (author as AIExpert).name : (author as { name: string }).name;
    const title = isAI ? (author as AIExpert).title : '用户';
    const avatar = isAI ? undefined : (author as { avatar?: string }).avatar;

    // 找到回复的消息
    const replyToMessage = message.replyTo && allMessages
        ? allMessages.find(m => m.id === message.replyTo)
        : null;
    const replyToName = replyToMessage
        ? replyToMessage.authorType === 'ai'
            ? (replyToMessage.author as AIExpert).name
            : (replyToMessage.author as { name: string }).name
        : null;

    const handleLike = useCallback(() => {
        if (isTyping || !onLike) return;

        if (!isLiked) {
            setIsLiked(true);
            setLikeCount(prev => prev + 1);
            onLike(message.id);
        }
    }, [isTyping, isLiked, message.id, onLike]);

    return (
        <div className="bg-white p-5 border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
            {/* Top Author Bar */}
            <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                    {avatar ? (
                        <img src={avatar} alt={name} className="w-9 h-9 rounded-[4px] object-cover bg-gray-200" />
                    ) : (
                        <div className={`w-9 h-9 rounded-[4px] flex items-center justify-center text-white font-bold text-sm ${isAI ? 'bg-[#0066FF]' : 'bg-gray-400'}`}>
                            {name.charAt(0)}
                        </div>
                    )}
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-[15px] text-[#121212]">{name}</span>
                        {isAI && <span className="text-[12px] bg-blue-100 text-blue-600 px-1 rounded-sm">AI 认证</span>}
                    </div>
                    {title && <div className="text-[14px] text-[#646464]">{title}</div>}
                </div>
            </div>

            {/* Reply Context */}
            {replyToName && (
                <div className="text-[14px] text-[#8590A6] mb-2 pl-3 border-l-2 border-gray-200">
                    回复 <span className="font-medium text-gray-600">@{replyToName}</span>
                    {replyToMessage && <span className="opacity-80">: {replyToMessage.content.slice(0, 20)}...</span>}
                </div>
            )}

            {/* Content */}
            <div className={`text-[15px] leading-7 text-[#121212] mb-4 ${isTyping ? 'animate-pulse' : ''}`}>
                {isTyping ? (
                    '正在生成回答...'
                ) : (
                    message.content
                )}
            </div>

            {/* Bottom Actions */}
            {!isTyping && (
                <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-[3px] overflow-hidden">
                        <button
                            onClick={handleLike}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${isLiked
                                ? 'bg-[var(--zh-blue)] text-white'
                                : 'bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]'
                                }`}
                        >
                            <Icons.Upvote size={12} filled={isLiked} />
                            <span>{isLiked ? `已赞同 ${likeCount}` : `赞同 ${likeCount}`}</span>
                        </button>
                        <button
                            className={`px-2 py-1.5 text-sm font-medium transition-colors ml-[2px] ${isLiked
                                ? 'bg-[var(--zh-blue)] text-white'
                                : 'bg-[rgba(0,102,255,0.1)] text-[var(--zh-blue)] hover:bg-[rgba(0,102,255,0.15)]'
                                }`}
                        >
                            <Icons.Downvote size={12} filled={isLiked} />
                        </button>
                    </div>

                    <button
                        onClick={() => onReply?.(message)}
                        className="flex items-center gap-1.5 text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                    >
                        <Icons.Comment size={18} className="text-[#8590A6]" />
                        <span>{replyToName ? '查看对话' : '回复'}</span>
                    </button>

                    <button className="flex items-center gap-1.5 text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0">
                        <Icons.Share size={18} className="text-[#8590A6]" />
                        <span>分享</span>
                    </button>

                    <button className="flex items-center gap-1.5 text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0">
                        <Icons.Favorite size={18} className="text-[#8590A6]" />
                        <span>收藏</span>
                    </button>

                    <span className="text-sm text-[#8590A6] ml-auto">
                        {formatTime(message.createdAt)}
                    </span>
                </div>
            )}
        </div>
    );
}

function formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
}

// 获取或生成访客 ID
function getVisitorId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('agent-zhihu-visitor-id');
    if (!id) {
        id = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('agent-zhihu-visitor-id', id);
    }
    return id;
}
