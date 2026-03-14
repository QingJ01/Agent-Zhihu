'use client';

import { useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DebateSession, DebateMessage, DebateSynthesis, OpponentProfile } from '@/types/secondme';
import { ChatList } from './ChatBubble';
import { SynthesisReport } from './SynthesisReport';
import { DebateHistory } from './DebateHistory';
import { useDebateHistory } from '@/lib/useDebateHistory';
import { OPPONENT_PROFILES } from '@/lib/opponents';

interface StreamState {
  isStreaming: boolean;
  currentRole: 'user' | 'opponent' | null;
  currentContent: string;
}

export function DebateArena() {
  const { data: session } = useSession();
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [synthesis, setSynthesis] = useState<DebateSynthesis | null>(null);
  const [opponent, setOpponent] = useState<OpponentProfile | null>(null);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>({
    isStreaming: false,
    currentRole: null,
    currentContent: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const opponentRef = useRef<OpponentProfile | null>(null);

  const TOTAL_ROUNDS = 5;
  const { history, saveDebate } = useDebateHistory(session?.user?.id);

  const suggestedTopics = [
    'DeepSeek 会干掉 OpenAI 吗？',
    'AI 会取代程序员吗？',
    '996 是福报还是剥削？',
    '房价还会涨吗？',
    '学历重要还是能力重要？',
    '远程办公是未来趋势吗？',
  ];

  const cancelDebate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
    setIsSynthesizing(false);
  }, []);

  const startDebate = useCallback(async () => {
    if (!topic.trim() || !session?.user) return;

    // 重置状态
    setMessages([]);
    setSynthesis(null);
    setOpponent(null);
    opponentRef.current = null;
    setError(null);
    setShowReport(false);
    setCurrentRound(0);
    setIsSynthesizing(false);
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
          opponentId: selectedOpponentId,
          userProfile: {
            id: session.user.id,
            name: session.user.name,
            avatar: session.user.image,
            bio: session.user.bio,
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
      let streamOpponent: OpponentProfile | null = null;

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
                streamOpponent = parsed.opponentProfile as OpponentProfile;
                setOpponent(streamOpponent);
                opponentRef.current = streamOpponent;
                debateId = parsed.id;
              } else if (parsed.role && parsed.name && !parsed.content && !parsed.timestamp) {
                // start 事件 — track round number from opponent starts
                if (parsed.role === 'opponent') {
                  setCurrentRound((prev) => prev + 1);
                }
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
              } else if ('consensus' in parsed && !parsed.messages) {
                // synthesis 事件
                setIsSynthesizing(false);
                setSynthesis(parsed as DebateSynthesis);
              } else if (Object.keys(parsed).length === 0) {
                // synthesizing 事件 (empty object)
                setIsSynthesizing(true);
              } else if (parsed.messages) {
                // done 事件
                const opponentProfile = streamOpponent || opponentRef.current;
                if (!opponentProfile) {
                  throw new Error('Missing opponent profile');
                }

                const completedDebate: DebateSession = {
                  id: debateId || `debate-${Date.now()}`,
                  topic: topic.trim(),
                  userProfile: {
                    id: session.user.id!,
                    name: session.user.name!,
                    avatar: session.user.image,
                    bio: session.user.bio,
                  },
                  opponentProfile,
                  messages: parsed.messages,
                  synthesis: parsed.synthesis,
                  status: 'completed',
                  createdAt: Date.now(),
                };
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
      setIsSynthesizing(false);
    }
  }, [topic, session, saveDebate, selectedOpponentId]);

  const loadHistoryDebate = useCallback((historicalDebate: DebateSession) => {
    setMessages(historicalDebate.messages);
    setSynthesis(historicalDebate.synthesis || null);
    setOpponent(historicalDebate.opponentProfile);
    opponentRef.current = historicalDebate.opponentProfile;
    setTopic(historicalDebate.topic);
    setShowHistory(false);
    setShowReport(false);
    setCurrentRound(TOTAL_ROUNDS);
    setIsSynthesizing(false);
  }, []);

  if (!session?.user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">请先登录以开始辩论</p>
      </div>
    );
  }

  const isLoading = streamState.isStreaming;
  // Only include partial streaming message if there's actual content;
  // otherwise ChatList will show a typing indicator via isGenerating prop
  const displayMessages = streamState.currentRole && streamState.currentContent
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

  const showTypingIndicator = isLoading && streamState.currentRole !== null && !streamState.currentContent;

  return (
    <div className="max-w-5xl mx-auto flex gap-6">
      {/* Main Column */}
      <div className="flex-1 min-w-0">
        {/* Topic Input */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">抛出你的观点，找人对线</h2>

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
            {isLoading ? (
              <button
                onClick={cancelDebate}
                className="px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all"
              >
                停止
              </button>
            ) : (
              <button
                onClick={startDebate}
                disabled={!topic.trim()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                开始对线
              </button>
            )}
          </div>

          {/* Suggested Topics */}
          {!isLoading && !opponent && (
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
          )}

          {/* Opponent Selection */}
          {!isLoading && !opponent && (
            <div className="mt-4">
              <p className="text-sm text-gray-500 mb-2">选择对手（不选则自动匹配）：</p>
              <div className="flex flex-wrap gap-2">
                {OPPONENT_PROFILES.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => setSelectedOpponentId(selectedOpponentId === op.id ? null : op.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all border ${
                      selectedOpponentId === op.id
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {op.name.charAt(0)}
                    </span>
                    <span className="flex flex-col items-start">
                      <span className="font-medium leading-tight">{op.name}</span>
                      <span className="text-xs text-gray-500 leading-tight">{op.stance}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
            {error}
          </div>
        )}

        {/* Debate Result */}
        {(displayMessages.length > 0 || isLoading) && opponent && (
          <div className="space-y-6">
            {/* Opponent Info + Round Progress */}
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
              <div className="flex items-center gap-3">
                {isLoading && (
                  <span className="text-sm text-gray-500 font-mono">
                    {isSynthesizing ? '生成报告中...' : `第 ${currentRound}/${TOTAL_ROUNDS} 轮`}
                  </span>
                )}
                <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
                  {opponent.stance}
                </span>
              </div>
            </div>

            {/* Round Progress Bar */}
            {isLoading && (
              <div className="bg-white rounded-xl shadow px-4 py-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>辩论进度</span>
                  <span>{isSynthesizing ? '生成报告...' : `${currentRound} / ${TOTAL_ROUNDS} 轮`}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isSynthesizing ? 'bg-purple-500 animate-pulse' : 'bg-gradient-to-r from-blue-500 to-purple-500'}`}
                    style={{ width: `${isSynthesizing ? 100 : (currentRound / TOTAL_ROUNDS) * 100}%` }}
                  />
                </div>
              </div>
            )}

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

            {/* Synthesizing indicator */}
            {isSynthesizing && (
              <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
                <div className="inline-flex items-center gap-3 text-purple-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent" />
                  <span className="font-medium">评审正在生成认知报告...</span>
                </div>
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
                    isGenerating={showTypingIndicator}
                    currentSpeaker={showTypingIndicator ? streamState.currentRole! : undefined}
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

      {/* Sidebar: History */}
      <div className="hidden lg:block w-72 flex-shrink-0">
        <div className="bg-white rounded-2xl shadow-lg p-4 sticky top-[68px]">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">历史记录 ({history.length})</h3>
          <DebateHistory history={history} onSelect={loadHistoryDebate} />
        </div>
      </div>

      {/* Mobile History Toggle */}
      <div className="lg:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
        >
          <span className="text-lg">📋</span>
        </button>
      </div>

      {/* Mobile History Drawer */}
      {showHistory && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setShowHistory(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-xl p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">历史记录 ({history.length})</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600 text-sm">关闭</button>
            </div>
            <DebateHistory history={history} onSelect={loadHistoryDebate} />
          </div>
        </div>
      )}
    </div>
  );
}
