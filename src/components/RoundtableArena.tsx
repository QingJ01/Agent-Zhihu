'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { openLoginModal } from '@/lib/loginModal';

interface RoundtableExpert {
  id: string;
  name: string;
  avatar: string;
  title: string;
}

interface RoundtableMessage {
  id: string;
  role: 'expert' | 'host';
  expertId?: string;
  name: string;
  content: string;
  replyTo?: string;
  round: number;
  timestamp: number;
}

interface RoundtableSummary {
  consensus: string[];
  disagreements: string[];
  stances: { expertId: string; expertName: string; position: string; keyPoints: string[] }[];
  conclusion: string;
  openQuestions: string[];
}

// Zhihu-style muted color palette
const EXPERT_COLORS = [
  { bg: 'bg-[#0066FF]', text: 'text-[#0066FF]', light: 'bg-[#F6F9FF]', border: 'border-[#D6E4FF]' },
  { bg: 'bg-[#FF6A00]', text: 'text-[#FF6A00]', light: 'bg-[#FFF7F0]', border: 'border-[#FFD6B3]' },
  { bg: 'bg-[#00B96B]', text: 'text-[#00B96B]', light: 'bg-[#F0FFF5]', border: 'border-[#B7EBD0]' },
  { bg: 'bg-[#722ED1]', text: 'text-[#722ED1]', light: 'bg-[#F9F0FF]', border: 'border-[#D3ADF7]' },
  { bg: 'bg-[#EB2F96]', text: 'text-[#EB2F96]', light: 'bg-[#FFF0F6]', border: 'border-[#FFADD2]' },
];

const ALL_EXPERTS = [
  { id: 'rocket-iron-chief', name: '火箭钢铁侠', title: '科技企业家', avatar: '🚀' },
  { id: 'lakeside-merchant', name: '湖畔电商教父', title: '电商教父', avatar: '🏪' },
  { id: 'red-tie-president', name: '红领带总统', title: '政治人物', avatar: '👔' },
  { id: 'value-oracle', name: '奥马哈价值先知', title: '投资大师', avatar: '📈' },
  { id: 'black-turtleneck', name: '黑高领产品哲人', title: '产品大师', avatar: '🖤' },
  { id: 'social-empire-builder', name: '社交帝国操盘手', title: '社交平台创始人', avatar: '👤' },
  { id: 'cloud-warehouse-king', name: '云仓帝国建造者', title: '电商巨头', avatar: '📦' },
  { id: 'chip-leather-jacket', name: '皮衣芯片掌门', title: 'GPU之王', avatar: '🎮' },
  { id: 'japan-management-master', name: '东瀛经营四问者', title: '经营之神', avatar: '🏯' },
  { id: 'macro-observer', name: '宏观灰度观察员', title: '宏观策略师', avatar: '🔭' },
  { id: 'high-school-debater', name: '高中辩手', title: '高中生', avatar: '🎒' },
  { id: 'retired-programmer', name: '退休程序员', title: '30年老程序员', avatar: '👴' },
  { id: 'frontline-teacher', name: '一线班主任', title: '教师', avatar: '📚' },
  { id: 'er-doctor', name: '急诊室医生', title: '急诊医生', avatar: '🏥' },
  { id: 'indie-dev', name: '独立开发者', title: '独立开发者', avatar: '💻' },
  { id: 'factory-owner', name: '制造业厂长', title: '厂长', avatar: '🏭' },
  { id: 'cross-border-seller', name: '跨境卖家', title: '跨境电商', avatar: '🌍' },
  { id: 'hr-interviewer', name: 'HR面试官', title: 'HR', avatar: '🤝' },
  { id: 'therapist', name: '心理咨询师', title: '心理咨询师', avatar: '🧠' },
  { id: 'office-worker', name: '普通上班族', title: '上班族', avatar: '💼' },
];

