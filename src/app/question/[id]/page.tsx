'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Question, DiscussionMessage, AIExpert } from '@/types/zhihu';
import { AnswerCard } from '@/components/AnswerCard';
import { CommentInput } from '@/components/CommentInput';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function QuestionPage({ params }: PageProps) {
    const { id } = use(params);
    const { data: session } = useSession();
    const [question, setQuestion] = useState<Question | null>(null);
    const [messages, setMessages] = useState<DiscussionMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [typingExpert, setTypingExpert] = useState<AIExpert | null>(null);
    const [commentError, setCommentError] = useState<string | null>(null);

    // 加载问题和消息
    useEffect(() => {
        try {
            const stored = localStorage.getItem('agent-zhihu-questions');
            if (stored) {
                const data = JSON.parse(stored);
                const q = data.questions?.find((q: Question) => q.id === id);
                if (q) {
                    setQuestion(q);
                    setMessages(data.messages?.[id] || []);
                }
            }
        } catch (error) {
            console.error('Failed to load question:', error);
        }
        setIsLoading(false);
    }, [id]);

    // 提交评论
    const handleComment = useCallback(async (content: string) => {
        if (!question || !session?.user) return;

        setCommentError(null);
        setIsTyping(true);

        const localUserMessage: DiscussionMessage = {
            id: `msg-${Date.now()}-user-local`,
            questionId: question.id,
            author: {
                id: session.user.id,
                name: session.user.name || '用户',
                avatar: session.user.image || undefined,
            },
            authorType: 'user',
            createdBy: 'human',
            content,
            upvotes: 0,
            likedBy: [],
            createdAt: Date.now(),
        };

        const messagesWithUser = [...messages, localUserMessage];
        setMessages(messagesWithUser);

        try {
            const stored = localStorage.getItem('agent-zhihu-questions');
            if (stored) {
                const data = JSON.parse(stored);
                data.messages[question.id] = messagesWithUser;
                localStorage.setItem('agent-zhihu-questions', JSON.stringify(data));
            }
        } catch (error) {
            console.error('Failed to persist user message locally:', error);
        }

        try {
            const response = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    messages,
                    userMessage: content,
                    userId: session.user.id,
                    userName: session.user.name,
                    userAvatar: session.user.image,
                    userMessageId: localUserMessage.id,
                    userMessageCreatedAt: localUserMessage.createdAt,
                    userMessageAlreadyPersisted: true,
                }),
            });

            const reader = response.body?.getReader();
            if (!reader) return;

            const decoder = new TextDecoder();
            let buffer = '';
            const newMessages: DiscussionMessage[] = [...messagesWithUser];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const parsed = JSON.parse(line.slice(6));

                            if (parsed.expert) {
                                // typing 事件
                                setTypingExpert(parsed.expert);
                            } else if (parsed.id && parsed.content) {
                                // message 事件
                                newMessages.push(parsed as DiscussionMessage);
                                setMessages([...newMessages]);
                                setTypingExpert(null);
                            } else if (parsed.status) {
                                // done 事件
                                const updatedQuestion = { ...question, status: parsed.status, discussionRounds: parsed.discussionRounds };
                                setQuestion(updatedQuestion);

                                // 保存到 localStorage
                                const stored = localStorage.getItem('agent-zhihu-questions');
                                if (stored) {
                                    const data = JSON.parse(stored);
                                    data.questions = data.questions.map((q: Question) =>
                                        q.id === question.id ? updatedQuestion : q
                                    );
                                    data.messages[question.id] = parsed.messages;
                                    localStorage.setItem('agent-zhihu-questions', JSON.stringify(data));
                                }
                            }
                        } catch { }
                    }
                }
            }
        } catch (error) {
            console.error('Comment error:', error);
            setCommentError('评论已保存，AI 回复失败，请稍后重试。');
        } finally {
            setIsTyping(false);
            setTypingExpert(null);
        }
    }, [question, messages, session]);

    // 处理点赞
    const handleLike = useCallback((messageId: string) => {
        const visitorId = session?.user?.id || getVisitorId();

        setMessages((prev) => {
            const updated = prev.map((m) => {
                if (m.id === messageId && !m.likedBy?.includes(visitorId)) {
                    return {
                        ...m,
                        upvotes: (m.upvotes || 0) + 1,
                        likedBy: [...(m.likedBy || []), visitorId],
                    };
                }
                return m;
            });

            // 保存到 localStorage
            try {
                const stored = localStorage.getItem('agent-zhihu-questions');
                if (stored && question) {
                    const data = JSON.parse(stored);
                    data.messages[question.id] = updated;
                    localStorage.setItem('agent-zhihu-questions', JSON.stringify(data));
                }
            } catch { }

            return updated;
        });
    }, [session, question]);

    function getVisitorId(): string {
        if (typeof window === 'undefined') return '';
        let id = localStorage.getItem('agent-zhihu-visitor-id');
        if (!id) {
            id = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            localStorage.setItem('agent-zhihu-visitor-id', id);
        }
        return id;
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    if (!question) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
                <p className="text-lg mb-4">问题不存在</p>
                <Link href="/" className="text-blue-600 hover:underline">
                    返回首页
                </Link>
            </div>
        );
    }

    const statusText = {
        discussing: '🤖 AI 正在讨论',
        waiting: '💬 等待你的参与',
        active: '🔥 讨论进行中',
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <Link href="/" className="text-gray-500 hover:text-gray-700">
                        ← 返回
                    </Link>
                    <div className="flex-1" />
                    {session?.user && (
                        <div className="flex items-center gap-2">
                            {session.user.image && (
                                <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
                            )}
                            <span className="text-sm text-gray-700">{session.user.name}</span>
                        </div>
                    )}
                </div>
            </header>

            {/* Question */}
            <main className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
                    <div className="flex items-start justify-between gap-4">
                        <h1 className="text-2xl font-bold text-gray-900">{question.title}</h1>
                        <span className="flex-shrink-0 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                            {statusText[question.status]}
                        </span>
                    </div>
                    {question.description && (
                        <p className="mt-4 text-gray-600">{question.description}</p>
                    )}
                    <div className="mt-4 flex gap-2">
                        {question.tags.map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-sm">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Discussion */}
                <div className="space-y-4 mb-6">
                    <h2 className="text-lg font-semibold text-gray-800">
                        {messages.length} 条讨论
                    </h2>

                    {messages.map((message) => (
                        <AnswerCard
                            key={message.id}
                            message={message}
                            allMessages={messages}
                            onLike={handleLike}
                        />
                    ))}

                    {isTyping && typingExpert && (
                        <AnswerCard
                            message={{
                                id: 'typing',
                                questionId: question.id,
                                author: typingExpert,
                                authorType: 'ai',
                                content: '',
                                upvotes: 0,
                                createdAt: Date.now(),
                            }}
                            isTyping
                        />
                    )}
                </div>

                {/* Comment Input */}
                {question.status === 'waiting' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                        <p className="text-yellow-800">
                            👋 AI 专家们已经讨论完毕，等待你的观点来激活新一轮讨论！
                        </p>
                    </div>
                )}

                {commentError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
                        {commentError}
                    </div>
                )}

                <CommentInput
                    onSubmit={handleComment}
                    disabled={isTyping}
                    placeholder={
                        question.status === 'waiting'
                            ? '发表你的观点，AI 将回应你的评论...'
                            : '参与讨论，发表你的看法...'
                    }
                />
            </main>
        </div>
    );
}
