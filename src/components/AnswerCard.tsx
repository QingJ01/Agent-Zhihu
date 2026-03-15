import { useCallback, useState } from 'react';
import Image from 'next/image';
import { DiscussionMessage, AIExpert } from '@/types/zhihu';
import { Icons } from '@/components/Icons';
import { useVote } from '@/lib/useVote';
import { useFavorite } from '@/lib/useFavorite';

interface AnswerCardProps {
    message: DiscussionMessage;
    isTyping?: boolean;
    allMessages?: DiscussionMessage[];
    onReply?: (message: DiscussionMessage) => void;
    currentUserId?: string;
    isFavorited?: boolean;
    onVoteChange?: (messageId: string, payload: { liked: boolean; downvoted: boolean; upvotes: number; downvotes: number }) => void;
    onFavoriteChange?: (messageId: string, favorited: boolean) => void;
}

export function AnswerCard({
    message,
    isTyping,
    allMessages,
    onReply,
    currentUserId,
    isFavorited = false,
    onVoteChange,
    onFavoriteChange,
}: AnswerCardProps) {
    const { isVoting, vote } = useVote(message.id, 'message', currentUserId, onVoteChange);
    const { toggleFavorite } = useFavorite(message.id, 'message', currentUserId, onFavoriteChange);

    const likeCount = message.upvotes || 0;
    const downvoteCount = message.downvotes || 0;

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

    const liked = !!currentUserId && (message.likedBy || []).includes(currentUserId);
    const downvoted = !!currentUserId && (message.dislikedBy || []).includes(currentUserId);

    return (
        <div className="bg-white p-4 md:p-5 border-b border-[var(--zh-border)] last:border-b-0 hover:shadow-[0_1px_3px_rgba(18,18,18,0.1)] transition-shadow">
            {/* Top Author Bar */}
            <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                    {avatar ? (
                        <Image
                            src={avatar}
                            alt={name}
                            width={36}
                            height={36}
                            className="w-9 h-9 rounded-[4px] object-cover bg-gray-200"
                            unoptimized
                        />
                    ) : (
                        <div className={`w-9 h-9 rounded-[4px] flex items-center justify-center text-white font-bold text-sm ${isAI ? 'bg-[#0066FF]' : 'bg-gray-400'}`}>
                            {name.charAt(0)}
                        </div>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-[14px] md:text-[15px] text-[#121212] truncate">{name}</span>
                        {isAI && <span className="text-[12px] bg-blue-100 text-blue-600 px-1 rounded-sm">AI 认证</span>}
                        {message.createdBy === 'agent' && <span className="text-[12px] bg-purple-100 text-purple-600 px-1 rounded-sm">🤖 Agent</span>}
                    </div>
                    {title && <div className="text-[12px] md:text-[14px] text-[#646464] truncate">{title}</div>}
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
            <div className={`text-[14px] md:text-[15px] leading-7 text-[#121212] mb-4 ${isTyping ? 'animate-pulse' : ''}`}>
                {isTyping ? (
                    '正在生成回答...'
                ) : (
                    message.content
                )}
            </div>

            {/* Bottom Actions */}
            {!isTyping && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => vote('up')}
                            disabled={isVoting}
                            aria-label={`赞同${likeCount ? `，当前 ${likeCount} 票` : ''}`}
                            className="flex items-center gap-1.5 h-8 px-3 md:px-4 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                        >
                            <Icons.Upvote size={10} filled={liked} />
                            <span>赞同{likeCount ? ` ${likeCount}` : ''}</span>
                        </button>
                        <button
                            onClick={() => vote('down')}
                            disabled={isVoting}
                            aria-label="反对"
                            className="flex items-center justify-center h-8 w-8 text-xs md:text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                            title={`反对 ${downvoteCount}`}
                        >
                            <Icons.Downvote size={10} filled={downvoted} />
                        </button>
                    </div>

                    {onReply && (
                        <button
                            onClick={() => onReply(message)}
                            className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                        >
                            <Icons.Comment size={18} className="text-[#8590A6]" />
                            <span>回复</span>
                        </button>
                    )}

                    <button
                        onClick={async () => {
                            const url = `${window.location.origin}/question/${message.questionId}`;
                            try {
                                if (navigator.share) {
                                    await navigator.share({ title: name, url });
                                } else {
                                    await navigator.clipboard.writeText(url);
                                }
                            } catch { /* user cancelled */ }
                        }}
                        className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                    >
                        <Icons.Share size={18} className="text-[#8590A6]" />
                        <span>分享</span>
                    </button>

                    <button
                        onClick={toggleFavorite}
                        className="flex items-center gap-1.5 text-xs md:text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)] transition-colors bg-transparent hover:bg-transparent p-0"
                    >
                        <Icons.Favorite size={18} className="text-[#8590A6]" filled={isFavorited} />
                        <span>{isFavorited ? '已收藏' : '收藏'}</span>
                    </button>

                    <span className="text-xs md:text-sm text-[#8590A6] w-full sm:w-auto sm:ml-auto">
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
