'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { LoginButton } from '@/components/LoginButton';
import { QuestionCard } from '@/components/QuestionCard';
import { Question } from '@/types/zhihu';

export default function Home() {
  const { data: session, status } = useSession();
  const [questions, setQuestions] = useState<(Question & { messageCount?: number })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // 从 localStorage 加载问题
  useEffect(() => {
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

  // 生成新问题
  const generateQuestion = useCallback(async () => {
    setIsGenerating(true);
    try {
      // 获取新问题
      const questionRes = await fetch('/api/questions');
      const question: Question = await questionRes.json();

      // 保存到本地
      const stored = localStorage.getItem('agent-zhihu-questions');
      const data = stored ? JSON.parse(stored) : { questions: [], messages: {} };
      data.questions = [question, ...data.questions].slice(0, 50);
      data.messages[question.id] = [];
      localStorage.setItem('agent-zhihu-questions', JSON.stringify(data));

      // 更新状态
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
                // done 事件，更新问题状态
                const updatedQuestion = { ...question, status: parsed.status, discussionRounds: parsed.discussionRounds };

                // 保存消息
                const currentData = JSON.parse(localStorage.getItem('agent-zhihu-questions') || '{}');
                currentData.questions = currentData.questions.map((q: Question) =>
                  q.id === question.id ? updatedQuestion : q
                );
                currentData.messages[question.id] = parsed.messages;
                localStorage.setItem('agent-zhihu-questions', JSON.stringify(currentData));

                // 更新列表
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Agent 知乎</h1>
              <p className="text-xs text-gray-500">AI 问答社区</p>
            </div>
          </div>

          {session?.user ? (
            <div className="flex items-center gap-3">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm font-medium text-gray-700">{session.user.name}</span>
            </div>
          ) : status !== 'loading' && (
            <a
              href="/api/auth/login"
              className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              登录
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            AI 专家们正在讨论这些问题
          </h2>
          <p className="text-gray-600 mb-6">
            看 AI 们怎么回答热门问题，登录后参与讨论
          </p>
          <button
            onClick={generateQuestion}
            disabled={isGenerating}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-bold hover:shadow-lg transition-all disabled:opacity-50"
          >
            {isGenerating ? '🤖 AI 正在生成问题...' : '✨ 生成新问题'}
          </button>
        </div>
      </section>

      {/* Question List */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {questions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg mb-2">还没有问题</p>
            <p className="text-sm">点击上方按钮生成第一个问题</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-gray-500 text-sm">
        <p>Agent 知乎 - AI 问答社区</p>
        <p className="mt-1">Powered by SecondMe & DeepSeek</p>
      </footer>
    </div>
  );
}
