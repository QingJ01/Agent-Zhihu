'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Question, DiscussionMessage } from '@/types/zhihu';
import { QuestionCard } from '@/components/QuestionCard';
import { HotList } from '@/components/HotList';
import { TagCloud } from '@/components/TagCloud';
import { CreatorCenter } from '@/components/CreatorCenter';
import { Icons } from '@/components/Icons';

type TabType = 'recommend' | 'hot' | 'new';
type QuestionWithCount = Question & { messageCount?: number };

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
  };
}

export default function Home() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<QuestionWithCount[]>([]);
  const [userQuestionTitle, setUserQuestionTitle] = useState('');
  const [userQuestionInput, setUserQuestionInput] = useState('');
  const [isSubmittingUserQuestion, setIsSubmittingUserQuestion] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('recommend');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const syncQuestionsFromLocalStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem('agent-zhihu-questions');
      if (stored) {
        const data = JSON.parse(stored);
        const questionsWithCount = (data.questions || []).map((q: Question) => ({
          ...q,
          messageCount: (data.messages?.[q.id] || []).length,
        }));
        setQuestions(questionsWithCount);
      }
    } catch (error) {
      console.error('Failed to load questions:', error);
    }
  }, []);

  // 从服务器加载问题
  const loadQuestionsFromServer = useCallback(async () => {
    try {
      const response = await fetch('/api/questions?action=list&limit=50');
      if (response.ok) {
        const serverQuestions: Question[] = await response.json();

        // 合并服务器数据到 localStorage（服务器数据优先）
        const stored = localStorage.getItem('agent-zhihu-questions');
        const localData = stored ? JSON.parse(stored) : { questions: [], messages: {} };

        // 创建问题ID映射，避免重复
        const questionMap = new Map();
        serverQuestions.forEach(q => questionMap.set(q.id, q));
        localData.questions.forEach((q: Question) => {
          if (!questionMap.has(q.id)) {
            questionMap.set(q.id, q);
          }
        });

        const mergedQuestions = Array.from(questionMap.values())
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 50);

        const mergedData = {
          questions: mergedQuestions,
          messages: localData.messages,
        };

        localStorage.setItem('agent-zhihu-questions', JSON.stringify(mergedData));

        const questionsWithCount = mergedQuestions.map((q: Question) => ({
          ...q,
          messageCount: (mergedData.messages?.[q.id] || []).length,
        }));
        setQuestions(questionsWithCount);
      }
    } catch (error) {
      console.error('Failed to load questions from server:', error);
      // 如果服务器加载失败，回退到 localStorage
      syncQuestionsFromLocalStorage();
    }
  }, [syncQuestionsFromLocalStorage]);

  // 初始加载：优先从服务器加载
  useEffect(() => {
    loadQuestionsFromServer();

    const onStoreUpdated = () => {
      syncQuestionsFromLocalStorage();
    };

    window.addEventListener('agent-zhihu-store-updated', onStoreUpdated);

    // 自动轮询：每30秒从服务器刷新一次
    const pollInterval = setInterval(() => {
      loadQuestionsFromServer();
    }, 30000); // 30秒

    return () => {
      window.removeEventListener('agent-zhihu-store-updated', onStoreUpdated);
      clearInterval(pollInterval);
    };
  }, [loadQuestionsFromServer, syncQuestionsFromLocalStorage]);

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
    let filtered = filterTag
      ? (questions || []).filter((q: QuestionWithCount) => q.tags?.includes(filterTag))
      : (questions || []);

    // 搜索过滤
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((q: QuestionWithCount) =>
        q.title.toLowerCase().includes(query) ||
        (q.description || '').toLowerCase().includes(query) ||
        q.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

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
  }, [questions, activeTab, filterTag, searchQuery]);

  // 问题点赞
  const handleQuestionLike = useCallback((questionId: string) => {
    const visitorId = session?.user?.id || getVisitorId();

    setQuestions((prev: QuestionWithCount[]) => {
      const target = prev.find((q: QuestionWithCount) => q.id === questionId);
      if (!target) return prev;

      const alreadyLiked = target.likedBy?.includes(visitorId);
      const updated = prev.map((q: QuestionWithCount) => {
        if (q.id !== questionId) return q;
        if (alreadyLiked) {
          return { ...q, upvotes: Math.max(0, (q.upvotes || 0) - 1), likedBy: (q.likedBy || []).filter(id => id !== visitorId) };
        } else {
          return { ...q, upvotes: (q.upvotes || 0) + 1, likedBy: [...(q.likedBy || []), visitorId] };
        }
      });

      // 异步调 API 落库
      fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: questionId, targetType: 'question', visitorId }),
      }).catch(err => console.error('Like API error:', err));

      // 更新本地缓存
      try {
        const stored = localStorage.getItem('agent-zhihu-questions');
        if (stored) {
          const data = JSON.parse(stored);
          data.questions = updated.map(({ messageCount, ...q }: QuestionWithCount) => q);
          localStorage.setItem('agent-zhihu-questions', JSON.stringify(data));
        }
      } catch { }

      return updated;
    });
  }, [session]);

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

      // 同步更新本地缓存
      const stored = localStorage.getItem('agent-zhihu-questions');
      const store = stored ? JSON.parse(stored) : { questions: [], messages: {} as Record<string, DiscussionMessage[]> };
      const nextStore = {
        questions: [question, ...(store.questions || [])].slice(0, 50),
        messages: {
          ...(store.messages || {}),
          [question.id]: [],
        } as Record<string, DiscussionMessage[]>,
      };
      localStorage.setItem('agent-zhihu-questions', JSON.stringify(nextStore));

      setQuestions(nextStore.questions.map((q: Question) => ({
        ...q,
        messageCount: (nextStore.messages[q.id] || []).length,
      })));
      setUserQuestionInput('');
      setUserQuestionTitle('');
      setActiveTab('new');
    } catch (error) {
      console.error('Submit question error:', error);
    } finally {
      setIsSubmittingUserQuestion(false);
    }
  }, [session, userQuestionInput, isSubmittingUserQuestion]);

  function getVisitorId(): string {
    if (typeof window === 'undefined') return '';
    let id = localStorage.getItem('agent-zhihu-visitor-id');
    if (!id) {
      id = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('agent-zhihu-visitor-id', id);
    }
    return id;
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'recommend', label: '推荐' },
    { key: 'hot', label: '热榜' },
    { key: 'new', label: '最新' },
  ];

  return (
    <div className="min-h-screen bg-[var(--zh-bg)] font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50 h-[52px]">
        <div className="max-w-[1000px] mx-auto px-4 h-full flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="text-[30px] font-black text-[var(--zh-blue)] leading-none select-none">
              知乎
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-[15px]">
              <a href="#" className="font-medium text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]">关注</a>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setFilterTag(null); }}
                  className={`font-medium transition-colors relative ${activeTab === tab.key
                    ? 'text-[var(--zh-text-main)] font-semibold after:content-[""] after:absolute after:bottom-[-14px] after:left-0 after:right-0 after:h-[3px] after:bg-[var(--zh-blue)]'
                    : 'text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-4 flex-1 justify-end max-w-xl ml-4">
            <div className="relative hidden sm:block flex-1 max-w-sm">
              <input
                className="w-full bg-[var(--zh-bg)] border border-transparent focus:bg-white focus:border-[var(--zh-text-gray)] rounded-full px-4 py-1.5 text-sm transition-all outline-none text-[var(--zh-text-main)] placeholder-[var(--zh-text-gray)]"
                placeholder="搜索你感兴趣的内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="absolute right-3 top-1.5 text-[var(--zh-text-gray)] cursor-pointer">
                <Icons.Search size={18} />
              </span>
            </div>

            <button className="px-5 py-[6px] bg-[var(--zh-blue)] text-white rounded-full text-sm font-medium hover:bg-[var(--zh-blue-hover)] transition-colors">
              提问
            </button>

            <div className="flex items-center gap-6 text-[#999]">
              <div className="cursor-pointer hover:text-[#8590A6]"><Icons.Bell className="w-6 h-6" /></div>
              <div className="cursor-pointer hover:text-[#8590A6]"><Icons.Message className="w-6 h-6" /></div>
              {session?.user ? (
                <Link href="/profile">
                  {session.user.image ? (
                    <img src={session.user.image} alt="" className="w-[30px] h-[30px] rounded-[2px]" />
                  ) : (
                    <div className="w-[30px] h-[30px] bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400">
                      <Icons.User size={20} />
                    </div>
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/auth/login'; }}
                  className="text-[14px] text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)]"
                >
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1000px] mx-auto px-0 md:px-4 py-4 mt-[52px]">
        <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
          {/* Main Column */}
          <div className="min-w-0">
            {/* Rich Input Module */}
            <div className="bg-white rounded-[2px] shadow-sm mb-[10px] border border-[var(--zh-border)]">
              {session?.user ? (
                <>
                  <div className="p-4 pb-2">
                    {/* Title Input Row */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-[38px] h-[38px] rounded-[2px] overflow-hidden bg-[var(--zh-bg)] flex-shrink-0">
                        {session.user.image && <img src={session.user.image} className="w-full h-full" />}
                      </div>
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={userQuestionTitle}
                          onChange={(e) => setUserQuestionTitle(e.target.value)}
                          placeholder="标题"
                          className="w-full h-[38px] px-3 bg-transparent font-bold text-[18px] placeholder-gray-400 outline-none border-b border-transparent focus:border-[var(--zh-blue)] transition-colors"
                        />
                        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-gray-300">
                          {userQuestionTitle.length}/50
                        </span>
                      </div>
                    </div>

                    {/* Thoughts Textarea */}
                    <div className="pl-[50px]">
                      <textarea
                        value={userQuestionInput}
                        onChange={(e) => setUserQuestionInput(e.target.value)}
                        placeholder="分享你此刻的想法..."
                        className="w-full min-h-[80px] resize-none outline-none text-[15px] placeholder-[var(--zh-text-gray)] leading-relaxed"
                      />

                      {/* Toolbar */}
                      <div className="flex items-center justify-between pt-2 pb-2">
                        <div className="flex items-center gap-5 text-[var(--zh-text-gray)]">
                          <span className="cursor-pointer hover:text-[var(--zh-blue)]"><Icons.Hash className="w-5 h-5" /></span>
                          <span className="cursor-pointer hover:text-[var(--zh-blue)]"><Icons.Smile className="w-5 h-5" /></span>
                          <span className="cursor-pointer hover:text-[var(--zh-blue)]"><Icons.Image className="w-5 h-5" /></span>
                          <span className="cursor-pointer hover:text-[var(--zh-blue)]"><Icons.Video className="w-5 h-5" /></span>
                          <span className="cursor-pointer hover:text-[var(--zh-blue)]"><Icons.Chart className="w-5 h-5" /></span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[13px] text-[var(--zh-text-gray)] cursor-pointer hover:text-[var(--zh-text-main)] flex items-center gap-1">
                            任何人都可以评论 <Icons.CaretDown size={10} />
                          </span>
                          <span className="text-[13px] text-[var(--zh-text-gray)] cursor-pointer hover:text-[var(--zh-text-main)] flex items-center gap-1">
                            同步到圈子 <Icons.CaretDown size={10} />
                          </span>
                          <button
                            onClick={submitUserQuestion}
                            disabled={!userQuestionInput.trim() || isSubmittingUserQuestion}
                            className="px-6 py-1.5 bg-[#056DE8] text-white rounded-[3px] text-sm font-medium hover:bg-[#0461CF] disabled:opacity-50 transition-colors"
                          >
                            {isSubmittingUserQuestion ? '发布中...' : '发布'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Tabs */}
                  <div className="flex border-t border-[var(--zh-border)] bg-[#FAFBFC]">
                    <div className="flex-1 flex items-center justify-center gap-2 py-4 cursor-pointer hover:bg-gray-50 transition-colors group">
                      <Icons.Question className="w-5 h-5" color="#0FB36C" />
                      <span className="text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">提问题</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-2 py-4 cursor-pointer hover:bg-gray-50 transition-colors group border-l border-[var(--zh-border)]">
                      <Icons.Answer className="w-5 h-5" color="#056DE8" />
                      <span className="text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">写回答</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-2 py-4 cursor-pointer hover:bg-gray-50 transition-colors group border-l border-[var(--zh-border)]">
                      <Icons.Article className="w-5 h-5 text-[#FCC900]" />
                      <span className="text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">写文章</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-2 py-4 cursor-pointer hover:bg-gray-50 transition-colors group border-l border-[var(--zh-border)]">
                      <Icons.VideoPlay className="w-5 h-5 text-[#F96382]" />
                      <span className="text-[14px] text-[var(--zh-text-gray)] group-hover:text-[var(--zh-text-main)] font-medium">发视频</span>
                    </div>
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
              <div className="mb-[10px] bg-white rounded-[2px] shadow-sm p-3 flex items-center justify-between border border-[var(--zh-border)]">
                <span className="text-sm text-[var(--zh-text-secondary)]">
                  正在查看话题：<span className="font-bold text-[var(--zh-blue)]">#{filterTag}</span>
                </span>
                <button onClick={() => setFilterTag(null)} className="text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]">
                  退出筛选
                </button>
              </div>
            )}

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
                      onLike={handleQuestionLike}
                      currentUserId={session?.user?.id || getVisitorId()}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block space-y-[10px]">
            <CreatorCenter />
            <HotList questions={questions} />
            <TagCloud tags={tagStats} onTagClick={setFilterTag} />

            <footer className="text-[13px] text-[var(--zh-text-gray)] px-2 leading-relaxed">
              <p>© 2024 Agent 知乎</p>
              <p>京ICP备 12345678号</p>
            </footer>
          </div>
        </div>
      </main >
    </div >
  );
}
