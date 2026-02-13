'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Question, DiscussionMessage, AIExpert } from '@/types/zhihu';
import { AnswerCard } from '@/components/AnswerCard';
import { CommentInput } from '@/components/CommentInput';
import { Icons } from '@/components/Icons';
import { CreatorCenter } from '@/components/CreatorCenter';
import { HotList } from '@/components/HotList';
import { AppHeader } from '@/components/AppHeader';
import { AI_EXPERTS } from '@/lib/experts';
import { HashtagText } from '@/components/HashtagText';

type QuestionWithMeta = Question & { isFavorited?: boolean; messageCount?: number };
type MessageWithMeta = DiscussionMessage & { isFavorited?: boolean };

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function QuestionPage({ params }: PageProps) {
    const { id } = use(params);
    const router = useRouter();
    const { data: session } = useSession();
    const [question, setQuestion] = useState<QuestionWithMeta | null>(null);
    const [messages, setMessages] = useState<MessageWithMeta[]>([]);
    const [hotQuestions, setHotQuestions] = useState<(Question & { messageCount?: number })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [typingExpert, setTypingExpert] = useState<AIExpert | null>(null);
    const [commentError, setCommentError] = useState<string | null>(null);
    const [inviteAgentId, setInviteAgentId] = useState<string>(AI_EXPERTS[0]?.id || '');
    const [showInviteSelector, setShowInviteSelector] = useState(false);
    const [messageFavorites, setMessageFavorites] = useState<Record<string, boolean>>({});
    const [questionFavorited, setQuestionFavorited] = useState(false);
    const [replyTarget, setReplyTarget] = useState<DiscussionMessage | null>(null);
    const commentSectionRef = useRef<HTMLDivElement | null>(null);

    const loadHotQuestions = useCallback(async () => {
        try {
            const hotResponse = await fetch('/api/questions?action=list&limit=20');
            if (!hotResponse.ok) return;
            const hotData = await hotResponse.json();
            setHotQuestions(Array.isArray(hotData) ? hotData : []);
        } catch (error) {
            console.error('Failed to load hot questions:', error);
        }
    }, []);

    // 加载问题和消息
    useEffect(() => {
        const loadQuestion = async () => {
            try {
                const response = await fetch(`/api/questions/${id}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.question) {
                        setQuestion(data.question);
                        setMessages(data.messages || []);
                        setQuestionFavorited(!!data.question.isFavorited);
                        const messageFavoriteMap = ((data.messages || []) as MessageWithMeta[]).reduce((acc: Record<string, boolean>, item: MessageWithMeta) => {
                            acc[item.id] = !!item.isFavorited;
                            return acc;
                        }, {});
                        setMessageFavorites(messageFavoriteMap);
                        await loadHotQuestions();

                        setIsLoading(false);
                        return;
                    }
                }
            } catch (error) {
                console.error('Failed to load from server:', error);
            }

            setIsLoading(false);
        };
        loadQuestion();
    }, [id, loadHotQuestions]);

    // 提交评论
    const handleComment = useCallback(async (content: string, replyToId?: string) => {
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
            downvotes: 0,
            dislikedBy: [],
            createdAt: Date.now(),
            replyTo: replyToId,
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
                    replyToId,
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
                                const incoming = parsed as DiscussionMessage;
                                const existingIndex = newMessages.findIndex((m) => m.id === incoming.id);
                                if (existingIndex >= 0) {
                                    newMessages[existingIndex] = incoming;
                                } else {
                                    newMessages.push(incoming);
                                }
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

    const handleGenerateDraft = useCallback(async (replyToId?: string) => {
        if (!question) return '';

        const response = await fetch('/api/questions/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: {
                    id: question.id,
                    title: question.title,
                    description: question.description,
                },
                messages,
                replyToId,
            }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.error || '生成回答失败');
        }

        const data = await response.json();
        return typeof data?.content === 'string' ? data.content : '';
    }, [messages, question]);

    const handleQuestionVote = useCallback(async (voteType: 'up' | 'down') => {
        if (!question) return;
        if (!session?.user?.id) {
            window.alert(voteType === 'up' ? '请先登录后再点赞' : '请先登录后再反对');
            return;
        }

        try {
            const response = await fetch('/api/likes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId: question.id, targetType: 'question', voteType }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || (voteType === 'up' ? '点赞失败' : '反对失败'));
            }

            const result = await response.json();
            setQuestion((prev) => {
                if (!prev) return prev;
                const likedBy = result.liked
                    ? Array.from(new Set([...(prev.likedBy || []), session.user.id]))
                    : (prev.likedBy || []).filter((id) => id !== session.user.id);
                const dislikedBy = result.downvoted
                    ? Array.from(new Set([...(prev.dislikedBy || []), session.user.id]))
                    : (prev.dislikedBy || []).filter((id) => id !== session.user.id);
                return {
                    ...prev,
                    upvotes: Number(result.upvotes) || 0,
                    downvotes: Number(result.downvotes) || 0,
                    likedBy,
                    dislikedBy,
                };
            });
        } catch (error) {
            console.error('Question vote failed:', error);
            window.alert(voteType === 'up' ? '点赞失败，请稍后再试' : '反对失败，请稍后再试');
        }
    }, [question, session?.user?.id]);

    const handleQuestionFavorite = useCallback(async () => {
        if (!question) return;
        if (!session?.user?.id) {
            window.alert('请先登录后再收藏');
            return;
        }

        try {
            const response = await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId: question.id, targetType: 'question' }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || '收藏失败');
            }

            const result = await response.json();
            setQuestionFavorited(!!result.favorited);
        } catch (error) {
            console.error('Question favorite failed:', error);
            window.alert('收藏失败，请稍后再试');
        }
    }, [question, session?.user?.id]);

    const handleMessageVoteChange = useCallback((messageId: string, payload: { liked: boolean; downvoted: boolean; upvotes: number; downvotes: number }) => {
        setMessages((prev) => prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            const likedBy = payload.liked
                ? Array.from(new Set([...(msg.likedBy || []), session?.user?.id || ''])).filter(Boolean)
                : (msg.likedBy || []).filter((id) => id !== session?.user?.id);
            const dislikedBy = payload.downvoted
                ? Array.from(new Set([...(msg.dislikedBy || []), session?.user?.id || ''])).filter(Boolean)
                : (msg.dislikedBy || []).filter((id) => id !== session?.user?.id);
            return {
                ...msg,
                upvotes: payload.upvotes,
                downvotes: payload.downvotes,
                likedBy,
                dislikedBy,
            };
        }));
    }, [session?.user?.id]);

    const handleMessageFavoriteChange = useCallback((messageId: string, favorited: boolean) => {
        setMessageFavorites((prev) => ({
            ...prev,
            [messageId]: favorited,
        }));
    }, []);

    const scrollToComment = useCallback(() => {
        commentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    const handleReplyMessage = useCallback((message: DiscussionMessage) => {
        setReplyTarget(message);
        scrollToComment();
    }, [scrollToComment]);

    const handleShare = useCallback(async () => {
        const url = `${window.location.origin}/question/${id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: question?.title || '问题详情', url });
                return;
            }
            await navigator.clipboard.writeText(url);
            window.alert('链接已复制');
        } catch (error) {
            console.error('Share failed:', error);
        }
    }, [id, question?.title]);

    const handleInviteAgent = useCallback(async () => {
        if (!question || !inviteAgentId || isTyping) return;
        setCommentError(null);
        setIsTyping(true);

        try {
            const response = await fetch('/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    messages,
                    invitedAgentId: inviteAgentId,
                }),
            });

            const reader = response.body?.getReader();
            if (!reader) return;

            const decoder = new TextDecoder();
            let buffer = '';
            const newMessages: DiscussionMessage[] = [...messages];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        if (parsed.expert) {
                            setTypingExpert(parsed.expert);
                        } else if (parsed.id && parsed.content) {
                            const incoming = parsed as DiscussionMessage;
                            const existingIndex = newMessages.findIndex((m) => m.id === incoming.id);
                            if (existingIndex >= 0) {
                                newMessages[existingIndex] = incoming;
                            } else {
                                newMessages.push(incoming);
                            }
                            setMessages([...newMessages]);
                            setTypingExpert(null);
                        } else if (parsed.status) {
                            const updatedQuestion = { ...question, status: parsed.status, discussionRounds: parsed.discussionRounds };
                            setQuestion(updatedQuestion);
                        }
                    } catch {
                        // ignore parse errors
                    }
                }
            }
        } catch (error) {
            console.error('Invite agent error:', error);
            setCommentError('邀请失败，请稍后重试。');
        } finally {
            setIsTyping(false);
            setTypingExpert(null);
        }
    }, [inviteAgentId, isTyping, messages, question]);

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
            <AppHeader />

            <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 mt-[104px] md:mt-[52px]">
                <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
                    {/* Left Column */}
                    <div className="min-w-0">
                        {/* Question Header Card */}
                        <div className="bg-white p-4 md:p-6 shadow-sm rounded-[2px] mb-[10px] border border-[var(--zh-border)]">
                            <div className="flex flex-wrap gap-2 mb-4">
                                {question.tags?.map(tag => (
                                    <span key={tag} className="px-3 py-1 bg-[#EBF5FF] text-[var(--zh-blue)] text-sm rounded-full font-medium">{tag}</span>
                                ))}
                            </div>
                            <h1 className="text-[20px] md:text-[22px] font-bold text-[#121212] leading-normal mb-4">{question.title}</h1>
                            {question.description && (
                                <div className="text-[15px] text-[#121212] leading-7 mb-4">
                                    <HashtagText text={question.description} onTagClick={(tag) => router.push(`/?tag=${encodeURIComponent(tag)}`)} />
                                </div>
                            )}

                            <div className="flex flex-col items-start gap-3">
                                <div className="flex flex-wrap items-center gap-2 w-full">
                                    <button onClick={scrollToComment} className="px-4 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] font-semibold text-[14px] hover:bg-blue-600 transition-colors">写回答</button>
                                    <button
                                        onClick={() => setShowInviteSelector(true)}
                                        disabled={isTyping}
                                        className="px-4 py-2 border border-[var(--zh-blue)] text-[var(--zh-blue)] rounded-[3px] font-semibold text-[14px] hover:bg-[#EBF5FF] transition-colors disabled:opacity-50"
                                    >
                                        邀请回答
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[var(--zh-text-gray)] text-xs md:text-sm">
                                    <button onClick={() => handleQuestionVote('up')} className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Upvote size={16} filled={!!session?.user?.id && (question.likedBy || []).includes(session.user.id)} /> {question.upvotes || 0}</button>
                                    <button onClick={() => handleQuestionVote('down')} className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Downvote size={16} filled={!!session?.user?.id && (question.dislikedBy || []).includes(session.user.id)} /> {question.downvotes || 0}</button>
                                    <button onClick={scrollToComment} className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Comment size={16} /> {messages.length} 条评论</button>
                                    <button onClick={handleShare} className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Share size={16} /> 分享</button>
                                    <button onClick={handleQuestionFavorite} className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.Favorite size={16} filled={questionFavorited} /> {questionFavorited ? '已收藏' : '收藏'}</button>
                                    <button className="flex items-center gap-1 hover:text-[var(--zh-text-secondary)]"><Icons.More size={16} /></button>
                                </div>
                            </div>
                        </div>

                        {/* Answer List */}
                        <div className="bg-white shadow-sm rounded-[2px] border border-[var(--zh-border)]">
                            <div className="h-[50px] flex items-center justify-between px-3 md:px-5 border-b border-[var(--zh-border)]">
                                <div className="font-semibold text-[15px]">{messages.length} 个回答</div>
                                <div className="flex items-center gap-1 text-sm text-[var(--zh-text-gray)] cursor-pointer">默认排序 <Icons.CaretDown size={12} /></div>
                            </div>

                            {messages.map((message) => (
                                <AnswerCard
                                    key={message.id}
                                    message={message}
                                    allMessages={messages}
                                    onReply={handleReplyMessage}
                                    currentUserId={session?.user?.id}
                                    isFavorited={!!messageFavorites[message.id]}
                                    onVoteChange={handleMessageVoteChange}
                                    onFavoriteChange={handleMessageFavoriteChange}
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
                                        downvotes: 0,
                                        createdAt: Date.now(),
                                    }}
                                    isTyping
                                />
                            )}

                            {/* Comment Input Area */}
                            <div ref={commentSectionRef} className="p-3 md:p-5 bg-gray-50 border-t border-[var(--zh-border)]">
                                <div className="flex items-start gap-3">
                                    <div className="flex-1">
                                        <CommentInput
                                            onSubmit={handleComment}
                                            onGenerate={handleGenerateDraft}
                                            disabled={isTyping}
                                            submitLabel={replyTarget ? '发布回复' : '发布回答'}
                                            placeholder={
                                                replyTarget
                                                    ? `回复 @${replyTarget.authorType === 'ai' ? (replyTarget.author as AIExpert).name : replyTarget.author.name}`
                                                    : (question.status === 'waiting' ? '发表你的观点，激活 AI 讨论...' : '写下你的回答...')
                                            }
                                            replyTarget={replyTarget ? {
                                                id: replyTarget.id,
                                                name: replyTarget.authorType === 'ai' ? (replyTarget.author as AIExpert).name : replyTarget.author.name,
                                                preview: replyTarget.content.length > 30 ? `${replyTarget.content.slice(0, 30)}...` : replyTarget.content,
                                            } : null}
                                            onCancelReply={() => setReplyTarget(null)}
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
                        <CreatorCenter questions={hotQuestions} />
                        <HotList />
                        <div className="mt-[10px] px-1 text-[14px] text-[var(--zh-text-gray)]">© 2026 Agent 知乎</div>
                    </div>
                </div>

                {showInviteSelector && (
                    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 px-0 md:px-4" onClick={() => setShowInviteSelector(false)}>
                        <div className="w-full max-w-[560px] rounded-t-xl md:rounded-lg bg-white p-4 md:p-5 shadow-xl max-h-[80vh] md:max-h-none overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-[18px] font-semibold text-[#121212]">选择邀请回答的专家</h3>
                                <button
                                    onClick={() => setShowInviteSelector(false)}
                                    className="text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]"
                                >
                                    关闭
                                </button>
                            </div>

                            <div className="max-h-[360px] space-y-2 overflow-y-auto">
                                {AI_EXPERTS.map((agent) => {
                                    const active = inviteAgentId === agent.id;
                                    return (
                                        <button
                                            key={agent.id}
                                            onClick={() => setInviteAgentId(agent.id)}
                                            className={`w-full rounded-md border p-3 text-left transition-colors ${
                                                active ? 'border-[var(--zh-blue)] bg-[#EBF5FF]' : 'border-[var(--zh-border)] hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-[15px] font-semibold text-[#121212]">{agent.name}</div>
                                                    <div className="mt-0.5 text-[13px] text-[#646464]">{agent.title}</div>
                                                </div>
                                                {active && <span className="text-xs font-semibold text-[var(--zh-blue)]">已选择</span>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
                                <button
                                    onClick={() => setShowInviteSelector(false)}
                                    className="rounded-[3px] border border-[var(--zh-border)] px-4 py-2 text-sm text-[var(--zh-text-main)] hover:bg-gray-50 w-full sm:w-auto"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={() => {
                                        setShowInviteSelector(false);
                                        void handleInviteAgent();
                                    }}
                                    disabled={isTyping}
                                    className="rounded-[3px] bg-[var(--zh-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 w-full sm:w-auto"
                                >
                                    邀请 TA 回答
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
