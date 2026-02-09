'use client';

import { useState, useEffect, useCallback } from 'react';
import { Question, DiscussionMessage, QuestionsStore } from '@/types/zhihu';

const STORAGE_KEY = 'agent-zhihu-questions';
const MAX_QUESTIONS = 50;

const defaultStore: QuestionsStore = {
    questions: [],
    messages: {},
};

export function useQuestions() {
    const [store, setStore] = useState<QuestionsStore>(defaultStore);
    const [isLoaded, setIsLoaded] = useState(false);

    // 加载数据
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setStore(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Failed to load questions:', error);
        }
        setIsLoaded(true);
    }, []);

    // 保存数据
    const saveStore = useCallback((newStore: QuestionsStore) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newStore));
        } catch (error) {
            console.error('Failed to save questions:', error);
        }
    }, []);

    // 添加问题
    const addQuestion = useCallback((question: Question) => {
        setStore((prev) => {
            const updated = {
                ...prev,
                questions: [question, ...prev.questions].slice(0, MAX_QUESTIONS),
                messages: { ...prev.messages, [question.id]: [] },
            };
            saveStore(updated);
            return updated;
        });
    }, [saveStore]);

    // 更新问题状态
    const updateQuestion = useCallback((questionId: string, updates: Partial<Question>) => {
        setStore((prev) => {
            const updated = {
                ...prev,
                questions: prev.questions.map((q) =>
                    q.id === questionId ? { ...q, ...updates } : q
                ),
            };
            saveStore(updated);
            return updated;
        });
    }, [saveStore]);

    // 添加讨论消息
    const addMessage = useCallback((questionId: string, message: DiscussionMessage) => {
        setStore((prev) => {
            const messages = prev.messages[questionId] || [];
            const updated = {
                ...prev,
                messages: {
                    ...prev.messages,
                    [questionId]: [...messages, message],
                },
            };
            saveStore(updated);
            return updated;
        });
    }, [saveStore]);

    // 获取问题详情
    const getQuestion = useCallback((questionId: string) => {
        const question = store.questions.find((q) => q.id === questionId);
        const messages = store.messages[questionId] || [];
        return question ? { ...question, messages } : null;
    }, [store]);

    // 获取问题列表
    const getQuestions = useCallback(() => {
        return store.questions.map((q) => ({
            ...q,
            messageCount: (store.messages[q.id] || []).length,
        }));
    }, [store]);

    // 删除问题
    const deleteQuestion = useCallback((questionId: string) => {
        setStore((prev) => {
            const { [questionId]: _, ...restMessages } = prev.messages;
            const updated = {
                questions: prev.questions.filter((q) => q.id !== questionId),
                messages: restMessages,
            };
            saveStore(updated);
            return updated;
        });
    }, [saveStore]);

    return {
        isLoaded,
        questions: store.questions,
        addQuestion,
        updateQuestion,
        addMessage,
        getQuestion,
        getQuestions,
        deleteQuestion,
    };
}
