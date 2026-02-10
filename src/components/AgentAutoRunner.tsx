'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { DiscussionMessage, Question } from '@/types/zhihu';

const AUTO_INTERVAL_MS = 2 * 60 * 1000;
const LOGIN_BOOTSTRAP_KEY = 'agent-zhihu-auto-bootstrap';

interface QuestionsStore {
  questions: Question[];
  messages: Record<string, DiscussionMessage[]>;
}

function loadStore(): QuestionsStore {
  try {
    const raw = localStorage.getItem('agent-zhihu-questions');
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load questions store:', error);
  }
  return { questions: [], messages: {} };
}

function saveStore(store: QuestionsStore) {
  try {
    localStorage.setItem('agent-zhihu-questions', JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save questions store:', error);
  }
}

async function runParticipation(
  actor: { id: string; name: string; avatar?: string | null },
  forceAction?: 'ask_new' | 'reply_existing'
) {
  const store = loadStore();

  const response = await fetch('/api/agent/participate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actor,
      questions: store.questions || [],
      messages: store.messages || {},
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
  const newQuestion: Question | null = result.question;
  const questionMessage: DiscussionMessage | null = result.questionMessage;
  const replyMessage: DiscussionMessage | null = result.replyMessage;
  const replyQuestionId: string | null = result.replyQuestionId;

  const nextStore: QuestionsStore = {
    questions: [...(store.questions || [])],
    messages: { ...(store.messages || {}) },
  };

  if (newQuestion && questionMessage) {
    nextStore.questions = [newQuestion, ...nextStore.questions].slice(0, 50);
    nextStore.messages[newQuestion.id] = [questionMessage];
  }

  if (replyMessage && replyQuestionId) {
    const existing = nextStore.messages[replyQuestionId] || [];
    nextStore.messages[replyQuestionId] = [...existing, replyMessage];

    nextStore.questions = nextStore.questions.map((question) =>
      question.id === replyQuestionId
        ? { ...question, status: 'active', discussionRounds: (question.discussionRounds || 0) + 1 }
        : question
    );
  }

  saveStore(nextStore);
  window.dispatchEvent(new CustomEvent('agent-zhihu-store-updated'));

  // 触发 AI 专家讨论
  const targetQuestion = newQuestion || (replyQuestionId ? nextStore.questions.find(q => q.id === replyQuestionId) : null);
  if (targetQuestion) {
    await triggerExpertDiscussion(targetQuestion, nextStore.messages[targetQuestion.id] || []);
  }
}

// 系统自动生成问题（不绑定用户账号）
async function runSystemGenerate() {
  const store = loadStore();

  // 检查最近是否有新问题（2分钟内）
  const latestQuestion = store.questions[0];
  if (latestQuestion && Date.now() - latestQuestion.createdAt < AUTO_INTERVAL_MS) {
    return; // 2分钟内有新问题，跳过
  }

  // 用 GET /api/questions 生成系统问题
  const res = await fetch('/api/questions');
  if (!res.ok) throw new Error('System question generate failed');

  const question: Question = await res.json();

  // 校验返回数据有效性
  if (!question.title || !question.title.trim()) {
    console.warn('[runSystemGenerate] Generated question has empty title, skipping:', question);
    return;
  }

  question.createdBy = 'system';

  const nextStore: QuestionsStore = {
    questions: [question, ...(store.questions || [])].slice(0, 50),
    messages: { ...(store.messages || {}), [question.id]: [] },
  };

  saveStore(nextStore);
  window.dispatchEvent(new CustomEvent('agent-zhihu-store-updated'));

  // 触发 AI 专家讨论
  await triggerExpertDiscussion(question, []);
}

// 触发 AI 专家讨论并保存结果
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

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    const collectedMessages = [...existingMessages];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.replace(/\r$/, '');
        if (trimmedLine.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmedLine.slice(6));

            // 单条消息事件（有 id 和 content）
            if (parsed.id && parsed.content && parsed.questionId) {
              collectedMessages.push(parsed);
              // 逐条保存到 localStorage
              const store = loadStore();
              store.messages[question.id] = [...collectedMessages];
              saveStore(store);
              window.dispatchEvent(new CustomEvent('agent-zhihu-store-updated'));
            }

            // 完成事件（有 status）
            if (parsed.status && parsed.messages) {
              const store = loadStore();
              const updatedQuestion = { ...question, status: parsed.status, discussionRounds: parsed.discussionRounds };
              store.questions = store.questions.map((q) =>
                q.id === question.id ? updatedQuestion : q
              );
              store.messages[question.id] = parsed.messages;
              saveStore(store);
              window.dispatchEvent(new CustomEvent('agent-zhihu-store-updated'));
            }
          } catch { }
        }
      }
    }
  } catch (error) {
    console.error('Expert discussion trigger failed:', error);
  }
}

export function AgentAutoRunner() {
  const { data: session } = useSession();
  const isRunningRef = useRef(false);
  const systemTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 系统定时器：不需要登录，2分钟无新问题就自动生成
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

    // 首次启动延迟检查
    const initTimer = setTimeout(() => {
      if (!disposed) runSystemSafe();
    }, 5000);

    systemTimerRef.current = setInterval(() => {
      runSystemSafe();
    }, AUTO_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      if (systemTimerRef.current) clearInterval(systemTimerRef.current);
    };
  }, []);

  // 用户分身定时器：登录后自动回复已有问题
  useEffect(() => {
    if (!session?.user?.id) return;

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

    // 登录后首次触发一次回复
    const bootstrapped = sessionStorage.getItem(LOGIN_BOOTSTRAP_KEY);
    if (!bootstrapped) {
      sessionStorage.setItem(LOGIN_BOOTSTRAP_KEY, `${session.user.id}:${Date.now()}`);
      setTimeout(() => runReplySafe(), 3000);
    }

    const timer = setInterval(() => {
      runReplySafe();
    }, AUTO_INTERVAL_MS + 30000); // 错开系统定时器

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [session?.user?.id, session?.user?.name, session?.user?.image]);

  return null;
}
