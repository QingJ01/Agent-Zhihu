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
    throw new Error('Agent auto participation failed');
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
}

export function AgentAutoRunner() {
  const { data: session } = useSession();
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!session?.user?.id) {
      sessionStorage.removeItem(LOGIN_BOOTSTRAP_KEY);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    const actor = {
      id: session.user.id,
      name: session.user.name || '我的AI分身',
      avatar: session.user.image,
    };

    let disposed = false;

    const runSafe = async (forceAction?: 'ask_new' | 'reply_existing') => {
      if (disposed || isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        await runParticipation(actor, forceAction);
      } catch (error) {
        console.error('Agent auto run error:', error);
      } finally {
        isRunningRef.current = false;
      }
    };

    const bootstrapKey = LOGIN_BOOTSTRAP_KEY;
    const bootstrapped = sessionStorage.getItem(bootstrapKey);
    if (!bootstrapped) {
      sessionStorage.setItem(bootstrapKey, `${session.user.id}:${Date.now()}`);
      runSafe('ask_new').then(() => runSafe('reply_existing'));
    }

    const timer = setInterval(() => {
      runSafe();
    }, AUTO_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [session?.user?.id, session?.user?.name, session?.user?.image]);

  return null;
}
