'use client';

import { useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import { Icons } from '@/components/Icons';
import { openLoginModal } from '@/lib/loginModal';
import { toast } from '@/components/Toast';

interface CommentInputProps {
    onSubmit: (content: string, replyToId?: string) => Promise<void>;
    onGenerate?: (replyToId?: string) => Promise<string>;
    disabled?: boolean;
    placeholder?: string;
    submitLabel?: string;
    replyTarget?: {
        id: string;
        name: string;
        preview?: string;
    } | null;
    onCancelReply?: () => void;
}

export function CommentInput({
    onSubmit,
    onGenerate,
    disabled,
    placeholder,
    submitLabel,
    replyTarget,
    onCancelReply,
}: CommentInputProps) {
    const { data: session } = useSession();
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const quickEmojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '✅', '❌', '🙏', '💡'];

    if (!session?.user) {
        return (
            <div className="bg-white rounded-[2px] p-4 border border-[var(--zh-border)] text-center">
                <p className="text-[var(--zh-text-gray)] mb-3">登录后参与讨论</p>
                <button
                    type="button"
                    onClick={openLoginModal}
                    className="inline-block px-4 py-1.5 bg-[#056DE8] text-white rounded-[3px] text-sm font-medium hover:bg-[#0461CF] transition-colors"
                >
                    用 SecondMe 登录
                </button>
            </div>
        );
    }

    const handleSubmit = async () => {
        if (!content.trim() || isSubmitting) return;

        const nextContent = content.trim();
        setContent('');
        onCancelReply?.();

        setIsSubmitting(true);
        try {
            await onSubmit(nextContent, replyTarget?.id);
        } catch (error) {
            console.error('Submit failed:', error);
            setContent(nextContent);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGenerate = async () => {
        if (!onGenerate || isGenerating || isSubmitting || disabled) return;

        setIsGenerating(true);
        try {
            const generated = await onGenerate(replyTarget?.id);
            const next = generated.trim();
            if (next) {
                setContent(next);
                setShowEmojiPicker(false);
                requestAnimationFrame(() => {
                    const input = textareaRef.current;
                    if (!input) return;
                    input.focus();
                    const cursor = next.length;
                    input.setSelectionRange(cursor, cursor);
                });
            }
        } catch (error) {
            console.error('Generate draft failed:', error);
            toast.error('生成失败，请稍后重试');
        } finally {
            setIsGenerating(false);
        }
    };

    const insertAtCursor = (text: string) => {
        const input = textareaRef.current;
        if (!input) {
            setContent((prev) => `${prev}${text}`);
            return;
        }

        const start = input.selectionStart ?? content.length;
        const end = input.selectionEnd ?? content.length;
        const next = `${content.slice(0, start)}${text}${content.slice(end)}`;
        setContent(next);

        requestAnimationFrame(() => {
            input.focus();
            const cursor = start + text.length;
            input.setSelectionRange(cursor, cursor);
        });
    };

    return (
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-3 md:p-4">
            <div className="flex items-start gap-3">
                <div className="hidden sm:flex w-[38px] h-[38px] rounded-[2px] overflow-hidden bg-[var(--zh-bg)] items-center justify-center text-gray-400 flex-shrink-0">
                    {session.user.image ? (
                        <Image
                            src={session.user.image}
                            alt={session.user.name || 'User'}
                            width={38}
                            height={38}
                            className="w-full h-full object-cover"
                            unoptimized
                        />
                    ) : (
                        <Icons.User size={20} />
                    )}
                </div>
                <div className="flex-1">
                    {replyTarget && (
                        <div className="mb-2 flex items-start justify-between rounded-[3px] bg-[#F6F6F6] px-3 py-2 text-sm">
                            <div className="text-[var(--zh-text-secondary)]">
                                回复 <span className="font-medium text-[var(--zh-blue)]">@{replyTarget.name}</span>
                                {replyTarget.preview ? <span className="ml-1 opacity-80">{replyTarget.preview}</span> : null}
                            </div>
                            {onCancelReply && (
                                <button
                                    type="button"
                                    onClick={onCancelReply}
                                    className="ml-3 text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]"
                                >
                                    取消
                                </button>
                            )}
                        </div>
                    )}
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={placeholder || '参与讨论，发表你的观点...'}
                        aria-label="评论内容"
                        disabled={disabled || isSubmitting}
                        className="w-full min-h-[84px] resize-none outline-none text-[14px] md:text-[15px] leading-relaxed placeholder-[var(--zh-text-gray)] disabled:bg-gray-50"
                        rows={4}
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3 md:gap-5 text-[var(--zh-text-gray)]">
                            <button
                                type="button"
                                onClick={() => insertAtCursor('#标签 ')}
                                className="inline-flex items-center gap-1 hover:text-[var(--zh-blue)]"
                            >
                                <Icons.Hash className="w-5 h-5" />
                                <span className="hidden sm:inline text-[13px]">标签</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowEmojiPicker((prev) => !prev)}
                                className="inline-flex items-center gap-1 hover:text-[var(--zh-blue)]"
                            >
                                <Icons.Smile className="w-5 h-5" />
                                <span className="hidden sm:inline text-[13px]">表情</span>
                            </button>
                            <span><Icons.Image className="w-5 h-5" /></span>
                            <span><Icons.Video className="w-5 h-5" /></span>
                        </div>
                        <div className="flex w-full sm:w-auto items-center gap-2">
                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={!onGenerate || isGenerating || isSubmitting || !!disabled}
                                className="px-4 py-1.5 border border-[var(--zh-blue)] text-[var(--zh-blue)] rounded-[3px] text-sm font-medium hover:bg-[#EBF5FF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isGenerating ? '生成中...' : (replyTarget ? '生成回复' : '生成回答')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!content.trim() || isSubmitting || isGenerating || disabled}
                                className="px-5 py-1.5 bg-[#056DE8] text-white rounded-[3px] text-sm font-medium hover:bg-[#0461CF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? '发送中...' : (submitLabel || '发布回答')}
                            </button>
                        </div>
                    </div>
                    {showEmojiPicker && (
                        <div className="mt-2 inline-flex flex-wrap gap-1 p-2 bg-[var(--zh-bg)] rounded-[6px] border border-[var(--zh-border)]">
                            {quickEmojis.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                        insertAtCursor(emoji);
                                        setShowEmojiPicker(false);
                                    }}
                                    className="w-8 h-8 text-lg hover:bg-white rounded"
                                    aria-label={`插入表情 ${emoji}`}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
