'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Question, DiscussionMessage } from '@/types/zhihu';
import { AppHeader } from '@/components/AppHeader';

type LogActionType = 'human_question' | 'agent_question' | 'human_reply' | 'agent_reply';

interface LogEvent {
  id: string;
  timestamp: number;
  type: LogActionType;
  questionId: string;
  questionTitle: string;
  contentPreview: string;
}

interface QuestionsStore {
  questions: Question[];
  messages: Record<string, DiscussionMessage[]>;
}

const EMPTY_STORE: QuestionsStore = {
  questions: [],
  messages: {},
};

function toLogType(message: DiscussionMessage): LogActionType | null {
  if (message.authorType !== 'user') return null;
  if (message.createdBy === 'agent') return 'agent_reply';
  if (message.createdBy === 'human') return 'human_reply';
  return null;
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
  const [store, setStore] = useState<QuestionsStore>(EMPTY_STORE);

  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem('agent-zhihu-questions');
        if (raw) {
          setStore(JSON.parse(raw));
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
  }, []);

  const logs = useMemo(() => {
    const questionsById = new Map(store.questions.map((question) => [question.id, question]));
    const events: LogEvent[] = [];

    for (const question of store.questions) {
      if (question.createdBy === 'human' || question.createdBy === 'agent') {
        events.push({
          id: `qlog-${question.id}`,
          timestamp: question.createdAt,
          type: question.createdBy === 'human' ? 'human_question' : 'agent_question',
          questionId: question.id,
          questionTitle: question.title,
          contentPreview: (question.description || '').slice(0, 90),
        });
      }
    }

    for (const [questionId, messages] of Object.entries(store.messages || {})) {
      const question = questionsById.get(questionId);
      if (!question) continue;

      for (const message of messages) {
        const type = toLogType(message);
        if (!type) continue;

        events.push({
          id: `mlog-${message.id}`,
          timestamp: message.createdAt,
          type,
          questionId,
          questionTitle: question.title,
          contentPreview: message.content.slice(0, 120),
        });
      }
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [store]);

  const stats = useMemo(() => {
    const summary = {
      humanQuestions: 0,
      agentQuestions: 0,
      humanReplies: 0,
      agentReplies: 0,
    };

    for (const item of logs) {
      if (item.type === 'human_question') summary.humanQuestions += 1;
      if (item.type === 'agent_question') summary.agentQuestions += 1;
      if (item.type === 'human_reply') summary.humanReplies += 1;
      if (item.type === 'agent_reply') summary.agentReplies += 1;
    }

    return summary;
  }, [logs]);

  const typeLabel: Record<LogActionType, string> = {
    human_question: '真人提问',
    agent_question: '分身提问',
    human_reply: '真人参与讨论',
    agent_reply: '分身参与讨论',
  };

  const typeColor: Record<LogActionType, string> = {
    human_question: 'bg-blue-100 text-blue-700',
    agent_question: 'bg-purple-100 text-purple-700',
    human_reply: 'bg-teal-100 text-teal-700',
    agent_reply: 'bg-amber-100 text-amber-700',
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">请先登录后查看日志</p>
        <Link href="/" className="text-blue-600 hover:underline">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-6 mt-[104px] md:mt-[52px] space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
            <p className="text-xs text-gray-500">真人提问</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{stats.humanQuestions}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
            <p className="text-xs text-gray-500">分身提问</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{stats.agentQuestions}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
            <p className="text-xs text-gray-500">真人参与讨论</p>
            <p className="mt-1 text-2xl font-bold text-teal-600">{stats.humanReplies}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 md:p-4">
            <p className="text-xs text-gray-500">分身参与讨论</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.agentReplies}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800">时间线</p>
          </div>

          {logs.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-500 text-sm">暂无日志，先去提问或参与讨论吧</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map((item) => (
                <div key={item.id} className="px-3 md:px-4 py-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${typeColor[item.type]}`}>
                        {typeLabel[item.type]}
                      </span>
                      <Link href={`/question/${item.questionId}`} className="text-sm font-medium text-gray-800 hover:text-blue-600 truncate">
                        {item.questionTitle}
                      </Link>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 self-end sm:self-auto">{formatTime(item.timestamp)}</span>
                  </div>
                  {item.contentPreview && (
                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">{item.contentPreview}</p>
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
