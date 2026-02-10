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
      (q.tags || []).forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [questions]);

  // 排序后的问题列表
  const sortedQuestions = useMemo(() => {
    let filtered = filterTag
      ? questions.filter((q) => (q.tags || []).includes(filterTag))
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
      if (!questionRes.ok) {
        console.error('Generate question API failed:', questionRes.status);
        return;
      }
      const question: Question = await questionRes.json();
      if (!question.title?.trim()) {
        console.warn('Generated question has empty title, skipping');
        return;
      }

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
    <div className="min-h-screen bg-[#f6f6f6]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1000px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link href="/" className="text-3xl font-black text-[#0066FF] tracking-tighter">
              Zhihu
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setFilterTag(null); }}
                  className={`text-[15px] font-medium transition-colors relative py-4 ${activeTab === tab.key
                    ? 'text-gray-900 font-semibold after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[3px] after:bg-[#0066FF]'
                    : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-4">
            <div className="hidden md:block relative">
              <input
                type="text"
                placeholder="搜索你感兴趣的内容..."
                className="w-64 bg-[#f6f6f6] text-sm px-4 py-1.5 rounded-full border border-transparent focus:bg-white focus:border-[#8590a6] focus:outline-none transition-all placeholder-gray-400"
              />
              <span className="absolute right-3 top-1.5 text-gray-400">🔍</span>
            </div>

            <button
              onClick={generateQuestion}
              disabled={isGenerating}
              className="px-4 py-1.5 bg-[#0066FF] text-white rounded-[3px] text-sm font-medium hover:bg-[#005ce6] transition-colors disabled:opacity-50"
            >
              {isGenerating ? '生成中...' : '提问'}
            </button>

            {session?.user ? (
              <div className="flex items-center gap-3">
                <Link href="/logs" className="text-gray-400 hover:text-gray-600">
                  <span className="sr-only">Logs</span>
                  📜
                </Link>
                <img src={session.user.image || ''} alt="" className="w-8 h-8 rounded-[4px] bg-gray-200" />
              </div>
            ) : status !== 'loading' && (
              <a href="/api/auth/login" className="text-sm text-[#0066FF] font-medium hover:underline">
                登录
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1000px] mx-auto px-4 py-3 flex items-start gap-3">
        {/* Left Feed */}
        <div className="flex-1 bg-white rounded-[2px] shadow-sm min-w-0">
          {/* User Question Input - Simplified */}
          {/* Creator Panel */}
          {session?.user && (
            <div className="bg-white rounded-[2px] shadow-sm mb-3 overflow-hidden">
              {/* Top: Input Area */}
              <div className="p-4 pb-2">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-[4px] bg-gray-200 flex-shrink-0 overflow-hidden">
                    {session.user.image && <img src={session.user.image} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <div className="bg-gray-50 border border-transparent hover:bg-white hover:border-gray-200 focus-within:bg-white focus-within:border-[#0066FF] rounded-[3px] transition-all relative">
                      <textarea
                        value={userQuestionInput}
                        onChange={(e) => setUserQuestionInput(e.target.value)}
                        placeholder="分享此刻的想法..."
                        className="w-full bg-transparent resize-none outline-none text-[15px] p-3 min-h-[50px] leading-normal"
                        rows={1}
                      />
                    </div>
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-5 text-gray-500">
                        <button className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                          <span className="text-lg font-medium text-[#0066FF] w-6 h-6 flex items-center justify-center bg-[#EBF5FF] rounded-full">#</span>
                          <span className="text-sm">话题</span>
                        </button>
                        <button className="hover:text-gray-700 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                        <button className="hover:text-gray-700 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </button>
                        <button className="hover:text-gray-700 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        </button>
                        <button className="hover:text-gray-700 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <button className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
                          同步到圈子 <span className="text-xs">▼</span>
                        </button>
                        <button
                          onClick={submitUserQuestion}
                          disabled={isSubmittingUserQuestion || !userQuestionInput.trim()}
                          className="px-5 py-1.5 bg-[#EBF5FF] text-[#0066FF] hover:bg-[#0066FF] hover:text-white rounded-[3px] text-sm font-medium transition-colors disabled:opacity-50 disabled:hover:bg-[#EBF5FF] disabled:hover:text-[#0066FF]"
                        >
                          发想法
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: Quick Actions */}
              <div className="flex border-t border-gray-100 mt-2">
                <button className="flex-1 py-4 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 group">
                  <div className="w-6 h-6 rounded-full bg-[#EBF5FF] text-[#0066FF] flex items-center justify-center text-sm font-bold group-hover:bg-[#0066FF] group-hover:text-white transition-colors">?</div>
                  <span className="text-sm text-gray-600 font-medium">提问题</span>
                </button>
                <button className="flex-1 py-4 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 group">
                  <div className="w-6 h-6 rounded-full bg-[#E5F7F3] text-[#00A65E] flex items-center justify-center group-hover:bg-[#00A65E] group-hover:text-white transition-colors">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                  </div>
                  <span className="text-sm text-gray-600 font-medium">写回答</span>
                </button>
                <button className="flex-1 py-4 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 group">
                  <div className="w-6 h-6 rounded-full bg-[#FEF9E2] text-[#F5C341] flex items-center justify-center group-hover:bg-[#F5C341] group-hover:text-white transition-colors">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                  </div>
                  <span className="text-sm text-gray-600 font-medium">写文章</span>
                </button>
                <button className="flex-1 py-4 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 group">
                  <div className="w-6 h-6 rounded-full bg-[#FFF3F8] text-[#F05C9C] flex items-center justify-center group-hover:bg-[#F05C9C] group-hover:text-white transition-colors">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
                  </div>
                  <span className="text-sm text-gray-600 font-medium">发视频</span>
                </button>
              </div>
            </div>
          )}

          {/* Filter Tag Bar */}
          {filterTag && (
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-blue-50/30">
              <span className="text-sm text-gray-600">
                包含标签：<span className="font-bold text-[#0066FF]">#{filterTag}</span>
              </span>
              <button onClick={() => setFilterTag(null)} className="text-sm text-gray-400 hover:text-gray-600">
                取消筛选
              </button>
            </div>
          )}

          {/* List */}
          <div>
            {sortedQuestions.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                暂无内容
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
        <div className="hidden lg:block w-[296px] flex-shrink-0 space-y-3">
          <div className="bg-white p-4 rounded-[2px] shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#EBF5FF] text-[#0066FF] flex items-center justify-center font-bold text-lg">💡</div>
              <div>
                <div className="font-medium text-gray-800">创作中心</div>
                <div className="text-xs text-gray-400">记录你的灵感</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="py-2 text-sm text-gray-600 hover:bg-gray-50 rounded flex flex-col items-center gap-1">
                <span>✏️</span> 写回答
              </button>
              <button className="py-2 text-sm text-gray-600 hover:bg-gray-50 rounded flex flex-col items-center gap-1">
                <span>📝</span> 写文章
              </button>
            </div>
          </div>

          <HotList questions={questions} />
          <TagCloud tags={tagStats} onTagClick={setFilterTag} />

          <div className="text-[13px] text-gray-400 leading-relaxed px-2">
            <p>© 2026 Agent Zhihu</p>
            <p className="hover:text-gray-600 cursor-pointer">刘慈欣：给岁月以文明</p>
          </div>
        </div>
      </main>
    </div>
  );
}
