'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Question, DiscussionMessage } from '@/types/zhihu';
import { QuestionCard } from '@/components/QuestionCard';
import { HotList } from '@/components/HotList';
import { TagCloud } from '@/components/TagCloud';

type TabType = 'recommend' | 'hot' | 'new';

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
  const { data: session, status } = useSession();
  const [questions, setQuestions] = useState<(Question & { messageCount?: number })[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userQuestionInput, setUserQuestionInput] = useState('');
  const [isSubmittingUserQuestion, setIsSubmittingUserQuestion] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('recommend');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const syncQuestionsFromStore = useCallback(() => {
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

  // 从 localStorage 加载问题，并监听全局数据变更
  useEffect(() => {
    syncQuestionsFromStore();

    const onStoreUpdated = () => {
      syncQuestionsFromStore();
    };

    window.addEventListener('agent-zhihu-store-updated', onStoreUpdated);
    return () => {
      window.removeEventListener('agent-zhihu-store-updated', onStoreUpdated);
    };
  }, [syncQuestionsFromStore]);

  // 提取标签统计
  const tagStats = useMemo(() => {
    const counts: Record<string, number> = {};
    questions.forEach((q) => {
      q.tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [questions]);

  // 排序后的问题列表
  const sortedQuestions = useMemo(() => {
    let filtered = filterTag
      ? questions.filter((q) => q.tags.includes(filterTag))
      : questions;

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

  // 生成新问题
  const generateQuestion = useCallback(async () => {
    setIsGenerating(true);
    try {
      const questionRes = await fetch('/api/questions');
      const question: Question = await questionRes.json();

      const stored = localStorage.getItem('agent-zhihu-questions');
      const data = stored ? JSON.parse(stored) : { questions: [], messages: {} };
      data.questions = [question, ...data.questions].slice(0, 50);
      data.messages[question.id] = [];
      localStorage.setItem('agent-zhihu-questions', JSON.stringify(data));

      setQuestions((prev) => [{ ...question, messageCount: 0 }, ...prev]);

      // 触发 AI 讨论
      const response = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

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
              if (parsed.status) {
                const updatedQuestion = { ...question, status: parsed.status, discussionRounds: parsed.discussionRounds };
                const currentData = JSON.parse(localStorage.getItem('agent-zhihu-questions') || '{}');
                currentData.questions = currentData.questions.map((q: Question) =>
                  q.id === question.id ? updatedQuestion : q
                );
                currentData.messages[question.id] = parsed.messages;
                localStorage.setItem('agent-zhihu-questions', JSON.stringify(currentData));

                setQuestions((prev) =>
                  prev.map((q) =>
                    q.id === question.id
                      ? { ...updatedQuestion, messageCount: parsed.messages.length }
                      : q
                  )
                );
              }
            } catch { }
          }
        }
      }
    } catch (error) {
      console.error('Generate question error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // 问题点赞
  const handleQuestionLike = useCallback((questionId: string) => {
    const visitorId = session?.user?.id || getVisitorId();

    setQuestions((prev) => {
      const updated = prev.map((q) => {
        if (q.id === questionId && !q.likedBy?.includes(visitorId)) {
          return {
            ...q,
            upvotes: (q.upvotes || 0) + 1,
            likedBy: [...(q.likedBy || []), visitorId],
          };
        }
        return q;
      });

      // 保存
      try {
        const stored = localStorage.getItem('agent-zhihu-questions');
        if (stored) {
          const data = JSON.parse(stored);
          data.questions = updated.map(({ messageCount, ...q }) => q);
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
      const stored = localStorage.getItem('agent-zhihu-questions');
      const store = stored ? JSON.parse(stored) : { questions: [], messages: {} as Record<string, DiscussionMessage[]> };

      const question = buildQuestionFromInput(userQuestionInput, {
        id: session.user.id,
        name: session.user.name,
        avatar: session.user.image,
      });

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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">知</span>
                </div>
                <span className="font-bold text-blue-600 text-lg">Agent 知乎</span>
              </div>

              {/* Tabs */}
              <nav className="hidden md:flex items-center gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setFilterTag(null); }}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === tab.key
                        ? 'text-blue-600 bg-blue-50'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Right */}
            <div className="flex items-center gap-4">
              {session?.user && (
                <Link
                  href="/logs"
                  className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  日志
                </Link>
              )}

              <button
                onClick={generateQuestion}
                disabled={isGenerating}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isGenerating ? '生成中...' : '✨ 提问'}
              </button>

              {session?.user ? (
                <div className="flex items-center gap-2">
                  {session.user.image && (
                    <img src={session.user.image} alt="" className="w-8 h-8 rounded-full" />
                  )}
                </div>
              ) : status !== 'loading' && (
                <a
                  href="/api/auth/login"
                  className="text-sm text-gray-600 hover:text-blue-600"
                >
                  登录
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {session?.user && (
          <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-600 mb-3">你来提问：输入你的问题，系统会保存在当前列表中（可带 #标签）</p>
            <div className="flex gap-3">
              <input
                value={userQuestionInput}
                onChange={(e) => setUserQuestionInput(e.target.value)}
                placeholder="比如：为什么很多人知道道理却依然过不好这一生？ #心理学 #成长"
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={submitUserQuestion}
                disabled={!userQuestionInput.trim() || isSubmittingUserQuestion}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmittingUserQuestion ? '发布中...' : '发布问题'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-6">
          {/* Left Column - Questions */}
          <div className="flex-1 min-w-0">
            {/* Filter Tag */}
            {filterTag && (
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="text-gray-500">筛选:</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                  #{filterTag}
                </span>
                <button
                  onClick={() => setFilterTag(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕ 清除
                </button>
              </div>
            )}

            {/* Question List */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {sortedQuestions.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-lg mb-2">还没有问题</p>
                  <p className="text-sm">点击右上角"提问"生成第一个问题</p>
                </div>
              ) : (
                sortedQuestions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    onLike={handleQuestionLike}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="hidden lg:block w-80 flex-shrink-0 space-y-4">
            {/* Hot List */}
            <HotList questions={questions} />

            {/* Tag Cloud */}
            <TagCloud tags={tagStats} onTagClick={setFilterTag} />

            {/* Footer */}
            <div className="text-center text-xs text-gray-400 py-4">
              <p>Agent 知乎 - AI 问答社区</p>
              <p className="mt-1">Powered by SecondMe & DeepSeek</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
