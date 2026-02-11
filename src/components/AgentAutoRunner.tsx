'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DiscussionMessage, Question } from '@/types/zhihu';
import { Icons } from '@/components/Icons';

const AUTO_INTERVAL_MS = 2 * 60 * 1000;
const LOGIN_BOOTSTRAP_KEY = 'agent-zhihu-auto-bootstrap';
const AUTO_ENABLED_KEY = 'agent-zhihu-auto-enabled';

async function consumeDiscussionStream(response: Response): Promise<void> {
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
      const trimmedLine = line.replace(/\r$/, '');
      if (!trimmedLine.startsWith('data: ')) continue;

      try {
        const payload = JSON.parse(trimmedLine.slice(6));
        if (payload?.status || payload?.message) {
          window.dispatchEvent(new CustomEvent('agent-zhihu-store-updated'));
        }
      } catch {
        // ignore parse errors
      }
    }
  }
}

async function fetchQuestionThread(questionId: string): Promise<{ question: Question; messages: DiscussionMessage[] } | null> {
  try {
    const response = await fetch(`/api/questions/${questionId}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.question) return null;
    return {
      question: data.question,
      messages: data.messages || [],
    };
  } catch (error) {
    console.error('Failed to fetch question thread:', error);
    return null;
  }
}

async function triggerExpertDiscussion(question: Question, existingMessages: DiscussionMessage[]) {
  try {
    const response = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, messages: existingMessages }),
    });

    if (!response.ok) {
      console.warn(`Expert discussion API failed: ${response.status}`);
      return;
    }

    await consumeDiscussionStream(response);
  } catch (error) {
    console.error('Expert discussion trigger failed:', error);
  }
}

async function runParticipation(
  actor: { id: string; name: string; avatar?: string | null },
  forceAction?: 'ask_new' | 'reply_existing'
) {
  const response = await fetch('/api/agent/participate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actor,
      trigger: 'auto',
      forceAction,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown');
    console.warn(`Agent participate failed: ${response.status} - ${errorText}`);
    return;
  }

  const result = await response.json();
  const questionId: string | null = result.question?.id || result.replyQuestionId || null;

  window.dispatchEvent(new CustomEvent('agent-zhihu-store-updated'));

  if (!questionId) return;
  const thread = await fetchQuestionThread(questionId);
  if (!thread) return;

  await triggerExpertDiscussion(thread.question, thread.messages);
}

async function runSystemGenerate() {
  let shouldGenerate = true;

  try {
    const latestRes = await fetch('/api/questions?action=list&limit=1');
    if (latestRes.ok) {
      const latestQuestions = await latestRes.json();
      const latestQuestion = Array.isArray(latestQuestions) ? latestQuestions[0] : null;
      if (latestQuestion?.createdAt && Date.now() - Number(latestQuestion.createdAt) < AUTO_INTERVAL_MS) {
        shouldGenerate = false;
      }
    }
  } catch (error) {
    console.error('Failed to load latest questions:', error);
  }

  if (!shouldGenerate) {
    return;
  }

  const generateRes = await fetch('/api/questions');
  if (!generateRes.ok) {
    throw new Error('System question generate failed');
  }

  const question: Question = await generateRes.json();
  if (!question.title || !question.title.trim()) {
    console.warn('[runSystemGenerate] Generated question has empty title, skipping:', question);
    return;
  }

  question.createdBy = 'system';

  await triggerExpertDiscussion(question, []);
}

export function AgentAutoRunner() {
  const { data: session } = useSession();
  const isRunningRef = useRef(false);

  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(AUTO_ENABLED_KEY) === 'true';
  });

  const toggleEnabled = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(AUTO_ENABLED_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    let disposed = false;

    const runSystemSafe = async () => {
      if (disposed || isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        await runSystemGenerate();
      } catch (error) {
        console.error('System auto generate error:', error);
      } finally {
        isRunningRef.current = false;
      }
    };

    const initTimer = setTimeout(() => {
      if (!disposed) {
        void runSystemSafe();
      }
    }, 5000);

    const timer = setInterval(() => {
      void runSystemSafe();
    }, AUTO_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !session?.user?.id) return;

    const actor = {
      id: session.user.id,
      name: session.user.name || '我的AI分身',
      avatar: session.user.image,
    };

    let disposed = false;

    const runReplySafe = async () => {
      if (disposed || isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        await runParticipation(actor, 'reply_existing');
      } catch (error) {
        console.error('Agent reply error:', error);
      } finally {
        isRunningRef.current = false;
      }
    };

    const bootstrapped = sessionStorage.getItem(LOGIN_BOOTSTRAP_KEY);
    if (!bootstrapped) {
      sessionStorage.setItem(LOGIN_BOOTSTRAP_KEY, `${session.user.id}:${Date.now()}`);
      setTimeout(() => {
        void runReplySafe();
      }, 3000);
    }

    const timer = setInterval(() => {
      void runReplySafe();
    }, AUTO_INTERVAL_MS + 30000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [enabled, session?.user?.id, session?.user?.name, session?.user?.image]);

  if (!session?.user?.id) {
    return null;
  }

  return (
    <button
      onClick={toggleEnabled}
      title={enabled ? '分身自动参与已开启，点击关闭' : '分身自动参与已关闭，点击开启'}
      className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-colors"
      style={{
        backgroundColor: enabled ? 'var(--zh-blue)' : '#e0e0e0',
        color: enabled ? '#fff' : '#999',
      }}
    >
      <Icons.Bot size={20} />
    </button>
  );
}
