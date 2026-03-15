'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { DebateSession, DebateMessage, DebateSynthesis, OpponentProfile } from '@/types/secondme';
import { SynthesisReport } from './SynthesisReport';
import { DebateHistory } from './DebateHistory';
import { useDebateHistory } from '@/lib/useDebateHistory';
import { OPPONENT_PROFILES } from '@/lib/opponents';
import { openLoginModal } from '@/lib/loginModal';
import { consumeSSEStream } from '@/lib/useSSEStream';
import Image from 'next/image';

export type DebateMode = 'agent-vs-agent' | 'agent-vs-user-agent' | 'agent-vs-user';

interface StreamState {
  isStreaming: boolean;
  currentRole: 'user' | 'opponent' | null;
  currentContent: string;
}

const MODE_OPTIONS: { key: DebateMode; label: string; desc: string; disabled?: boolean }[] = [
  { key: 'agent-vs-agent', label: 'Agent vs Agent', desc: '两个 AI 专家互相辩论' },
  { key: 'agent-vs-user-agent', label: 'Agent vs 你的 Agent', desc: '你的 AI 分身代你出战' },
  { key: 'agent-vs-user', label: 'Agent vs 你', desc: '你亲自下场和 AI 辩论' },
];

export function DebateArena() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<DebateMode>('agent-vs-user-agent');
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

  // agent-vs-user specific state
  const [waitingForUser, setWaitingForUser] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [debateId, setDebateId] = useState<string | null>(null);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [proponent, setProponent] = useState<OpponentProfile | null>(null); // for agent-vs-agent: the "user side" AI expert
  const userInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamState.currentContent, waitingForUser]);

  // Auto-focus user input when waiting
  useEffect(() => {
    if (waitingForUser && userInputRef.current) {
      userInputRef.current.focus();
    }
  }, [waitingForUser]);

  const handleSSEEvent = useCallback((event: string, data: string) => {
    try {
      const parsed = JSON.parse(data);

      switch (event) {
        case 'init':
          if (parsed.opponentProfile) {
            const op = parsed.opponentProfile as OpponentProfile;
            setOpponent(op);
            opponentRef.current = op;
            setDebateId(parsed.id);
          }
          if (parsed.proponentProfile) {
            setProponent(parsed.proponentProfile as OpponentProfile);
          }
          break;

        case 'start':
          if (parsed.role === 'opponent') {
            setCurrentRound((prev) => prev + 1);
          }
          setStreamState({
            isStreaming: true,
            currentRole: parsed.role,
            currentContent: '',
          });
          break;

        case 'chunk':
          setStreamState((prev) => ({
            ...prev,
            currentContent: prev.currentContent + parsed.content,
          }));
          break;

        case 'message':
          setMessages((prev) => [...prev, parsed as DebateMessage]);
          setStreamState({
            isStreaming: true,
            currentRole: null,
            currentContent: '',
          });
          break;

        case 'waiting_for_user':
          setWaitingForUser(true);
          setCurrentRound(parsed.round || 0);
          setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
          break;

        case 'synthesizing':
          setIsSynthesizing(true);
          break;

        case 'synthesis':
          setIsSynthesizing(false);
          setSynthesis(parsed as DebateSynthesis);
          break;

        case 'done':
          if (parsed.messages) {
            const opponentProfile = opponentRef.current;
            if (opponentProfile) {
              const completedDebate: DebateSession = {
                id: parsed.id || debateId || `debate-${Date.now()}`,
                topic: parsed.topic || topic.trim(),
                userProfile: {
                  id: session?.user?.id || '',
                  name: session?.user?.name || '我',
                  avatar: session?.user?.image,
                  bio: session?.user?.bio,
                },
                opponentProfile,
                messages: parsed.messages,
                synthesis: parsed.synthesis,
                status: 'completed',
                createdAt: Date.now(),
              };
              saveDebate(completedDebate);
            }
          }
          setWaitingForUser(false);
          setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
          break;

        case 'error':
          setError(parsed.message || '发生错误');
          setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
          break;

        default:
          // Legacy event handling for non-typed events (agent-vs-agent / agent-vs-user-agent)
          if (parsed.opponentProfile) {
            const op = parsed.opponentProfile as OpponentProfile;
            setOpponent(op);
            opponentRef.current = op;
            setDebateId(parsed.id);
          } else if (parsed.role && parsed.name && !parsed.content && !parsed.timestamp) {
            if (parsed.role === 'opponent') {
              setCurrentRound((prev) => prev + 1);
            }
            setStreamState({
              isStreaming: true,
              currentRole: parsed.role,
              currentContent: '',
            });
          } else if (parsed.role && parsed.content && !parsed.timestamp) {
            setStreamState((prev) => ({
              ...prev,
              currentContent: prev.currentContent + parsed.content,
            }));
          } else if (parsed.timestamp) {
            setMessages((prev) => [...prev, parsed as DebateMessage]);
            setStreamState({
              isStreaming: true,
              currentRole: null,
              currentContent: '',
            });
          } else if ('consensus' in parsed && !parsed.messages) {
            setIsSynthesizing(false);
            setSynthesis(parsed as DebateSynthesis);
          } else if (Object.keys(parsed).length === 0) {
            setIsSynthesizing(true);
          } else if (parsed.messages) {
            const opponentProfile = opponentRef.current;
            if (opponentProfile) {
              const completedDebate: DebateSession = {
                id: parsed.id || debateId || `debate-${Date.now()}`,
                topic: topic.trim(),
                userProfile: {
                  id: session?.user?.id || '',
                  name: session?.user?.name || '我',
                  avatar: session?.user?.image,
                  bio: session?.user?.bio,
                },
                opponentProfile,
                messages: parsed.messages,
                synthesis: parsed.synthesis,
                status: 'completed',
                createdAt: Date.now(),
              };
              saveDebate(completedDebate);
            }
          }
          break;
      }
    } catch {
      // ignore parse errors
    }
  }, [debateId, topic, session, saveDebate]);

  const cancelDebate = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
    setIsSynthesizing(false);
    setWaitingForUser(false);
    setDebateId(null);
  }, []);

  const startDebate = useCallback(async () => {
    if (!topic.trim()) return;
    if (!session?.user) { openLoginModal(); return; }

    setMessages([]);
    setSynthesis(null);
    setOpponent(null);
    setProponent(null);
    opponentRef.current = null;
    setError(null);
    setShowReport(false);
    setCurrentRound(0);
    setIsSynthesizing(false);
    setWaitingForUser(false);
    setDebateId(null);
    setUserInput('');
    setStreamState({ isStreaming: true, currentRole: null, currentContent: '' });

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
          mode,
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

      await consumeSSEStream(response, handleSSEEvent);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '发生未知错误');
    } finally {
      // Don't reset streaming state — event handlers already manage it.
      // For agent-vs-user mode, waitingForUser is set by the event handler
      // before this finally runs, so we must not blindly reset.
      setIsSynthesizing(false);
    }
  }, [topic, session, saveDebate, selectedOpponentId, mode, handleSSEEvent]);

  const submitUserReply = useCallback(async () => {
    if (!userInput.trim() || !debateId || isSubmittingReply) return;
    if (!session?.user) { openLoginModal(); return; }

    setIsSubmittingReply(true);
    setWaitingForUser(false);
    setError(null);
    setStreamState({ isStreaming: true, currentRole: null, currentContent: '' });

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const replyContent = userInput.trim();
    setUserInput('');

    try {
      const response = await fetch('/api/debate/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debateId,
          content: replyContent,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || '回复失败');
      }

      await consumeSSEStream(response, handleSSEEvent);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '发生未知错误');
      setWaitingForUser(true); // Let user retry
    } finally {
      setIsSubmittingReply(false);
      setStreamState((prev) => {
        if (prev.isStreaming) {
          return { isStreaming: false, currentRole: null, currentContent: '' };
        }
        return prev;
      });
    }
  }, [userInput, debateId, isSubmittingReply, session, handleSSEEvent]);

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
    setWaitingForUser(false);
    setDebateId(null);
    setProponent(null);
  }, []);

  const isLoading = streamState.isStreaming || isSubmittingReply;

  // Display name for the "user" side depends on mode
  const userSideName = mode === 'agent-vs-agent' && proponent
    ? proponent.name
    : mode === 'agent-vs-user'
      ? (session?.user?.name || '我')
      : `${session?.user?.name || '我'} 的 Agent`;

  const displayMessages = streamState.currentRole && streamState.currentContent
    ? [
      ...messages,
      {
        role: streamState.currentRole,
        name: streamState.currentRole === 'user' ? userSideName : opponent?.name || '对手',
        content: streamState.currentContent,
        timestamp: Date.now(),
      },
    ]
    : messages;

  const showTypingIndicator = isLoading && streamState.currentRole !== null && !streamState.currentContent;
  const debateStarted = (displayMessages.length > 0 || isLoading || waitingForUser) && opponent;

  return (
    <div className="max-w-[1000px] mx-auto flex gap-5">
      {/* Main Column */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Mode Tabs — Zhihu style */}
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)]">
          <div className="flex border-b border-[var(--zh-border)]">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => !isLoading && !opt.disabled && setMode(opt.key)}
                disabled={isLoading || opt.disabled}
                className={`flex-1 py-3 text-[14px] font-medium transition-colors relative ${
                  opt.disabled
                    ? 'text-[var(--zh-text-gray)] opacity-50 cursor-not-allowed'
                    : mode === opt.key
                      ? 'text-[var(--zh-blue)]'
                      : 'text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]'
                } disabled:cursor-not-allowed`}
              >
                {opt.label}
                {opt.disabled && <span className="ml-1 text-[11px] text-[var(--zh-text-gray)]">即将上线</span>}
                {mode === opt.key && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-[var(--zh-blue)] rounded-t" />
                )}
              </button>
            ))}
          </div>
          <div className="px-4 py-2">
            <p className="text-[13px] text-[var(--zh-text-gray)]">
              {MODE_OPTIONS.find((o) => o.key === mode)?.desc}
            </p>
          </div>
        </div>

        {/* Topic Input — Zhihu card style */}
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入一个有争议的话题..."
              className="flex-1 px-3 py-2 bg-[var(--zh-bg)] border border-transparent rounded text-[14px] text-[var(--zh-text-main)] placeholder-[var(--zh-text-gray)] outline-none focus:bg-white focus:border-[var(--zh-text-gray)] transition-all"
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && !waitingForUser && startDebate()}
              disabled={isLoading || waitingForUser}
            />
            {isLoading && !waitingForUser ? (
              <button
                onClick={cancelDebate}
                className="px-4 py-2 bg-[var(--zh-red)] text-white rounded text-[14px] font-medium hover:bg-red-700 transition-colors"
              >
                停止辩论
              </button>
            ) : (
              <button
                onClick={startDebate}
                disabled={!topic.trim() || waitingForUser}
                className="px-4 py-2 bg-[var(--zh-blue)] text-white rounded text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {waitingForUser ? '辩论进行中' : '开始辩论'}
              </button>
            )}
          </div>

          {/* Suggested Topics */}
          {!debateStarted && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestedTopics.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  disabled={isLoading}
                  className="px-2.5 py-1 text-[13px] text-[var(--zh-text-gray)] bg-[var(--zh-bg)] rounded hover:bg-[var(--zh-border)] hover:text-[var(--zh-text-main)] transition-colors disabled:cursor-not-allowed"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Opponent Selection */}
        {!debateStarted && (
          <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
            <p className="text-[13px] text-[var(--zh-text-gray)] mb-3">选择对手（不选则自动匹配）</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {OPPONENT_PROFILES.map((op) => (
                <button
                  key={op.id}
                  onClick={() => setSelectedOpponentId(selectedOpponentId === op.id ? null : op.id)}
                  className={`flex items-center gap-3 p-3 rounded text-left transition-all border ${
                    selectedOpponentId === op.id
                      ? 'border-[var(--zh-blue)] bg-[var(--zh-blue-light)]'
                      : 'border-[var(--zh-border)] hover:border-[var(--zh-text-gray)] hover:bg-[var(--zh-bg)]'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-[var(--zh-bg)] flex items-center justify-center text-[14px] font-bold text-[var(--zh-text-secondary)] flex-shrink-0">
                    {op.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--zh-text-main)] leading-tight">{op.name}</p>
                    <p className="text-[12px] text-[var(--zh-text-gray)] leading-tight mt-0.5 truncate">{op.title} · {op.stance}</p>
                  </div>
                  {selectedOpponentId === op.id && (
                    <span className="ml-auto text-[var(--zh-blue)] text-[12px] flex-shrink-0">已选</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-[2px] text-[14px]">
            {error}
          </div>
        )}

        {/* Debate Content */}
        {debateStarted && (
          <>
            {/* Debate Header — like a Zhihu question header */}
            <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
              <h2 className="text-[18px] font-semibold text-[var(--zh-text-main)] mb-2">{topic}</h2>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-[13px] text-[var(--zh-text-gray)]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[var(--zh-bg)] flex items-center justify-center text-[10px] font-bold">{opponent.name.charAt(0)}</span>
                    {opponent.name}
                  </span>
                  <span>vs</span>
                  <span className="flex items-center gap-1.5">
                    {mode === 'agent-vs-agent' && proponent ? (
                      <span className="w-5 h-5 rounded-full bg-[var(--zh-bg)] flex items-center justify-center text-[10px] font-bold">
                        {proponent.name.charAt(0)}
                      </span>
                    ) : session?.user?.image ? (
                      <Image src={session.user.image} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" unoptimized />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-[var(--zh-bg)] flex items-center justify-center text-[10px] font-bold">
                        {(session?.user?.name || '我').charAt(0)}
                      </span>
                    )}
                    {userSideName}
                  </span>
                </div>
                {(isLoading || waitingForUser) && (
                  <div className="flex items-center gap-2 text-[13px] text-[var(--zh-text-gray)]">
                    {isSynthesizing ? (
                      <span className="flex items-center gap-1.5">
                        <span className="animate-spin rounded-full h-3.5 w-3.5 border border-[var(--zh-blue)] border-t-transparent" />
                        生成报告中
                      </span>
                    ) : waitingForUser ? (
                      <span className="text-[var(--zh-blue)] font-medium">轮到你发言</span>
                    ) : (
                      <span>第 {currentRound}/{TOTAL_ROUNDS} 轮</span>
                    )}
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {(isLoading || waitingForUser) && (
                <div className="mt-3 h-1 bg-[var(--zh-bg)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isSynthesizing ? 'bg-[var(--zh-blue)] animate-pulse' : 'bg-[var(--zh-blue)]'}`}
                    style={{ width: `${isSynthesizing ? 100 : (currentRound / TOTAL_ROUNDS) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Tab switch: 对话记录 / 认知报告 */}
            {synthesis && (
              <div className="bg-white rounded-[2px] border border-[var(--zh-border)] flex">
                <button
                  onClick={() => setShowReport(false)}
                  className={`flex-1 py-2.5 text-[14px] font-medium transition-colors relative ${
                    !showReport ? 'text-[var(--zh-blue)]' : 'text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]'
                  }`}
                >
                  对话记录
                  {!showReport && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[var(--zh-blue)]" />}
                </button>
                <button
                  onClick={() => setShowReport(true)}
                  className={`flex-1 py-2.5 text-[14px] font-medium transition-colors relative ${
                    showReport ? 'text-[var(--zh-blue)]' : 'text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]'
                  }`}
                >
                  认知报告
                  {showReport && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-[var(--zh-blue)]" />}
                </button>
              </div>
            )}

            {/* Synthesizing */}
            {isSynthesizing && (
              <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-6 text-center">
                <div className="inline-flex items-center gap-2 text-[var(--zh-text-gray)] text-[14px]">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--zh-blue)] border-t-transparent" />
                  评审正在生成认知报告...
                </div>
              </div>
            )}

            {/* Messages or Report */}
            {!showReport ? (
              <div className="space-y-0">
                {displayMessages.map((msg, idx) => (
                  <DebateAnswerCard
                    key={idx}
                    message={msg}
                    isUser={msg.role === 'user'}
                    userAvatar={session?.user?.image}
                    opponentName={opponent.name}
                    roundIndex={Math.floor(idx / 2) + 1}
                  />
                ))}
                {showTypingIndicator && (
                  <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
                    <div className="flex items-center gap-2 text-[var(--zh-text-gray)] text-[14px]">
                      <span className="animate-spin rounded-full h-3.5 w-3.5 border border-[var(--zh-text-gray)] border-t-transparent" />
                      {streamState.currentRole === 'user' ? userSideName : opponent.name} 正在发言...
                    </div>
                  </div>
                )}

                {/* User Input Area for agent-vs-user mode */}
                {waitingForUser && mode === 'agent-vs-user' && (
                  <div className="bg-white rounded-[2px] border-2 border-[var(--zh-blue)] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-[var(--zh-blue-light)] flex items-center justify-center text-[11px] font-bold text-[var(--zh-blue)]">
                        {(session?.user?.name || '我').charAt(0)}
                      </span>
                      <span className="text-[14px] font-medium text-[var(--zh-text-main)]">
                        轮到你发言（第 {currentRound + 1}/{TOTAL_ROUNDS} 轮）
                      </span>
                    </div>
                    <textarea
                      ref={userInputRef}
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          submitUserReply();
                        }
                      }}
                      placeholder="输入你的论点，反驳对方的观点..."
                      className="w-full min-h-[120px] px-3 py-2 bg-[var(--zh-bg)] border border-transparent rounded text-[14px] text-[var(--zh-text-main)] placeholder-[var(--zh-text-gray)] outline-none focus:bg-white focus:border-[var(--zh-blue)] transition-all resize-y"
                      disabled={isSubmittingReply}
                    />
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[12px] text-[var(--zh-text-gray)]">
                        Ctrl + Enter 发送
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={cancelDebate}
                          className="px-3 py-1.5 text-[13px] text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] transition-colors"
                        >
                          结束辩论
                        </button>
                        <button
                          onClick={submitUserReply}
                          disabled={!userInput.trim() || isSubmittingReply}
                          className="px-4 py-1.5 bg-[var(--zh-blue)] text-white rounded text-[13px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isSubmittingReply ? '发送中...' : '发表观点'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            ) : (
              synthesis && (
                <SynthesisReport
                  synthesis={synthesis}
                  userName={userSideName}
                  opponentName={opponent.name}
                />
              )
            )}

          </>
        )}
      </div>

      {/* Sidebar */}
      <div className="hidden lg:block w-[296px] flex-shrink-0 space-y-3">
        {/* About this mode */}
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
          <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)] mb-2">关于辩论</h3>
          <p className="text-[13px] text-[var(--zh-text-gray)] leading-relaxed">
            {mode === 'agent-vs-user'
              ? `你将亲自下场，与 AI 专家展开 ${TOTAL_ROUNDS} 轮辩论。对手先发言，然后你回复，最终生成认知报告。`
              : mode === 'agent-vs-agent'
                ? `两个 AI 专家将从不同立场展开 ${TOTAL_ROUNDS} 轮激烈辩论，你可以旁观并学习不同视角，最终生成认知报告。`
                : `你的 AI 分身将代你出战，与 AI 专家展开 ${TOTAL_ROUNDS} 轮辩论，最终生成认知报告。`
            }
          </p>
        </div>

        {/* History */}
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4 sticky top-[68px]">
          <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)] mb-3">
            辩论历史 <span className="text-[var(--zh-text-gray)] font-normal">({history.length})</span>
          </h3>
          <DebateHistory history={history} onSelect={loadHistoryDebate} />
        </div>
      </div>

      {/* Mobile History */}
      <div className="lg:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-10 h-10 rounded-full bg-white shadow border border-[var(--zh-border)] flex items-center justify-center text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" /></svg>
        </button>
      </div>

      {showHistory && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setShowHistory(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)]">辩论历史 ({history.length})</h3>
              <button onClick={() => setShowHistory(false)} className="text-[13px] text-[var(--zh-text-gray)]">关闭</button>
            </div>
            <DebateHistory history={history} onSelect={loadHistoryDebate} />
          </div>
        </div>
      )}
    </div>
  );
}

/* Zhihu answer-card style debate message */
function DebateAnswerCard({
  message,
  isUser,
  userAvatar,
  opponentName,
  roundIndex,
}: {
  message: DebateMessage;
  isUser: boolean;
  userAvatar?: string | null;
  opponentName: string;
  roundIndex: number;
}) {
  return (
    <div className="bg-white rounded-[2px] border border-[var(--zh-border)] mb-[-1px]">
      {/* Author header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${
          isUser ? 'bg-[var(--zh-blue-light)] text-[var(--zh-blue)]' : 'bg-[var(--zh-orange-light)] text-[var(--zh-orange)]'
        }`}>
          {isUser && userAvatar ? (
            <Image src={userAvatar} alt="" width={32} height={32} className="w-full h-full rounded-full object-cover" unoptimized />
          ) : (
            message.name.charAt(0)
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-medium text-[var(--zh-text-main)]">{message.name}</span>
          <span className={`px-1.5 py-0.5 text-[11px] rounded ${
            isUser ? 'bg-[var(--zh-blue-light)] text-[var(--zh-blue)]' : 'bg-[var(--zh-orange-light)] text-[var(--zh-orange)]'
          }`}>
            {isUser ? '正方' : '反方'}
          </span>
          <span className="text-[12px] text-[var(--zh-text-gray)]">第 {roundIndex} 轮</span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-[15px] text-[var(--zh-text-main)] leading-relaxed whitespace-pre-wrap">{message.content}</p>
      </div>

      {/* Footer actions — Zhihu style */}
      <div className="px-4 pb-3 flex items-center gap-4 text-[var(--zh-text-gray)]">
        <button className="flex items-center gap-1 text-[13px] hover:text-[var(--zh-blue)] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
          赞同
        </button>
        <button className="flex items-center gap-1 text-[13px] hover:text-[var(--zh-blue)] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          评论
        </button>
      </div>
    </div>
  );
}
