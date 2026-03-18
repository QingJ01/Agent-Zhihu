'use client';

import { useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DebateSession, DebateMessage, DebateSynthesis, OpponentProfile } from '@/types/secondme';
import { ChatList } from './ChatBubble';
import { SynthesisReport } from './SynthesisReport';
import { DebateHistory } from './DebateHistory';
import { useDebateHistory } from '@/lib/useDebateHistory';
import { openLoginModal } from '@/lib/loginModal';

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
  const [streamState, setStreamState] = useState<StreamState>({
    isStreaming: false,
    currentRole: null,
    currentContent: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const opponentRef = useRef<OpponentProfile | null>(null);

  const { history, saveDebate } = useDebateHistory(session?.user?.id);

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

    setMessages([]);
    setSynthesis(null);
    setOpponent(null);
    opponentRef.current = null;
    setError(null);
    setShowReport(false);
    setStreamState({ isStreaming: true, currentRole: null, currentContent: '' });

    if (abortControllerRef.current) abortControllerRef.current.abort();
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
          },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('辩论生成失败');

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
          if (line.startsWith('event: ')) continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.opponentProfile) {
                streamOpponent = parsed.opponentProfile as OpponentProfile;
                setOpponent(streamOpponent);
                opponentRef.current = streamOpponent;
                debateId = parsed.id;
              } else if (parsed.role && parsed.name && !parsed.content && !parsed.timestamp) {
                setStreamState({ isStreaming: true, currentRole: parsed.role, currentContent: '' });
              } else if (parsed.role && parsed.content && !parsed.timestamp) {
                setStreamState((prev) => ({ ...prev, currentContent: prev.currentContent + parsed.content }));
              } else if (parsed.timestamp) {
                setMessages((prev) => [...prev, parsed as DebateMessage]);
                setStreamState({ isStreaming: true, currentRole: null, currentContent: '' });
              } else if (parsed.consensus) {
                setSynthesis(parsed as DebateSynthesis);
              } else if (parsed.messages) {
                const opponentProfile = streamOpponent || opponentRef.current;
                if (!opponentProfile) throw new Error('Missing opponent profile');
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
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '发生未知错误');
    } finally {
      setStreamState({ isStreaming: false, currentRole: null, currentContent: '' });
    }
  }, [topic, session, saveDebate]);

  const loadHistoryDebate = useCallback((historicalDebate: DebateSession) => {
    setMessages(historicalDebate.messages);
    setSynthesis(historicalDebate.synthesis || null);
    setOpponent(historicalDebate.opponentProfile);
    opponentRef.current = historicalDebate.opponentProfile;
    setTopic(historicalDebate.topic);
    setShowHistory(false);
    setShowReport(false);
  }, []);

  // Unauthenticated state — Zhihu style
  if (!session?.user) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
        <div className="min-w-0">
          <div className="bg-white p-5 border border-[var(--zh-border)] rounded-[2px]">
            <h2 className="text-[20px] font-bold text-[var(--zh-text-main)] mb-1">辩论竞技场</h2>
            <p className="text-[14px] text-[var(--zh-text-gray)] mb-6">让你的 AI Agent 与对手展开激烈对线</p>

            {/* Disabled topic input */}
            <div className="mb-4">
              <label className="block text-[14px] font-medium text-[var(--zh-text-secondary)] mb-1.5">辩论话题</label>
              <input
                type="text"
                disabled
                placeholder="登录后输入一个有争议的话题..."
                className="w-full px-3 py-2.5 border border-[var(--zh-border)] rounded-[3px] text-[15px] bg-[var(--zh-bg)] text-[var(--zh-text-gray)] cursor-not-allowed"
              />
            </div>

            <div className="mb-5">
              <p className="text-[13px] text-[var(--zh-text-gray)] mb-2">热门话题</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTopics.map((t) => (
                  <span key={t} className="px-3 py-1 text-[13px] bg-[var(--zh-bg)] text-[var(--zh-text-gray)] rounded-[3px]">{t}</span>
                ))}
              </div>
            </div>

            {/* Login CTA */}
            <div className="border-t border-[var(--zh-border)] pt-5 text-center">
              <p className="text-[14px] text-[var(--zh-text-gray)] mb-3">登录后即可开始辩论</p>
              <button
                onClick={openLoginModal}
                className="px-6 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
              >
                登录 / 注册
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 hidden lg:block">
          <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px]">
            <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-2">辩论规则</h3>
            <div className="space-y-2 text-[13px] text-[var(--zh-text-secondary)] leading-relaxed">
              <p>1. 输入一个有争议的话题</p>
              <p>2. 系统匹配一位 AI 对手</p>
              <p>3. 你的 Agent 与对手进行 5 轮辩论</p>
              <p>4. AI 裁判生成认知博弈报告</p>
            </div>
          </div>
        </div>
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
    <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
      {/* Left: Main Content */}
      <div className="min-w-0">
        {/* Topic Input Card */}
        <div className="bg-white p-4 md:p-5 border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[20px] font-bold text-[var(--zh-text-main)]">
              {showHistory ? '历史记录' : '辩论竞技场'}
            </h2>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[13px] text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)] transition-colors"
            >
              {showHistory ? '返回辩论' : `历史记录 (${history.length})`}
            </button>
          </div>

          {showHistory ? (
            <DebateHistory history={history} onSelect={loadHistoryDebate} />
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="输入一个有争议的话题..."
                  className="flex-1 px-3 py-2.5 border border-[var(--zh-border)] rounded-[3px] text-[15px] text-[var(--zh-text-main)] placeholder:text-[var(--zh-text-gray)] focus:outline-none focus:border-[var(--zh-blue)] transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && startDebate()}
                  disabled={isLoading}
                />
                <button
                  onClick={startDebate}
                  disabled={isLoading || !topic.trim()}
                  className="px-5 py-2.5 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isLoading ? '对线中...' : '开始对线'}
                </button>
              </div>

              <div className="mt-3">
                <p className="text-[13px] text-[var(--zh-text-gray)] mb-1.5">热门话题</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTopics.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      className="px-3 py-1 text-[13px] bg-[var(--zh-bg)] text-[var(--zh-text-secondary)] rounded-[3px] hover:bg-[#EBF5FF] hover:text-[var(--zh-blue)] transition-colors"
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
          <div className="bg-[#FFF2F0] border border-[#FFCCC7] text-[#FF4D4F] px-4 py-3 rounded-[2px] mb-[10px] text-[14px]">
            {error}
          </div>
        )}

        {/* Debate Content */}
        {(displayMessages.length > 0 || isLoading) && opponent && !showHistory && (
          <>
            {/* Opponent Info */}
            <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[4px] bg-[#FF6A00] flex items-center justify-center text-white text-[15px] font-bold">
                    {opponent.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-[var(--zh-text-main)]">{opponent.name}</p>
                    <p className="text-[13px] text-[var(--zh-text-gray)]">{opponent.title}</p>
                  </div>
                </div>
                <span className="text-[12px] px-2.5 py-1 bg-[#FFF7F0] text-[#FF6A00] rounded-[3px] border border-[#FFD6B3]">
                  {opponent.stance}
                </span>
              </div>
            </div>

            {/* Tab Toggle */}
            {synthesis && (
              <div className="bg-white border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
                <div className="h-[42px] flex items-center border-b border-[var(--zh-border)]">
                  <button
                    onClick={() => setShowReport(false)}
                    className={`h-full px-5 text-[14px] font-medium transition-colors border-b-2 ${
                      !showReport
                        ? 'border-[var(--zh-blue)] text-[var(--zh-blue)]'
                        : 'border-transparent text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]'
                    }`}
                  >
                    对话记录
                  </button>
                  <button
                    onClick={() => setShowReport(true)}
                    className={`h-full px-5 text-[14px] font-medium transition-colors border-b-2 ${
                      showReport
                        ? 'border-[var(--zh-blue)] text-[var(--zh-blue)]'
                        : 'border-transparent text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]'
                    }`}
                  >
                    认知报告
                  </button>
                </div>
              </div>
            )}

            {/* Chat / Report */}
            {!showReport ? (
              <div className="bg-white border border-[var(--zh-border)] rounded-[2px] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--zh-border)]">
                  <h3 className="text-[15px] font-bold text-[var(--zh-text-main)]">辩论话题：{topic}</h3>
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
          </>
        )}
      </div>

      {/* Right: Sidebar */}
      <div className="min-w-0 hidden lg:block">
        {/* Rules */}
        <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
          <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-2">辩论规则</h3>
          <div className="space-y-2 text-[13px] text-[var(--zh-text-secondary)] leading-relaxed">
            <p>1. 输入一个有争议的话题</p>
            <p>2. 系统匹配一位 AI 对手</p>
            <p>3. 你的 Agent 与对手进行 5 轮辩论</p>
            <p>4. AI 裁判生成认知博弈报告</p>
          </div>
        </div>

        {/* Opponent Info (when active) */}
        {opponent && (
          <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
            <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-3">对手信息</h3>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-[4px] bg-[#FF6A00] flex items-center justify-center text-white text-[12px] font-bold">
                {opponent.name.charAt(0)}
              </div>
              <div>
                <div className="text-[14px] font-medium text-[var(--zh-text-main)]">{opponent.name}</div>
                <div className="text-[12px] text-[var(--zh-text-gray)]">{opponent.title}</div>
              </div>
            </div>
            <div className="text-[12px] text-[#FF6A00] bg-[#FFF7F0] px-2 py-1 rounded-[3px] inline-block">
              {opponent.stance}
            </div>
          </div>
        )}

        {/* Recent History */}
        {history.length > 0 && (
          <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px]">
            <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-2">最近辩论</h3>
            <div className="space-y-0">
              {history.slice(0, 5).map(h => (
                <button
                  key={h.id}
                  onClick={() => loadHistoryDebate(h)}
                  className="w-full text-left py-2.5 border-b border-[var(--zh-border)] last:border-b-0 hover:text-[var(--zh-blue)] transition-colors"
                >
                  <div className="text-[14px] text-[var(--zh-text-main)] truncate">{h.topic}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[12px] text-[var(--zh-text-gray)]">vs {h.opponentProfile.name}</span>
                    {h.synthesis && (
                      <span className={`text-[11px] font-medium ${
                        h.synthesis.winner === 'user' ? 'text-[#00B96B]'
                          : h.synthesis.winner === 'opponent' ? 'text-[#FF4D4F]'
                            : 'text-[var(--zh-text-gray)]'
                      }`}>
                        {h.synthesis.winner === 'user' ? '胜' : h.synthesis.winner === 'opponent' ? '负' : '平'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
