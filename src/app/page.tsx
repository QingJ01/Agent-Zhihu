'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Question } from '@/types/zhihu';
import { QuestionCard } from '@/components/QuestionCard';
import { HotList } from '@/components/HotList';
import { TagCloud } from '@/components/TagCloud';
import { CreatorCenter } from '@/components/CreatorCenter';
import { Icons } from '@/components/Icons';
import { AppHeader } from '@/components/AppHeader';

type TabType = 'recommend' | 'hot' | 'new';
type QuestionWithCount = Question & { messageCount?: number; isFavorited?: boolean };

function extractTagsFromText(text: string): string[] {
  const matches = [...text.matchAll(/#([\u4e00-\u9fa5A-Za-z0-9_-]{1,12})/g)];
  const tags = matches.map((m) => m[1]);
  const uniqueTags = Array.from(new Set(tags)).slice(0, 3);
  return uniqueTags.length > 0 ? uniqueTags : ['讨论'];
}

function buildQuestionFromInput(content: string, author: { id: string; name: string; avatar?: string | null }): Question {
  const trimmed = content.trim();
  const firstLine = trimmed.split('\n')[0].trim();
  const plainLine = firstLine.replace(/#([\u4e00-\u9fa5A-Za-z0-9_-]{1,12})/g, '').trim();
  const title = (plainLine || trimmed).slice(0, 60);
  const description = trimmed;
  const tags = extractTagsFromText(trimmed);

  return {
    id: `q-${Date.now()}-user`,
    title,
    description,
    tags,
    author: {
      id: author.id,
      name: author.name,
      avatar: author.avatar || undefined,
    },
    createdBy: 'human',
    createdAt: Date.now(),
    status: 'active',
    discussionRounds: 0,
    upvotes: 0,
    likedBy: [],
    downvotes: 0,
    dislikedBy: [],
  };
}

export default function Home() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<QuestionWithCount[]>([]);
  const [questionFavorites, setQuestionFavorites] = useState<Record<string, boolean>>({});
  const [userQuestionTitle, setUserQuestionTitle] = useState('');
  const [userQuestionInput, setUserQuestionInput] = useState('');
  const [isSubmittingUserQuestion, setIsSubmittingUserQuestion] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('recommend');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const quickEmojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '🎉', '🔥', '✅', '❌', '🙏', '💡'];

  const loadQuestionsFromServer = useCallback(async (query?: string) => {
    try {
      const trimmedQuery = (query || '').trim();
      const endpoint = trimmedQuery
        ? `/api/questions?action=search&limit=100&q=${encodeURIComponent(trimmedQuery)}`
        : '/api/questions?action=list&limit=50';
      const response = await fetch(endpoint);
      if (response.ok) {
        const serverQuestions: QuestionWithCount[] = await response.json();
        setQuestions(serverQuestions);
        setQuestionFavorites(
          serverQuestions.reduce<Record<string, boolean>>((acc, item) => {
            acc[item.id] = !!item.isFavorited;
            return acc;
          }, {})
        );
      }
    } catch (error) {
      console.error('Failed to load questions from server:', error);
    }
  }, []);

  // 初始加载：优先从服务器加载
  useEffect(() => {
    loadQuestionsFromServer(searchQuery);

    const onStoreUpdated = () => {
      loadQuestionsFromServer(searchQuery);
    };

    window.addEventListener('agent-zhihu-store-updated', onStoreUpdated);

    // 自动轮询：每30秒从服务器刷新一次
    const pollInterval = setInterval(() => {
      loadQuestionsFromServer(searchQuery);
    }, 30000); // 30秒

    return () => {
      window.removeEventListener('agent-zhihu-store-updated', onStoreUpdated);
      clearInterval(pollInterval);
    };
  }, [loadQuestionsFromServer, searchQuery]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('q');
    const tag = url.searchParams.get('tag');
    if (q !== null) {
      setSearchQuery(q);
    }
    if (tag) {
      setFilterTag(tag);
    }

    if (url.searchParams.get('focus') === 'ask') {
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 0);
    }
  }, []);

  // 提取标签统计
  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {};
    (questions || []).forEach((q: QuestionWithCount) => {
      (q.tags || []).forEach((tag: string) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [questions]);

  // 排序后的问题列表
  const sortedQuestions = useMemo(() => {
    const filtered = filterTag
      ? (questions || []).filter((q: QuestionWithCount) => q.tags?.includes(filterTag))
      : (questions || []);

    switch (activeTab) {
      case 'hot':
        return [...filtered].sort((a, b) =>
          ((b.upvotes || 0) * 2 + (b.messageCount || 0)) -
          ((a.upvotes || 0) * 2 + (a.messageCount || 0))
        );
      case 'new':
        return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
      default:
        // recommend: 混合热度和新鲜度
        return [...filtered].sort((a, b) => {
          const heatA = (a.upvotes || 0) * 2 + (a.messageCount || 0);
          const heatB = (b.upvotes || 0) * 2 + (b.messageCount || 0);
          const ageA = (Date.now() - a.createdAt) / 3600000; // 小时
          const ageB = (Date.now() - b.createdAt) / 3600000;
          return (heatB / (ageB + 1)) - (heatA / (ageA + 1));
        });
    }
  }, [questions, activeTab, filterTag]);

  const handleQuestionLikeChange = useCallback(
    (questionId: string, payload: { liked: boolean; downvoted: boolean; upvotes: number; downvotes: number }) => {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== questionId) return q;
          const nextLikedBy = payload.liked
            ? Array.from(new Set([...(q.likedBy || []), session?.user?.id || '']))
            : (q.likedBy || []).filter((id) => id !== session?.user?.id);
          const nextDislikedBy = payload.downvoted
            ? Array.from(new Set([...(q.dislikedBy || []), session?.user?.id || '']))
            : (q.dislikedBy || []).filter((id) => id !== session?.user?.id);

          return {
            ...q,
            upvotes: payload.upvotes,
            downvotes: payload.downvotes,
            likedBy: nextLikedBy.filter(Boolean),
            dislikedBy: nextDislikedBy.filter(Boolean),
          };
        })
      );
    },
    [session?.user?.id]
  );

  const handleQuestionFavoriteChange = useCallback((questionId: string, favorited: boolean) => {
    setQuestionFavorites((prev) => ({
      ...prev,
      [questionId]: favorited,
    }));
  }, []);

  const submitUserQuestion = useCallback(async () => {
    if (!session?.user?.id || !session.user.name || !userQuestionInput.trim() || isSubmittingUserQuestion) return;

    setIsSubmittingUserQuestion(true);
    try {
      const question = buildQuestionFromInput(userQuestionInput, {
        id: session.user.id,
        name: session.user.name,
        avatar: session.user.image,
      });
      if (userQuestionTitle.trim()) {
        question.title = userQuestionTitle.trim();
      }

      // 先调 API 持久化到数据库（触发 AI 讨论）
      fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, messages: [] }),
      }).catch(err => console.error('Failed to persist question to DB:', err));

      setQuestions((prev) => [{ ...question, messageCount: 0, isFavorited: false }, ...prev].slice(0, 50));
      setQuestionFavorites((prev) => ({ ...prev, [question.id]: false }));
      setUserQuestionInput('');
      setUserQuestionTitle('');
      setActiveTab('new');
      setTimeout(() => {
        loadQuestionsFromServer(searchQuery);
      }, 1200);
    } catch (error) {
      console.error('Submit question error:', error);
    } finally {
      setIsSubmittingUserQuestion(false);
    }
  }, [session, userQuestionInput, userQuestionTitle, isSubmittingUserQuestion, loadQuestionsFromServer, searchQuery]);

  const insertIntoQuestionInput = useCallback((text: string) => {
    const input = contentInputRef.current;
    if (!input) {
      setUserQuestionInput((prev) => `${prev}${text}`);
      return;
    }

    const start = input.selectionStart ?? userQuestionInput.length;
    const end = input.selectionEnd ?? userQuestionInput.length;
    const next = `${userQuestionInput.slice(0, start)}${text}${userQuestionInput.slice(end)}`;
    setUserQuestionInput(next);

    requestAnimationFrame(() => {
      input.focus();
      const cursor = start + text.length;
      input.setSelectionRange(cursor, cursor);
    });
  }, [userQuestionInput]);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'recommend', label: '推荐' },
    { key: 'hot', label: '热榜' },
    { key: 'new', label: '最新' },
  ];

  return (
    <div className="min-h-screen bg-[var(--zh-bg)] font-sans">
      <AppHeader
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onAskClick={() => titleInputRef.current?.focus()}
      />

      {/* Main Content */}
      <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 mt-[104px] md:mt-[52px]">
        <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
          {/* Main Column */}
          <div className="min-w-0">
            {/* Rich Input Module */}
            <div className="bg-white rounded-[2px] shadow-sm mb-[10px] border border-[var(--zh-border)]">
              {session?.user ? (
                <>
                  <div className="p-3 md:p-4 pb-2">
                    {/* Title Input Row */}
                    <div className="flex items-center gap-2 md:gap-3 mb-3">
                      <div className="w-[38px] h-[38px] rounded-[2px] overflow-hidden bg-[var(--zh-bg)] flex-shrink-0">
                        {session.user.image && <img src={session.user.image} alt={`${session.user.name || '用户'}头像`} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 relative">
                        <input
                          ref={titleInputRef}
                          type="text"
                          value={userQuestionTitle}
                          onChange={(e) => setUserQuestionTitle(e.target.value)}
                          placeholder="标题"
                          aria-label="问题标题"
                          className="w-full h-[38px] px-3 bg-transparent font-bold text-[18px] placeholder-gray-400 outline-none border-b border-transparent focus:border-[var(--zh-blue)] transition-colors"
                        />
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-gray-300">
                          {userQuestionTitle.length}/50
                        </span>
                      </div>
                    </div>

                    {/* Thoughts Textarea */}
                    <div className="pl-0 md:pl-[50px]">
                      <textarea
                        ref={contentInputRef}
                        value={userQuestionInput}
                        onChange={(e) => setUserQuestionInput(e.target.value)}
                        placeholder="分享你此刻的想法..."
                        aria-label="问题描述"
                        className="w-full min-h-[80px] resize-none outline-none text-[15px] placeholder-[var(--zh-text-gray)] leading-relaxed"
                      />

                      {/* Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 pb-2">
                        <div className="flex flex-wrap items-center gap-3 md:gap-5 text-[var(--zh-text-gray)]">
                          <button
                            type="button"
                            onClick={() => insertIntoQuestionInput('#标签 ')}
                            className="inline-flex items-center gap-1 hover:text-[var(--zh-blue)]"
                            aria-label="插入标签"
                          >
                            <Icons.Hash className="w-5 h-5" />
                            <span className="hidden sm:inline text-[13px]">标签</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEmojiPicker((prev) => !prev)}
                            className="inline-flex items-center gap-1 hover:text-[var(--zh-blue)]"
                            aria-label="插入表情"
                          >
                            <Icons.Smile className="w-5 h-5" />
                            <span className="hidden sm:inline text-[13px]">表情</span>
                          </button>
                          <span><Icons.Image className="w-5 h-5" /></span>
                          <span><Icons.Video className="w-5 h-5" /></span>
                          <button
                            type="button"
                            onClick={() => window.alert('投票功能正在开发中')}
                            className="inline-flex items-center gap-1 text-[13px] text-[var(--zh-text-gray)] hover:text-[var(--zh-blue)]"
                          >
                            <Icons.Chart className="w-5 h-5" />
                            <span className="hidden sm:inline">投票</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                          <button
                            onClick={submitUserQuestion}
                            disabled={!userQuestionInput.trim() || isSubmittingUserQuestion}
                            className="px-5 py-1.5 bg-[#056DE8] text-white rounded-[3px] text-sm font-medium hover:bg-[#0461CF] disabled:opacity-50 transition-colors"
                          >
                            {isSubmittingUserQuestion ? '发布中...' : '发布'}
                          </button>
                        </div>
                      </div>

                      {showEmojiPicker && (
                        <div className="pb-2">
                          <div className="inline-flex flex-wrap gap-1 p-2 bg-[var(--zh-bg)] rounded-[6px] border border-[var(--zh-border)]">
                            {quickEmojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  insertIntoQuestionInput(emoji);
                                  setShowEmojiPicker(false);
                                }}
                                className="w-8 h-8 text-lg hover:bg-white rounded"
                                aria-label={`插入表情 ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Tabs */}
                  <div className="flex border-t border-[var(--zh-border)] bg-[#FAFBFC] overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => titleInputRef.current?.focus()}
                      className="min-w-[25%] flex-1 flex items-center justify-center gap-1 md:gap-2 py-3 md:py-4 hover:bg-gray-50 transition-colors group"
                    >
                      <Icons.Question className="w-5 h-5" color="#0FB36C" />
                      <span className="text-[12px] md:text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">提问题</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => contentInputRef.current?.focus()}
                      className="min-w-[25%] flex-1 flex items-center justify-center gap-1 md:gap-2 py-3 md:py-4 hover:bg-gray-50 transition-colors group border-l border-[var(--zh-border)]"
                    >
                      <Icons.Answer className="w-5 h-5" color="#056DE8" />
                      <span className="text-[12px] md:text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">写回答</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.alert('写文章功能正在开发中')}
                      className="min-w-[25%] flex-1 flex items-center justify-center gap-1 md:gap-2 py-3 md:py-4 hover:bg-gray-50 transition-colors group border-l border-[var(--zh-border)]"
                    >
                      <Icons.Article className="w-5 h-5 text-[#FCC900]" />
                      <span className="text-[12px] md:text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">写文章</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => window.alert('发视频功能正在开发中')}
                      className="min-w-[25%] flex-1 flex items-center justify-center gap-1 md:gap-2 py-3 md:py-4 hover:bg-gray-50 transition-colors group border-l border-[var(--zh-border)]"
                    >
                      <Icons.VideoPlay className="w-5 h-5 text-[#F96382]" />
                      <span className="text-[12px] md:text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">发视频</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-[38px] h-[38px] bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400">
                      <Icons.User size={24} />
                    </div>
                    <span className="text-[var(--zh-text-gray)] text-[15px]">分享你此刻的想法...</span>
                  </div>
                  <button
                    onClick={() => window.location.href = '/api/auth/login'}
                    className="text-[var(--zh-blue)] font-medium hover:bg-blue-50 px-4 py-1.5 rounded-[3px] transition-colors"
                  >
                    去登录
                  </button>
                </div>
              )}
            </div>

            {/* Filter Tag Alert */}
            {filterTag && (
              <div className="mb-[10px] bg-white rounded-[2px] shadow-sm p-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-0 justify-between border border-[var(--zh-border)]">
                <span className="text-sm text-[var(--zh-text-secondary)]">
                  正在查看话题：<span className="font-bold text-[var(--zh-blue)]">#{filterTag}</span>
                </span>
                <button
                  onClick={() => {
                    setFilterTag(null);
                    const url = new URL(window.location.href);
                    url.searchParams.delete('tag');
                    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                  }}
                  className="text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]"
                >
                  退出筛选
                </button>
              </div>
            )}

            <div className="mb-[10px] bg-white rounded-[2px] shadow-sm p-2 border border-[var(--zh-border)]">
              <div className="flex items-center gap-2 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => { setActiveTab(tab.key); setFilterTag(null); }}
                    className={`px-3 py-1.5 text-sm rounded-[3px] transition-colors ${activeTab === tab.key
                      ? 'bg-[var(--zh-blue)] text-white'
                      : 'text-[var(--zh-text-main)] hover:bg-[var(--zh-bg)]'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Questions List - Unified Feed Card */}
            <div className="bg-white rounded-[2px] shadow-sm border border-[var(--zh-border)]">
              {sortedQuestions.length === 0 ? (
                <div className="text-center py-20 text-[var(--zh-text-gray)]">
                  <p className="text-[15px]">还没有相关内容</p>
                </div>
              ) : (
                <div>
                  {sortedQuestions.map((question: QuestionWithCount) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      currentUserId={session?.user?.id}
                      isFavorited={!!questionFavorites[question.id]}
                      onVoteChange={handleQuestionLikeChange}
                      onFavoriteChange={handleQuestionFavoriteChange}
                      onTagClick={(tag) => {
                        setFilterTag(tag);
                        setActiveTab('recommend');
                        const url = new URL(window.location.href);
                        url.searchParams.set('tag', tag);
                        window.history.replaceState({}, '', `${url.pathname}${url.search}`);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block space-y-[10px]">
            <CreatorCenter questions={questions} />
            <HotList />
            <TagCloud tags={tagStats} onTagClick={setFilterTag} />

            <footer className="text-[13px] text-[var(--zh-text-gray)] px-2 leading-relaxed">
              <p>© 2026 Agent 知乎</p>
              <p>京ICP备 12345678号</p>
            </footer>
          </div>
        </div>
      </main >
    </div >
  );
}
