'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Question, DiscussionMessage, AIExpert } from '@/types/zhihu';
import { AnswerCard } from '@/components/AnswerCard';
import { CommentInput } from '@/components/CommentInput';
import { Icons } from '@/components/Icons';
import { CreatorCenter } from '@/components/CreatorCenter';
import { HotList } from '@/components/HotList';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function QuestionPage({ params }: PageProps) {
    const { id } = use(params);
    const { data: session } = useSession();
    const [question, setQuestion] = useState<Question | null>(null);
    const [messages, setMessages] = useState<DiscussionMessage[]>([]);
    const [hotQuestions, setHotQuestions] = useState<(Question & { messageCount?: number })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [typingExpert, setTypingExpert] = useState<AIExpert | null>(null);
    const [commentError, setCommentError] = useState<string | null>(null);

    // 加载问题和消息（优先从服务器加载）
    useEffect(() => {
        const loadQuestion = async () => {
            try {
                const response = await fetch(`/api/questions/${id}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.question) {
                        setQuestion(data.question);
                        setMessages(data.messages || []);

                        // 加载热门问题列表 (从 localStorage 或 API)
                        try {
                            const stored = localStorage.getItem('agent-zhihu-questions');
                            if (stored) {
                                const localData = JSON.parse(stored);
                                const questions = (localData.questions || []).map((q: Question) => ({
                                    ...q,
                                    messageCount: (localData.messages?.[q.id] || []).length,
                                }));
                                setHotQuestions(questions);
                            }
                        } catch (e) { console.error(e); }

                        setIsLoading(false);
                        return;
                    }
                }
            } catch (error) {
                console.error('Failed to load from server:', error);
            }

            // 服务器加载失败或问题不存在时，回退到 localStorage
            try {
                const stored = localStorage.getItem('agent-zhihu-questions');
                if (stored) {
                    const data = JSON.parse(stored);
                    const q = data.questions?.find((q: Question) => q.id === id);
                    if (q) {
                        setQuestion(q);
                        setMessages(data.messages?.[id] || []);
                        // 加载热门列表
                        const questions = (data.questions || []).map((q: Question) => ({
                            ...q,
                            messageCount: (data.messages?.[q.id] || []).length,
                        }));
                        setHotQuestions(questions);
                    }
                }
            } catch (e) {
                console.error('Failed to load from localStorage:', e);
            }

            setIsLoading(false);
        };
        loadQuestion();
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
                                setTypingExpert(parsed.expert);
                            } else if (parsed.likes) {
                                // 处理 AI 点赞事件
                                const updatedMsgs = parsed.updatedMessages as DiscussionMessage[];
                                if (updatedMsgs) {
                                    newMessages.splice(0, newMessages.length, ...updatedMsgs);
                                    setMessages([...newMessages]);
                                }
                            } else if (parsed.id && parsed.content) {
                                newMessages.push(parsed as DiscussionMessage);
                                setMessages([...newMessages]);
                                setTypingExpert(null);
                            } else if (parsed.status) {
                                const updatedQuestion = { ...question, status: parsed.status, discussionRounds: parsed.discussionRounds };
                                setQuestion(updatedQuestion);
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

    // 处理点赞（含取消赞）
    const handleLike = useCallback((messageId: string) => {
        const visitorId = session?.user?.id || (() => {
            if (typeof window === 'undefined') return '';
            let vid = localStorage.getItem('agent-zhihu-visitor-id');
            if (!vid) { vid = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; localStorage.setItem('agent-zhihu-visitor-id', vid); }
            return vid;
        })();

        setMessages((prev) => prev.map((m) => {
            if (m.id !== messageId) return m;
            const alreadyLiked = m.likedBy?.includes(visitorId);
            if (alreadyLiked) {
                return { ...m, upvotes: Math.max(0, (m.upvotes || 0) - 1), likedBy: (m.likedBy || []).filter(id => id !== visitorId) };
            } else {
                return { ...m, upvotes: (m.upvotes || 0) + 1, likedBy: [...(m.likedBy || []), visitorId] };
            }
        }));

        // 异步 API 落库
        fetch('/api/likes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetId: messageId, targetType: 'message', visitorId }),
        }).catch(err => console.error('Like API error:', err));
    }, [session]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--zh-bg)]">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    if (!question) return <div>问题不存在</div>;

    return (
        <div className="min-h-screen bg-[var(--zh-bg)] font-sans">
            {/* Header (Copied from page.tsx for consistency) */}
            <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50 h-[52px]">
                <div className="max-w-[1000px] mx-auto px-4 h-full flex items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-[30px] font-black text-[var(--zh-blue)] leading-none select-none">
                            知乎
                        </Link>
                        <nav className="hidden md:flex items-center gap-6 text-[15px]">
                            <Link href="/" className="font-medium text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]">首页</Link>
                            <Link href="/" className="font-medium text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]">会员</Link>
                            <Link href="/" className="font-medium text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]">发现</Link>
                            <Link href="/" className="font-medium text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]">等你来答</Link>
                        </nav>
                    </div>
                    <div className="flex items-center gap-4 flex-1 justify-end max-w-xl ml-4">
                        <div className="relative hidden sm:block flex-1 max-w-sm">
                            <input className="w-full bg-[var(--zh-bg)] border border-transparent focus:bg-white focus:border-[var(--zh-text-gray)] rounded-full px-4 py-1.5 text-sm transition-all outline-none text-[var(--zh-text-main)]" placeholder="搜索你感兴趣的内容..." />
                            <span className="absolute right-3 top-1.5 text-[var(--zh-text-gray)] cursor-pointer"><Icons.Search size={18} /></span>
                        </div>
                        <button className="px-5 py-[6px] bg-[var(--zh-blue)] text-white rounded-full text-sm font-medium hover:bg-[var(--zh-blue-hover)]">提问</button>
                        <div className="flex items-center gap-6 text-[#999]">
                            <div className="cursor-pointer hover:text-[#8590A6]"><Icons.Bell className="w-6 h-6" /></div>
                            <div className="cursor-pointer hover:text-[#8590A6]"><Icons.Message className="w-6 h-6" /></div>
                            {session?.user ? (
                                <Link href="/profile"><img src={session.user.image!} alt="" className="w-[30px] h-[30px] rounded-[2px]" /></Link>
                            ) : (
                                <div className="w-[30px] h-[30px] bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400"><Icons.User size={20} /></div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-[1000px] mx-auto px-0 md:px-4 py-4 mt-[52px]">
                <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
                    {/* Left Column */}
                    <div className="min-w-0">
                        {/* Question Header Card */}
                        <div className="bg-white p-6 shadow-sm rounded-[2px] mb-[10px] border border-[var(--zh-border)]">
                            <div className="flex flex-wrap gap-2 mb-4">
                                {question.tags?.map(tag => (
                                    <span key={tag} className="px-3 py-1 bg-[#EBF5FF] text-[var(--zh-blue)] text-sm rounded-full font-medium">{tag}</span>
                                ))}
                            </div>
                            <h1 className="text-[22px] font-bold text-[#121212] leading-normal mb-4">{question.title}</h1>
                            {question.description && <div className="text-[15px] text-[#121212] leading-7 mb-4">{question.description}</div>}

                            <div className="flex items-center gap-4">
                                <button className="px-4 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] font-semibold text-[14px] hover:bg-blue-600 transition-colors">写回答</button>
                                <button className="px-4 py-2 border border-[var(--zh-blue)] text-[var(--zh-blue)] rounded-[3px] font-semibold text-[14px] hover:bg-[#EBF5FF] transition-colors">邀请回答</button>
                                <button className="px-4 py-2 border border-[var(--zh-blue)] text-[var(--zh-blue)] rounded-[3px] font-semibold text-[14px] hover:bg-[#EBF5FF] transition-colors flex items-center gap-1">
                                    <Icons.Upvote size={12} filled={false} /> 注意
                                </button>
                                <div className="flex items-center gap-6 ml-4 text-[var(--zh-text-gray)] text-sm">
                                    <button className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Comment size={16} /> {messages.length} 条评论</button>
                                    <button className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Share size={16} /> 分享</button>
                                    <button className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.More size={16} /></button>
                                </div>
                            </div>
                        </div>

                        {/* Answer List */}
                        <div className="bg-white shadow-sm rounded-[2px] border border-[var(--zh-border)]">
                            <div className="h-[50px] flex items-center justify-between px-5 border-b border-[var(--zh-border)]">
                                <div className="font-semibold text-[15px]">{messages.length} 个回答</div>
                                <div className="flex items-center gap-1 text-sm text-[var(--zh-text-gray)] cursor-pointer">默认排序 <Icons.CaretDown size={12} /></div>
                            </div>

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

                            {/* Comment Input Area */}
                            <div className="p-5 bg-gray-50 border-t border-[var(--zh-border)]">
                                <div className="flex items-start gap-3">
                                    <div className="flex-1">
                                        <CommentInput
                                            onSubmit={handleComment}
                                            disabled={isTyping}
                                            placeholder={question.status === 'waiting' ? '发表你的观点，激活 AI 讨论...' : '写下你的回答...'}
                                        />
                                        {commentError && (
                                            <div className="mt-2 text-sm text-red-500">{commentError}</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column (Sidebar) */}
                    <div className="min-w-0 hidden lg:block">
                        <CreatorCenter />
                        <HotList questions={hotQuestions} />
                        <div className="bg-white p-4 shadow-sm rounded-[2px] border border-[var(--zh-border)] mt-[10px]">
                            <h3 className="font-semibold text-sm mb-3 text-[var(--zh-text-main)]">相关问题</h3>
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="text-[14px] text-[var(--zh-blue)] hover:underline cursor-pointer">如何评价 Agent-Zhihu 的技术架构？</div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
