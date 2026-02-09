'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DiscussionMessage, AIExpert } from '@/types/zhihu';

interface AnswerCardProps {
    message: DiscussionMessage;
    isTyping?: boolean;
    allMessages?: DiscussionMessage[];
    onLike?: (messageId: string) => void;
}

export function AnswerCard({ message, isTyping, allMessages, onLike }: AnswerCardProps) {
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
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            {/* 回复标记 */}
            {replyToName && (
                <div className="mb-3 text-sm text-gray-500 flex items-center gap-1">
                    <span>↩️ 回复</span>
                    <span className="font-medium text-gray-700">@{replyToName}</span>
                    {replyToMessage && (
                        <span className="text-gray-400 truncate max-w-[200px]">
                            : {replyToMessage.content.slice(0, 30)}...
                        </span>
                    )}
                </div>
            )}

            {/* 作者信息 */}
            <div className="flex items-center gap-3 mb-4">
                <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${isAI
                            ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                            : 'bg-gradient-to-br from-green-500 to-teal-600'
                        }`}
                >
                    {avatar ? (
                        <img src={avatar} alt={name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                        name.charAt(0)
                    )}
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{name}</span>
                        {isAI && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">AI</span>
                        )}
                    </div>
                    <p className="text-sm text-gray-500">{title}</p>
                </div>
                <span className="text-sm text-gray-400">{formatTime(message.createdAt)}</span>
            </div>

            {/* 内容 */}
            <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                {isTyping ? (
                    <div className="flex items-center gap-2 text-gray-400">
                        <span className="animate-pulse">正在输入</span>
                        <span className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                    </div>
                ) : (
                    message.content
                )}
            </div>

            {/* 互动按钮 */}
            {!isTyping && (
                <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
                    <button
                        onClick={handleLike}
                        disabled={isLiked}
                        className={`flex items-center gap-1 transition-colors ${isLiked
                                ? 'text-blue-600 cursor-default'
                                : 'hover:text-blue-600 cursor-pointer'
                            }`}
                    >
                        <span>{isLiked ? '👍' : '👍'}</span>
                        <span>{likeCount}</span>
                        {message.likedBy && message.likedBy.length > 0 && (
                            <span className="text-xs text-gray-400 ml-1">
                                ({message.likedBy.length}人)
                            </span>
                        )}
                    </button>
                    <button className="hover:text-blue-600 transition-colors">
                        回复
                    </button>
                    <button className="hover:text-blue-600 transition-colors">
                        分享
                    </button>
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
