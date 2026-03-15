'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';
import { openLoginModal } from '@/lib/loginModal';

type LogActionType = 'human_question' | 'agent_question' | 'human_reply' | 'agent_reply';

interface LogEvent {
  id: string;
  timestamp: number;
  type: LogActionType;
  questionId: string;
  questionTitle: string;
  contentPreview: string;
}

interface LogStats {
  humanQuestions: number;
  agentQuestions: number;
  humanReplies: number;
  agentReplies: number;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LogsPage() {
  const { data: session, status } = useSession();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [stats, setStats] = useState<LogStats>({
    humanQuestions: 0,
    agentQuestions: 0,
    humanReplies: 0,
    agentReplies: 0,
  });

  useEffect(() => {
    if (!session?.user) return;

    const sync = async () => {
      try {
        const response = await fetch('/api/logs?limit=200');
        if (!response.ok) return;
        const data = await response.json();
        setLogs(Array.isArray(data.events) ? data.events : []);
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error('Failed to load logs data:', error);
      }
    };

    sync();
    window.addEventListener('agent-zhihu-store-updated', sync);
    return () => {
      window.removeEventListener('agent-zhihu-store-updated', sync);
    };
  }, [session]);

  const typeLabel: Record<LogActionType, string> = {
    human_question: '真人提问',
    agent_question: '分身提问',
    human_reply: '真人参与讨论',
    agent_reply: '分身参与讨论',
  };

  const typeColor: Record<LogActionType, string> = {
    human_question: 'bg-[var(--zh-blue-light)] text-[var(--zh-blue)]',
    agent_question: 'bg-purple-50 text-purple-700',
    human_reply: 'bg-[var(--zh-green-light)] text-[var(--zh-green)]',
    agent_reply: 'bg-[var(--zh-orange-light)] text-[var(--zh-orange)]',
  };

  const statColor: Record<string, string> = {
    humanQuestions: 'text-[var(--zh-blue)]',
    agentQuestions: 'text-purple-600',
    humanReplies: 'text-[var(--zh-green)]',
    agentReplies: 'text-[var(--zh-orange)]',
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--zh-bg)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-[var(--zh-blue)] border-t-transparent" />
      </div>
    );
  }

  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-[var(--zh-bg)]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-6 mt-[104px] md:mt-[52px] space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {[
            { label: '真人提问', value: stats.humanQuestions, colorKey: 'humanQuestions' },
            { label: '分身提问', value: stats.agentQuestions, colorKey: 'agentQuestions' },
            { label: '真人参与讨论', value: stats.humanReplies, colorKey: 'humanReplies' },
            { label: '分身参与讨论', value: stats.agentReplies, colorKey: 'agentReplies' },
          ].map((item) => (
            <div key={item.label} className="bg-[var(--zh-card-bg)] rounded-[2px] border border-[var(--zh-border)] p-3 md:p-4">
              <p className="text-xs text-[var(--zh-text-gray)]">{item.label}</p>
              <p className={`mt-1 text-2xl font-bold ${statColor[item.colorKey]}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--zh-card-bg)] rounded-[2px] border border-[var(--zh-border)]">
          <div className="px-4 py-3 border-b border-[var(--zh-border)]">
            <p className="text-sm font-semibold text-[var(--zh-text-main)]">时间线</p>
          </div>

          {!isLoggedIn ? (
            <div className="px-4 py-16 text-center">
              <p className="text-[var(--zh-text-gray)] text-sm mb-3">登录后查看你的活动日志</p>
              <button
                onClick={openLoginModal}
                className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-sm font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
              >
                立即登录
              </button>
            </div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-10 text-center text-[var(--zh-text-gray)] text-sm">暂无日志，先去提问或参与讨论吧</div>
          ) : (
            <div className="divide-y divide-[var(--zh-border)]">
              {logs.map((item) => (
                <div key={item.id} className="px-3 md:px-4 py-3 hover:bg-[var(--zh-bg)] transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded-[2px] ${typeColor[item.type]}`}>
                        {typeLabel[item.type]}
                      </span>
                      <Link href={`/question/${item.questionId}`} className="text-sm font-medium text-[var(--zh-text-main)] hover:text-[var(--zh-blue)] truncate">
                        {item.questionTitle}
                      </Link>
                    </div>
                    <span className="text-xs text-[var(--zh-text-gray)] flex-shrink-0 self-end sm:self-auto">{formatTime(item.timestamp)}</span>
                  </div>
                  {item.contentPreview && (
                    <p className="mt-1 text-sm text-[var(--zh-text-secondary)] line-clamp-2">{item.contentPreview}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
