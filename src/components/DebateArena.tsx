'use client';

import { useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DebateSession, DebateMessage, DebateSynthesis, OpponentProfile } from '@/types/secondme';
import { ChatList } from './ChatBubble';
import { SynthesisReport } from './SynthesisReport';
import { DebateHistory } from './DebateHistory';
import { useDebateHistory } from '@/lib/useDebateHistory';

interface StreamState {
  isStreaming: boolean;
  currentRole: 'user' | 'opponent' | null;
  currentContent: string;
}

export function DebateArena() {
  const { data: session } = useSession();
  const [topic, setTopic] = useState('');
  const [debate, setDebate] = useState<DebateSession | null>(null);
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [synthesis, setSynthesis] = useState<DebateSynthesis | null>(null);
  const [opponent, setOpponent] = useState<OpponentProfile | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({
    isStreaming: false,
    currentRole: null,
    currentContent: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { history, saveDebate } = useDebateHistory();

  const suggestedTopics = [
    'DeepSeek 会干掉 OpenAI 吗？',
    'AI 会取代程序员吗？',
    '996 是福报还是剥削？',
    '房价还会涨吗？',
    '学历重要还是能力重要？',
    '远程办公是未来趋势吗？',
  ];

  const startDebate = useCallback(async () => {
    if (!topic.trim() || !session?.user) return;

    // 重置状态
    setMessages([]);
    setSynthesis(null);
    setOpponent(null);
    setError(null);
    setShowReport(false);
    setStreamState({ isStreaming: true, currentRole: null, currentContent: '' });

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          userProfile: {
            id: session.user.id,
            name: session.user.name,
            avatar: session.user.image,
            bio: session.user.bio,
            softMemory: session.user.softMemory,
          },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('辩论生成失败');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let buffer = '';
      let debateId = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);

              // 处理不同事件
              if (parsed.opponentProfile) {
                // init 事件
                setOpponent(parsed.opponentProfile);
                debateId = parsed.id;
              } else if (parsed.role && parsed.name && !parsed.content && !parsed.timestamp) {
                // start 事件
                setStreamState({
                  isStreaming: true,
                  currentRole: parsed.role,
                  currentContent: '',
                });
              } else if (parsed.role && parsed.content && !parsed.timestamp) {
                // chunk 事件
                setStreamState((prev) => ({
                  ...prev,
                  currentContent: prev.currentContent + parsed.content,
                }));
              } else if (parsed.timestamp) {
                // message 事件 - 完整消息
                setMessages((prev) => [...prev, parsed as DebateMessage]);
                setStreamState({
                  isStreaming: true,
                  currentRole: null,
                  currentContent: '',
                });
              } else if (parsed.consensus) {
                // synthesis 事件
                setSynthesis(parsed as DebateSynthesis);
              } else if (parsed.messages) {
                // done 事件
                const completedDebate: DebateSession = {
                  id: debateId || `debate-${Date.now()}`,
                  topic: topic.trim(),
                  userProfile: {
                    id: session.user.id!,
                    name: session.user.name!,
                    avatar: session.user.image,
                    bio: session.user.bio,
                    softMemory: session.user.softMemory,
                  },
                  opponentProfile: opponent!,
                  messages: parsed.messages,
                  synthesis: parsed.synthesis,
                  status: 'completed',
                  createdAt: Date.now(),
                };
                setDebate(completedDebate);
                saveDebate(completedDebate);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : '发生未知错误');
    } finally {
      setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
    }
  }, [topic, session, opponent, saveDebate]);

  const loadHistoryDebate = useCallback((historicalDebate: DebateSession) => {
    setDebate(historicalDebate);
    setMessages(historicalDebate.messages);
    setSynthesis(historicalDebate.synthesis || null);
    setOpponent(historicalDebate.opponentProfile);
    setTopic(historicalDebate.topic);
    setShowHistory(false);
    setShowReport(false);
  }, []);

  if (!session?.user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">请先登录以开始辩论</p>
      </div>
    );
  }

  const isLoading = streamState.isStreaming;
  const displayMessages = streamState.currentRole
    ? [
      ...messages,
      {
        role: streamState.currentRole,
        name: streamState.currentRole === 'user' ? session.user.name! : opponent?.name || '对手',
        content: streamState.currentContent,
        timestamp: Date.now(),
      },
    ]
    : messages;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Topic Input */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">抛出你的问题</h2>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {showHistory ? '返回辩论' : `历史记录 (${history.length})`}
          </button>
        </div>

        {showHistory ? (
          <DebateHistory history={history} onSelect={loadHistoryDebate} />
        ) : (
          <>
            <div className="flex gap-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="输入一个有争议的话题..."
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && startDebate()}
                disabled={isLoading}
              />
              <button
                onClick={startDebate}
                disabled={isLoading || !topic.trim()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '对线中...' : '开始对线'}
              </button>
            </div>

            {/* Suggested Topics */}
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">热门话题：</p>
              <div className="flex flex-wrap gap-2">
                {suggestedTopics.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTopic(t)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
          {error}
        </div>
      )}

      {/* Debate Result */}
      {(displayMessages.length > 0 || isLoading) && opponent && !showHistory && (
        <div className="space-y-6">
          {/* Opponent Info */}
          <div className="bg-white rounded-2xl shadow-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-xl font-bold">
                {opponent.name.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-gray-800">{opponent.name}</p>
                <p className="text-sm text-gray-500">{opponent.title}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
                {opponent.stance}
              </span>
            </div>
          </div>

          {/* Toggle View */}
          {synthesis && (
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowReport(false)}
                className={`px-6 py-2 rounded-full font-medium transition-all ${!showReport
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                对话记录
              </button>
              <button
                onClick={() => setShowReport(true)}
                className={`px-6 py-2 rounded-full font-medium transition-all ${showReport
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                认知报告
              </button>
            </div>
          )}

          {/* Content */}
          {!showReport ? (
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
                <h3 className="text-white font-bold">辩论话题：{topic}</h3>
              </div>
              <div className="max-h-[500px] overflow-y-auto">
                <ChatList
                  messages={displayMessages}
                  userAvatar={session.user.image}
                  isGenerating={isLoading && streamState.currentRole !== null}
                  currentSpeaker={streamState.currentRole || undefined}
                />
              </div>
            </div>
          ) : (
            synthesis && (
              <SynthesisReport
                synthesis={synthesis}
                userName={session.user.name || '我的Agent'}
                opponentName={opponent.name}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