export default function RoundtableArena() {
  const { data: session, status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'setup' | 'running' | 'completed'>('setup');
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>([]);
  const [experts, setExperts] = useState<RoundtableExpert[]>([]);
  const [messages, setMessages] = useState<RoundtableMessage[]>([]);
  const [summary, setSummary] = useState<RoundtableSummary | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(3);
  const [speakingExpert, setSpeakingExpert] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingExpertId, setStreamingExpertId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [hostInput, setHostInput] = useState('');
  const [directTo, setDirectTo] = useState<string | null>(null);
  const [roundtableId, setRoundtableId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; topic: string; status: string; experts: RoundtableExpert[]; createdAt: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const chatRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const getExpertColor = useCallback((expertId: string) => {
    const idx = experts.findIndex(e => e.id === expertId);
    return EXPERT_COLORS[idx >= 0 ? idx % EXPERT_COLORS.length : 0];
  }, [experts]);

  useEffect(() => {
    fetch('/api/roundtable?page=1&limit=20')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.roundtables) setHistory(data.roundtables); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamingContent]);

  const toggleExpert = (id: string) => {
    setSelectedExpertIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev
    );
  };

  const startRoundtable = async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    setError(null);
    setPhase('running');
    setMessages([]);
    setSummary(null);
    setShowSummary(false);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const body: Record<string, unknown> = { topic, description, rounds: totalRounds };
      if (selectedExpertIds.length >= 3) body.expertIds = selectedExpertIds;
      else body.expertCount = 4;

      const res = await fetch('/api/roundtable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (res.status === 401) throw new Error('请先登录后再使用圆桌讨论');
        throw new Error(errData?.error || '圆桌讨论启动失败，请稍后重试');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'init':
                  setRoundtableId(data.id);
                  setExperts(data.experts);
                  setTotalRounds(data.totalRounds);
                  break;
                case 'speaking':
                  setSpeakingExpert(data.expertId);
                  setStreamingContent('');
                  setStreamingExpertId(data.expertId);
                  setCurrentRound(data.round);
                  break;
                case 'chunk':
                  setStreamingContent(prev => prev + data.content);
                  break;
                case 'statement':
                  setMessages(prev => [...prev, data.message]);
                  setStreamingContent('');
                  setStreamingExpertId(null);
                  setSpeakingExpert(null);
                  break;
                case 'round_start':
                  setCurrentRound(data.round);
                  break;
                case 'summarizing':
                  setSpeakingExpert(null);
                  setStreamingContent('');
                  break;
                case 'summary':
                  setSummary(data.summary);
                  setShowSummary(true);
                  break;
                case 'done':
                  setPhase('completed');
                  break;
                case 'error':
                  setError(data.message);
                  break;
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
        setPhase('setup');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendInterject = async () => {
    if (!hostInput.trim() || !roundtableId) return;
    const content = hostInput;
    setHostInput('');

    const hostMsg: RoundtableMessage = {
      id: `host-${Date.now()}`, role: 'host', name: '主持人',
      content, round: currentRound, timestamp: Date.now(),
    };
    setMessages(prev => [...prev, hostMsg]);

    try {
      const res = await fetch('/api/roundtable/interject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundtableId, content, directTo }),
      });
      if (!res.ok) return;
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) currentEvent = line.slice(7);
          else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'speaking':
                  setSpeakingExpert(data.expertId);
                  setStreamingContent('');
                  setStreamingExpertId(data.expertId);
                  break;
                case 'chunk':
                  setStreamingContent(prev => prev + data.content);
                  break;
                case 'statement':
                  setMessages(prev => [...prev, data.message]);
                  setStreamingContent('');
                  setStreamingExpertId(null);
                  setSpeakingExpert(null);
                  break;
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) { console.error('Interject error:', err); }
  };

  const loadHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/roundtable?id=${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setRoundtableId(data.id);
      setTopic(data.topic);
      setDescription(data.description || '');
      setExperts(data.experts);
      setMessages(data.messages);
      setSummary(data.summary || null);
      setCurrentRound(data.currentRound);
      setTotalRounds(data.totalRounds);
      setPhase('completed');
      setShowSummary(!!data.summary);
      setShowHistory(false);
    } catch { /* ignore */ }
  };

  // Auto-load roundtable from URL ?id=xxx
  // Must wait for session to be ready before fetching (API requires auth)
  useEffect(() => {
    if (initialLoadDone) return;
    if (sessionStatus === 'loading') return;
    if (!session?.user) return;
    const urlId = searchParams.get('id');
    if (urlId) {
      setInitialLoadDone(true);
      loadHistory(urlId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, initialLoadDone, sessionStatus, session]);

  // ==================== LOADING ====================
  if (sessionStatus === 'loading') {
    return (
      <div className="max-w-[694px] mx-auto">
        <div className="bg-white p-8 border border-[var(--zh-border)] rounded-[2px] text-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-[var(--zh-blue)] rounded-full animate-spin mx-auto" />
          <p className="text-[14px] text-[var(--zh-text-gray)] mt-3">加载中...</p>
        </div>
      </div>
    );
  }

  // If URL has ?id= and we haven't loaded yet, show loading
  if (phase === 'setup' && searchParams.get('id') && !initialLoadDone) {
    return (
      <div className="max-w-[694px] mx-auto">
        <div className="bg-white p-8 border border-[var(--zh-border)] rounded-[2px] text-center">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-[var(--zh-blue)] rounded-full animate-spin mx-auto" />
          <p className="text-[14px] text-[var(--zh-text-gray)] mt-3">正在加载圆桌...</p>
        </div>
      </div>
    );
  }

  // ==================== UNAUTHENTICATED ====================
  if (!session?.user) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
        <div className="min-w-0">
          <div className="bg-white p-4 md:p-5 border border-[var(--zh-border)] rounded-[2px]">
            <h2 className="text-[20px] font-bold text-[var(--zh-text-main)] mb-1">圆桌讨论</h2>
            <p className="text-[14px] text-[var(--zh-text-gray)] mb-6">邀请多位 AI 专家围绕话题展开深度讨论</p>

            <div className="mb-4">
              <label className="block text-[14px] font-medium text-[var(--zh-text-secondary)] mb-1.5">讨论话题</label>
              <input
                type="text"
                disabled
                placeholder="登录后输入一个讨论话题..."
                className="w-full px-3 py-2.5 border border-[var(--zh-border)] rounded-[3px] text-[15px] bg-[var(--zh-bg)] text-[var(--zh-text-gray)] cursor-not-allowed"
              />
            </div>

            <div className="mb-5">
              <p className="text-[13px] text-[var(--zh-text-gray)] mb-2">专家阵容（部分展示）</p>
              <div className="grid grid-cols-4 gap-2">
                {ALL_EXPERTS.slice(0, 8).map(expert => (
                  <div key={expert.id} className="p-2 rounded-[3px] border border-[var(--zh-border)] text-center">
                    <div className="text-[16px] mb-0.5">{expert.avatar}</div>
                    <div className="text-[12px] text-[var(--zh-text-gray)] truncate">{expert.name}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--zh-border)] pt-5 text-center">
              <p className="text-[14px] text-[var(--zh-text-gray)] mb-3">登录后即可创建圆桌讨论</p>
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
            <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-2">圆桌规则</h3>
            <div className="space-y-2 text-[13px] text-[var(--zh-text-secondary)] leading-relaxed">
              <p>1. 输入一个讨论话题</p>
              <p>2. 选择 3-5 位 AI 专家</p>
              <p>3. 专家进行多轮自由讨论</p>
              <p>4. 你可以作为主持人随时插话引导</p>
              <p>5. 讨论结束后生成圆桌纪要</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== SETUP PHASE ====================
  if (phase === 'setup') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
        {/* Left: Setup Form */}
        <div className="min-w-0">
          {/* Topic Card */}
          <div className="bg-white p-4 md:p-5 border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
            <h2 className="text-[20px] font-bold text-[var(--zh-text-main)] mb-1">圆桌讨论</h2>
            <p className="text-[14px] text-[var(--zh-text-gray)] mb-5">邀请多位 AI 专家围绕话题展开深度讨论</p>

            <div className="mb-4">
              <label className="block text-[14px] font-medium text-[var(--zh-text-secondary)] mb-1.5">讨论话题</label>
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="例如：AI 会取代程序员吗？"
                className="w-full px-3 py-2.5 border border-[var(--zh-border)] rounded-[3px] text-[15px] text-[var(--zh-text-main)] placeholder:text-[var(--zh-text-gray)] focus:outline-none focus:border-[var(--zh-blue)] transition-colors"
                maxLength={200}
              />
            </div>

            <div className="mb-4">
              <label className="block text-[14px] font-medium text-[var(--zh-text-secondary)] mb-1.5">背景补充（可选）</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="提供一些上下文信息，帮助专家们更好地讨论..."
                className="w-full px-3 py-2.5 border border-[var(--zh-border)] rounded-[3px] text-[15px] text-[var(--zh-text-main)] placeholder:text-[var(--zh-text-gray)] focus:outline-none focus:border-[var(--zh-blue)] resize-none transition-colors"
                rows={2}
                maxLength={500}
              />
            </div>

            <div className="mb-5">
              <label className="block text-[14px] font-medium text-[var(--zh-text-secondary)] mb-1.5">讨论轮数</label>
              <div className="flex gap-2">
                {[2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setTotalRounds(n)}
                    className={`px-4 py-1.5 rounded-[3px] text-[14px] font-medium transition-colors ${
                      totalRounds === n
                        ? 'bg-[var(--zh-blue)] text-white'
                        : 'bg-[var(--zh-bg)] text-[var(--zh-text-secondary)] hover:bg-gray-200'
                    }`}
                  >
                    {n} 轮
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startRoundtable}
              disabled={!topic.trim() || isLoading}
              className="w-full py-2.5 bg-[var(--zh-blue)] hover:bg-[var(--zh-blue-hover)] text-white font-semibold rounded-[3px] text-[15px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始圆桌讨论
            </button>
          </div>

          {/* Expert Selection Card */}
          <div className="bg-white p-4 md:p-5 border border-[var(--zh-border)] rounded-[2px]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[16px] font-bold text-[var(--zh-text-main)]">选择专家</h3>
                <p className="text-[13px] text-[var(--zh-text-gray)] mt-0.5">选择 3-5 位，不选则自动匹配</p>
              </div>
              <span className="text-[14px] text-[var(--zh-text-gray)]">{selectedExpertIds.length}/5</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_EXPERTS.map(expert => {
                const selected = selectedExpertIds.includes(expert.id);
                return (
                  <button
                    key={expert.id}
                    onClick={() => toggleExpert(expert.id)}
                    className={`p-2.5 rounded-[3px] border transition-colors text-left ${
                      selected
                        ? 'border-[var(--zh-blue)] bg-[#EBF5FF]'
                        : 'border-[var(--zh-border)] hover:bg-[var(--zh-bg)]'
                    }`}
                  >
                    <div className="text-[16px] mb-0.5">{expert.avatar}</div>
                    <div className="text-[13px] font-medium text-[var(--zh-text-main)] truncate">{expert.name}</div>
                    <div className="text-[12px] text-[var(--zh-text-gray)] truncate">{expert.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: History Sidebar */}
        <div className="min-w-0 hidden lg:block">
          <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px]">
            <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-3">历史记录</h3>
            {history.length === 0 ? (
              <p className="text-[13px] text-[var(--zh-text-gray)] text-center py-6">暂无记录</p>
            ) : (
              <div className="space-y-0">
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => loadHistory(h.id)}
                    className="w-full text-left p-3 hover:bg-[var(--zh-bg)] border-b border-[var(--zh-border)] last:border-b-0 transition-colors"
                  >
                    <div className="text-[14px] font-medium text-[var(--zh-text-main)] truncate">{h.topic}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[12px] ${h.status === 'completed' ? 'text-[#00B96B]' : 'text-[#FF6A00]'}`}>
                        {h.status === 'completed' ? '已完成' : '进行中'}
                      </span>
                      <span className="text-[12px] text-[var(--zh-text-gray)] truncate">
                        {h.experts.map(e => e.name).join('、')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== RUNNING / COMPLETED ====================
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
      {/* Left: Discussion */}
      <div className="min-w-0">
        {/* Topic Header */}
        <div className="bg-white p-4 md:p-5 border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[20px] font-bold text-[var(--zh-text-main)] truncate flex-1 min-w-0 mr-3">{topic}</h2>
            <div className="flex gap-2 flex-shrink-0">
              {summary && (
                <button
                  onClick={() => setShowSummary(!showSummary)}
                  className={`px-3 py-1.5 rounded-[3px] text-[13px] font-medium transition-colors ${
                    showSummary ? 'bg-[var(--zh-blue)] text-white' : 'border border-[var(--zh-border)] text-[var(--zh-text-secondary)] hover:bg-[var(--zh-bg)]'
                  }`}
                >
                  圆桌纪要
                </button>
              )}
              <button
                onClick={() => { setPhase('setup'); setMessages([]); setSummary(null); }}
                className="px-3 py-1.5 rounded-[3px] text-[13px] font-medium border border-[var(--zh-border)] text-[var(--zh-text-secondary)] hover:bg-[var(--zh-bg)] transition-colors"
              >
                新建
              </button>
            </div>
          </div>

          {/* Expert Avatars */}
          <div className="flex items-center gap-4 py-2 border-t border-[var(--zh-border)] pt-3">
            {experts.map(expert => {
              const color = getExpertColor(expert.id);
              const isSpeaking = speakingExpert === expert.id;
              return (
                <div key={expert.id} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold ${color.bg} transition-all ${
                    isSpeaking ? 'ring-2 ring-offset-1 ring-[var(--zh-blue)]' : ''
                  }`}>
                    {expert.name[0]}
                  </div>
                  <div className="hidden sm:block">
                    <div className={`text-[13px] leading-tight ${isSpeaking ? `font-bold ${color.text}` : 'text-[var(--zh-text-secondary)]'}`}>{expert.name}</div>
                    {isSpeaking && <div className="text-[11px] text-[var(--zh-text-gray)]">发言中</div>}
                  </div>
                </div>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <span className={`text-[12px] px-2 py-0.5 rounded-[2px] ${phase === 'completed' ? 'bg-[#F0FFF5] text-[#00B96B]' : 'bg-[#EBF5FF] text-[var(--zh-blue)]'}`}>
                {phase === 'completed' ? '已完成' : `第 ${currentRound}/${totalRounds} 轮`}
              </span>
              <span className="text-[12px] text-[var(--zh-text-gray)]">{messages.length} 条发言</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-[#FFF2F0] text-[#FF4D4F] text-[14px] p-3 rounded-[2px] mb-[10px] border border-[#FFCCC7]">{error}</div>
        )}

        {/* Summary */}
        {showSummary && summary && (
          <div className="bg-white p-4 md:p-5 border border-[var(--zh-border)] rounded-[2px] mb-[10px] animate-fadeIn">
            <h3 className="text-[18px] font-bold text-[var(--zh-text-main)] mb-4">圆桌纪要</h3>

            <div className="mb-4">
              <h4 className="text-[14px] font-bold text-[#00B96B] mb-2">共识</h4>
              {summary.consensus.map((c, i) => (
                <p key={i} className="text-[14px] text-[var(--zh-text-secondary)] pl-3 border-l-2 border-[#B7EBD0] mb-1.5 leading-relaxed">{c}</p>
              ))}
            </div>

            <div className="mb-4">
              <h4 className="text-[14px] font-bold text-[#FF4D4F] mb-2">分歧</h4>
              {summary.disagreements.map((d, i) => (
                <p key={i} className="text-[14px] text-[var(--zh-text-secondary)] pl-3 border-l-2 border-[#FFA39E] mb-1.5 leading-relaxed">{d}</p>
              ))}
            </div>

            <div className="mb-4">
              <h4 className="text-[14px] font-bold text-[var(--zh-text-main)] mb-2">各方立场</h4>
              <div className="space-y-2">
                {summary.stances.map(s => {
                  const color = getExpertColor(s.expertId);
                  return (
                    <div key={s.expertId} className={`p-3 rounded-[3px] ${color.light} border ${color.border}`}>
                      <div className={`text-[14px] font-bold ${color.text}`}>{s.expertName}</div>
                      <div className="text-[14px] text-[var(--zh-text-secondary)] mt-1">{s.position}</div>
                      {s.keyPoints.map((p, i) => (
                        <div key={i} className="text-[13px] text-[var(--zh-text-gray)] mt-0.5">· {p}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-[var(--zh-bg)] rounded-[3px] mb-3">
              <h4 className="text-[14px] font-bold text-[var(--zh-text-main)] mb-1">总结</h4>
              <p className="text-[14px] text-[var(--zh-text-secondary)] leading-relaxed">{summary.conclusion}</p>
            </div>

            {summary.openQuestions.length > 0 && (
              <div>
                <h4 className="text-[13px] font-bold text-[var(--zh-text-gray)] mb-1.5">延伸问题</h4>
                <div className="flex flex-wrap gap-1.5">
                  {summary.openQuestions.map((q, i) => (
                    <span key={i} className="text-[12px] px-2.5 py-1 rounded-[2px] bg-[var(--zh-bg)] text-[var(--zh-text-secondary)]">{q}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {!showSummary && (
          <div className="bg-white border border-[var(--zh-border)] rounded-[2px] mb-[10px]">
            <div ref={chatRef} className="max-h-[600px] overflow-y-auto divide-y divide-[var(--zh-border)]">
              {messages.map(msg => {
                if (msg.role === 'host') {
                  return (
                    <div key={msg.id} className="px-4 md:px-5 py-3 bg-[#FFFBE6] animate-fadeIn">
                      <div className="text-[12px] text-[#D48806] font-medium mb-0.5">主持人</div>
                      <p className="text-[14px] text-[var(--zh-text-main)] leading-relaxed">{msg.content}</p>
                    </div>
                  );
                }

                const color = getExpertColor(msg.expertId || '');
                const replyMsg = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;

                return (
                  <div key={msg.id} className="p-4 md:p-5 animate-fadeIn">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[13px] font-bold ${color.bg}`}>
                        {msg.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[15px] font-bold ${color.text}`}>{msg.name}</span>
                          <span className="text-[12px] text-[var(--zh-text-gray)]">第 {msg.round} 轮</span>
                        </div>
                        {replyMsg && (
                          <div className="text-[13px] text-[var(--zh-text-gray)] mb-1.5 pl-2 border-l-2 border-[var(--zh-border)] truncate">
                            回应 @{replyMsg.name}: {replyMsg.content.slice(0, 60)}...
                          </div>
                        )}
                        <p className="text-[15px] text-[var(--zh-text-main)] leading-7 whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Streaming */}
              {streamingContent && streamingExpertId && (() => {
                const color = getExpertColor(streamingExpertId);
                const expert = experts.find(e => e.id === streamingExpertId);
                return (
                  <div className="p-4 md:p-5 animate-fadeIn">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[13px] font-bold ${color.bg}`}>
                        {expert?.name[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[15px] font-bold ${color.text}`}>{expert?.name}</span>
                          <span className="text-[12px] text-[var(--zh-text-gray)]">发言中...</span>
                        </div>
                        <p className="text-[15px] text-[var(--zh-text-main)] leading-7 whitespace-pre-wrap">{streamingContent}<span className="animate-pulse text-[var(--zh-text-gray)]">|</span></p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Summarizing */}
              {phase === 'running' && !speakingExpert && !streamingContent && messages.length > 0 && !summary && (
                <div className="px-5 py-6 text-center">
                  <div className="inline-flex items-center gap-2 text-[14px] text-[var(--zh-text-gray)]">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-[var(--zh-blue)] rounded-full animate-spin" />
                    正在生成圆桌纪要...
                  </div>
                </div>
              )}
            </div>

            {/* Host Input */}
            {phase === 'running' && (
              <div className="p-3 md:p-4 border-t border-[var(--zh-border)] bg-[var(--zh-bg)]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[13px] text-[var(--zh-text-gray)]">主持人插话</span>
                  <select
                    value={directTo || ''}
                    onChange={e => setDirectTo(e.target.value || null)}
                    className="text-[12px] px-2 py-1 border border-[var(--zh-border)] rounded-[3px] text-[var(--zh-text-secondary)] bg-white focus:outline-none focus:border-[var(--zh-blue)]"
                  >
                    <option value="">不指定专家</option>
                    {experts.map(e => (
                      <option key={e.id} value={e.id}>@{e.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={hostInput}
                    onChange={e => setHostInput(e.target.value)}
                    placeholder="引导讨论方向，追问具体问题..."
                    className="flex-1 px-3 py-2 border border-[var(--zh-border)] rounded-[3px] text-[14px] text-[var(--zh-text-main)] placeholder:text-[var(--zh-text-gray)] focus:outline-none focus:border-[var(--zh-blue)] bg-white"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInterject(); } }}
                  />
                  <button
                    onClick={sendInterject}
                    disabled={!hostInput.trim()}
                    className="px-4 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
                  >
                    发送
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Sidebar info */}
      <div className="min-w-0 hidden lg:block">
        <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px]">
          <h3 className="text-[16px] font-bold text-[var(--zh-text-main)] mb-3">参与专家</h3>
          <div className="space-y-3">
            {experts.map(expert => {
              const color = getExpertColor(expert.id);
              const isSpeaking = speakingExpert === expert.id;
              return (
                <div key={expert.id} className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold ${color.bg}`}>
                    {expert.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[14px] font-medium truncate ${isSpeaking ? color.text : 'text-[var(--zh-text-main)]'}`}>
                      {expert.name}
                      {isSpeaking && <span className="text-[12px] text-[var(--zh-text-gray)] ml-1">发言中</span>}
                    </div>
                    <div className="text-[12px] text-[var(--zh-text-gray)] truncate">{expert.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {history.length > 0 && (
          <div className="bg-white p-4 border border-[var(--zh-border)] rounded-[2px] mt-[10px]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[16px] font-bold text-[var(--zh-text-main)]">历史记录</h3>
              <button onClick={() => setShowHistory(!showHistory)} className="text-[13px] text-[var(--zh-blue)]">
                {showHistory ? '收起' : '展开'}
              </button>
            </div>
            {showHistory && history.map(h => (
              <button
                key={h.id}
                onClick={() => loadHistory(h.id)}
                className="w-full text-left py-2 border-b border-[var(--zh-border)] last:border-b-0 hover:text-[var(--zh-blue)] transition-colors"
              >
                <div className="text-[14px] text-[var(--zh-text-main)] truncate">{h.topic}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
