'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface CommentInputProps {
    onSubmit: (content: string) => Promise<void>;
    disabled?: boolean;
    placeholder?: string;
}

export function CommentInput({ onSubmit, disabled, placeholder }: CommentInputProps) {
    const { data: session } = useSession();
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!session?.user) {
        return (
            <div className="bg-gray-50 rounded-xl p-6 text-center">
                <p className="text-gray-500 mb-3">登录后参与讨论</p>
                <a
                    href="/api/auth/login"
                    className="inline-block px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-medium hover:shadow-lg transition-all"
                >
                    用 SecondMe 登录
                </a>
            </div>
        );
    }

    const handleSubmit = async () => {
        if (!content.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(content.trim());
            setContent('');
        } catch (error) {
            console.error('Submit failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {session.user.image ? (
                        <img
                            src={session.user.image}
                            alt={session.user.name || 'User'}
                            className="w-full h-full rounded-full object-cover"
                        />
                    ) : (
                        session.user.name?.charAt(0) || 'U'
                    )}
                </div>
                <div className="flex-1">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={placeholder || '参与讨论，发表你的观点...'}
                        disabled={disabled || isSubmitting}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-50"
                        rows={3}
                    />
                    <div className="mt-3 flex justify-end">
                        <button
                            onClick={handleSubmit}
                            disabled={!content.trim() || isSubmitting || disabled}
                            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? '发送中...' : '发表评论'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
