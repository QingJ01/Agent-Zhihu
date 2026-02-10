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
    const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);

    // 加载问题和消息
    useEffect(() => {
        try {
            const stored = localStorage.getItem('agent-zhihu-questions');
            if (stored) {
                const data = JSON.parse(stored);
                // Fix: ensure messageCount is loaded if available, or just use question object
                const q = data.questions?.find((q: Question) => q.id === id);
                if (q) {
                    const msgs = data.messages?.[id] || [];
                    setQuestion({ ...q, messageCount: msgs.length });
                    setMessages(msgs);
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
            replyTo: replyTo?.id,
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
                    replyToId: replyTo?.id,
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
            setTypingExpert(null);
            setReplyTo(null); // 清除回复状态
        }
    }, [question, messages, session, replyTo]);

    // 处理回复点击
    const handleReply = useCallback((message: DiscussionMessage) => {
        setReplyTo(message);
        // 滚动到评论框
        document.getElementById('comment-input')?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // 取消回复
    const cancelReply = useCallback(() => {
        setReplyTo(null);
    }, []);

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
            {/* Question Header */}
            <div className="bg-white shadow-sm mb-3">
                <div className="max-w-[1000px] mx-auto px-4 py-6">
                    <div className="flex items-center gap-2 mb-4">
                        {(question.tags || []).map((tag) => (
                            <span key={tag} className="px-3 py-1 bg-[#EBF5FF] text-[#0066FF] rounded-full text-sm font-medium hover:bg-[#d9efff] cursor-pointer">
                                {tag}
                            </span>
                        ))}
                    </div>
                    <h1 className="text-[26px] font-bold text-[#121212] mb-4 leading-tight">
                        {question.title}
                    </h1>
                    {question.description && (
                        <div className="text-[15px] text-[#121212] leading-7">
                            {question.description}
                        </div>
                    )}

                    <div className="flex items-center gap-4 mt-6">
                        <button className="px-4 py-1.5 bg-[#0066FF] text-white rounded-[3px] font-medium hover:bg-[#005ce6]">
                            写回答
                        </button>
                        <button className="px-4 py-1.5 border border-[#0066FF] text-[#0066FF] rounded-[3px] font-medium hover:bg-[#EBF5FF]">
                            邀请回答
                        </button>
                        <div className="flex-1" />
                        <span className="text-sm text-gray-400">
                            {question.messageCount || 0} 条评论
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-[1000px] mx-auto px-4 pb-20 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    {/* Discussion List */}
                    <div className="bg-white rounded-[2px] shadow-sm mb-4">
                        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                            <span className="font-semibold text-gray-800">{messages.length} 个回答</span>
                            <div className="text-sm text-gray-400">默认排序</div>
                        </div>
                        <div>
                            {messages.map((message) => (
                                <AnswerCard
                                    key={message.id}
                                    message={message}
                                    allMessages={messages}
                                    onLike={handleLike}
                                    onReply={handleReply}
                                />
                            ))}
                        </div>
                    </div>

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

                    {/* Reply Context UI */}
                    {replyTo && (
                        <div className="bg-blue-50 border border-blue-100 rounded-t-xl px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-blue-700">
                                <span>↩️ 正在回复</span>
                                <span className="font-bold">
                                    @{replyTo.authorType === 'ai'
                                        ? (replyTo.author as AIExpert).name
                                        : (replyTo.author as { name: string }).name}
                                </span>
                            </div>
                            <button
                                onClick={cancelReply}
                                className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                            >
                                取消回复
                            </button>
                        </div>
                    )}

                    <div id="comment-input" className={replyTo ? 'rounded-b-xl overflow-hidden' : ''}>
                        <CommentInput
                            onSubmit={handleComment}
                            disabled={isTyping}
                            placeholder={
                                replyTo
                                    ? `回复 @${replyTo.authorType === 'ai' ? (replyTo.author as AIExpert).name : (replyTo.author as { name: string }).name}...`
                                    : question.status === 'waiting'
                                        ? '发表你的观点，AI 将回应你的评论...'
                                        : '参与讨论，发表你的看法...'
                            }
                        />
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="hidden lg:block w-[296px] flex-shrink-0">
                    <div className="bg-white p-4 rounded-[2px] shadow-sm sticky top-20">
                        <div className="font-medium mb-3">关于作者</div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-gray-200"></div>
                            <div className="text-sm">
                                <div className="font-bold">Agent Bot</div>
                                <div className="text-gray-500">优秀回答者</div>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm text-gray-500">
                            <span>关注者 12</span>
                            <span>被赞同 8</span>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
