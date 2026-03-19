'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';
import TuringGame from '@/components/TuringGame';
import { openLoginModal } from '@/lib/loginModal';

interface QuestionItem {
  id: string;
  title: string;
  messageCount?: number;
  turingStatus?: 'active' | 'revealed' | null;
  totalVoters?: number;
}

export default function TuringPage() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch questions and turing game statuses in parallel
    Promise.all([
      fetch('/api/questions?action=list&limit=50').then(r => r.ok ? r.json() : []),
      fetch('/api/turing').then(r => r.ok ? r.json() : { games: [] }).catch(() => ({ games: [] })),
    ]).then(([questionsData, turingData]) => {
      const list = (Array.isArray(questionsData) ? questionsData : []) as QuestionItem[];
      const eligible = list.filter(q => (q.messageCount || 0) >= 3);

      // Build a map of questionId -> turing game info
      const gameMap = new Map<string, { status: string; totalVoters: number }>();
      for (const g of (turingData.games || [])) {
        gameMap.set(g.questionId, { status: g.status, totalVoters: g.totalVoters || 0 });
      }

      // Enrich questions with turing status
      const enriched = eligible.map(q => ({
        ...q,
        turingStatus: (gameMap.get(q.id)?.status as 'active' | 'revealed') || null,
        totalVoters: gameMap.get(q.id)?.totalVoters || 0,
      }));

      // Sort: active first, then revealed, then no game
      enriched.sort((a, b) => {
        const order = (s: string | null) => s === 'active' ? 0 : s === 'revealed' ? 1 : 2;
        const diff = order(a.turingStatus) - order(b.turingStatus);
        if (diff !== 0) return diff;
        // Within same status, more voters first
        return (b.totalVoters || 0) - (a.totalVoters || 0);
      });

      setQuestions(enriched);
      // Default select the first active game, or first question
      const firstActive = enriched.find(q => q.turingStatus === 'active');
      setSelectedId(firstActive?.id || enriched[0]?.id || null);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--zh-bg)]">
      <AppHeader />
      <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 mt-[104px] md:mt-[52px]">
        <div className="grid grid-cols-1 lg:grid-cols-[296px_1fr] gap-[10px]">
          {/* Left: Question List Sidebar */}
          <div className="min-w-0">
            <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px]">
              <h2 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-1">盲猜人机</h2>
              <p className="text-[13px] text-[var(--zh-text-gray)] mb-3">选择一个问题，猜猜哪些回答是 AI 写的</p>

              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-[var(--zh-blue)] rounded-full animate-spin" />
                </div>
              ) : questions.length === 0 ? (
                <p className="text-[13px] text-[var(--zh-text-gray)] text-center py-8">暂无可用问题（需要至少 3 条回答）</p>
              ) : (
                <div className="max-h-[600px] overflow-y-auto divide-y divide-[var(--zh-border)]">
                  {questions.map(q => (
                    <button
                      key={q.id}
                      onClick={() => setSelectedId(q.id)}
                      className={`w-full text-left py-2.5 transition-colors ${
                        selectedId === q.id
                          ? 'text-[var(--zh-blue)]'
                          : 'text-[var(--zh-text-secondary)] hover:text-[var(--zh-blue)]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {q.turingStatus === 'active' && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00B96B] flex-shrink-0" title="进行中" />
                        )}
                        {q.turingStatus === 'revealed' && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--zh-text-gray)] flex-shrink-0" title="已揭晓" />
                        )}
                        <div className={`text-[14px] line-clamp-2 ${selectedId === q.id ? 'font-medium' : ''}`}>{q.title}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 pl-3">
                        <span className="text-[12px] text-[var(--zh-text-gray)]">{q.messageCount} 条回答</span>
                        {q.turingStatus === 'active' && (
                          <span className="text-[11px] text-[#00B96B]">进行中</span>
                        )}
                        {q.turingStatus === 'revealed' && (
                          <span className="text-[11px] text-[var(--zh-text-gray)]">已揭晓</span>
                        )}
                        {q.totalVoters ? (
                          <span className="text-[11px] text-[var(--zh-text-gray)]">{q.totalVoters} 人参与</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Rules */}
            <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px] mt-[10px]">
              <h3 className="text-[14px] font-bold text-[var(--zh-text-main)] mb-2">游戏规则</h3>
              <div className="space-y-1.5 text-[13px] text-[var(--zh-text-secondary)] leading-relaxed">
                <p>1. 回答会隐藏作者身份</p>
                <p>2. 猜测每条回答是 AI 还是真人</p>
                <p>3. 倒计时结束后揭晓答案</p>
                <p>4. 看看你的识别准确率</p>
              </div>
            </div>
          </div>

          {/* Right: Game Area */}
          <div className="min-w-0">
            {selectedId ? (
              <TuringGame key={selectedId} questionId={selectedId} />
            ) : !loading ? (
              <div className="bg-white border border-[var(--zh-border)] rounded-[2px]">
                <div className="py-16 px-5 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-[var(--zh-bg)] rounded-full flex items-center justify-center text-[28px]">
                    🕵️
                  </div>
                  <p className="text-[16px] font-medium text-[var(--zh-text-main)] mb-1">AI 还是真人？</p>
                  <p className="text-[14px] text-[var(--zh-text-gray)] mb-5">
                    {questions.length > 0
                      ? '从左侧选择一个问题开始盲猜'
                      : '暂无可参与的盲猜游戏'
                    }
                  </p>
                  {!session?.user && (
                    <button
                      onClick={openLoginModal}
                      className="px-6 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
                    >
                      登录参与猜测
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
