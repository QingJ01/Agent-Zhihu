'use client';

import { useState, useCallback, useEffect } from 'react';
import { DebateSession } from '@/types/secondme';

const STORAGE_KEY = 'agent-zhihu-debate-history';
const MAX_HISTORY = 20;

export function useDebateHistory(userId?: string) {
    const [history, setHistory] = useState<DebateSession[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // 首次加载：优先从 API 获取，回退到 localStorage
    useEffect(() => {
        const load = async () => {
            if (userId) {
                try {
                    const res = await fetch(`/api/debate/history?userId=${userId}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            setHistory(data);
                            setIsLoaded(true);
                            return;
                        }
                    }
                } catch (e) {
                    console.error('Failed to load debate history from API:', e);
                }
            }

            // Fallback to localStorage
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        setHistory(parsed);
                    }
                }
            } catch (error) {
                console.error('Failed to load debate history:', error);
            }
            setIsLoaded(true);
        };
        load();
    }, [userId]);

    // 保存辩论（同时写 localStorage 缓存）
    const saveDebate = useCallback((debate: DebateSession) => {
        setHistory((prev) => {
            const filtered = prev.filter((d) => d.id !== debate.id);
            const updated = [debate, ...filtered].slice(0, MAX_HISTORY);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } catch (error) {
                console.error('Failed to save debate history:', error);
            }
            return updated;
        });
    }, []);

    // 删除辩论
    const deleteDebate = useCallback((debateId: string) => {
        setHistory((prev) => {
            const updated = prev.filter((d) => d.id !== debateId);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            } catch (error) {
                console.error('Failed to delete debate:', error);
            }
            return updated;
        });
    }, []);

    // 清空历史
    const clearHistory = useCallback(() => {
        setHistory([]);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear history:', error);
        }
    }, []);

    // 获取单个辩论
    const getDebate = useCallback((debateId: string) => {
        return history.find((d) => d.id === debateId);
    }, [history]);

    return {
        history,
        isLoaded,
        saveDebate,
        deleteDebate,
        clearHistory,
        getDebate,
    };
}
