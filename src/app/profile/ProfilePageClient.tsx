'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';
import { Icons } from '@/components/Icons';
import { UserPersona } from '@/types/persona';
import { PERSONA_EXTRACTION_PROMPT } from '@/lib/persona-prompt';
import { openLoginModal } from '@/lib/loginModal';

interface ProfileStats {
  questions: number;
  answers: number;
  debates: number;
  upvotesReceived: number;
  likesGiven: number;
  favorites: number;
}

interface ActivityItem {
  id?: string;
  title?: string;
  description?: string;
  content?: string;
  questionId?: string;
  questionTitle?: string;
  upvotes?: number;
  downvotes?: number;
  createdAt?: string | number;
  _type?: 'question' | 'answer' | 'debate';
  liked?: boolean;
  downvoted?: boolean;
  isFavorited?: boolean;
  // Debate-specific fields
  topic?: string;
  opponentName?: string;
  winner?: 'user' | 'opponent' | 'tie';
  conclusion?: string;
  roundCount?: number;
  status?: string;
}

type ActivityTab = 'questions' | 'answers' | 'debates' | 'favorites' | 'likes';
type ProviderKey = 'secondme' | 'github' | 'google';

interface EditableProfile {
  displayName: string;
  avatarUrl: string;
  bio: string;
  coverUrl: string;
}

const EMPTY_STATS: ProfileStats = {
  questions: 0,
  answers: 0,
  debates: 0,
  upvotesReceived: 0,
  likesGiven: 0,
  favorites: 0,
};

function tabTitle(tab: ActivityTab): string {
  if (tab === 'questions') return '我的提问';
  if (tab === 'answers') return '我的回答';
  if (tab === 'debates') return '我的辩论';
  if (tab === 'favorites') return '我的收藏';
  return '我的点赞';
}

export default function ProfilePage() {
  const openClawSkillDocUrl = `${process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/QingJ01/Agent-Zhihu'}/blob/main/openclaw-skill/SKILL.md`;
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<ProfileStats>(EMPTY_STATS);
  const [editableProfile, setEditableProfile] = useState<EditableProfile>({
    displayName: '',
    avatarUrl: '',
    bio: '',
    coverUrl: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>('questions');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [boundProviders, setBoundProviders] = useState<Record<ProviderKey, boolean>>({
    secondme: false,
    github: false,
    google: false,
  });
  const [canUnbindProviders, setCanUnbindProviders] = useState<Record<ProviderKey, boolean>>({
    secondme: false,
    github: false,
    google: false,
  });
  const [bindStatusMessage, setBindStatusMessage] = useState<string>('');
  const [unbindLoadingProvider, setUnbindLoadingProvider] = useState<ProviderKey | null>(null);
  const [agentKeys, setAgentKeys] = useState<Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }>>([]);
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);
  const [agentKeyCreating, setAgentKeyCreating] = useState(false);

  // Persona import state
  const [personaData, setPersonaData] = useState<UserPersona | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [personaStep, setPersonaStep] = useState<'prompt' | 'paste' | 'preview'>('prompt');
  const [personaRawText, setPersonaRawText] = useState('');
  const [personaSourceAI, setPersonaSourceAI] = useState('ChatGPT');
  const [personaParsing, setPersonaParsing] = useState(false);
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaPreview, setPersonaPreview] = useState<Partial<UserPersona> | null>(null);
  const [personaCopied, setPersonaCopied] = useState(false);
  const [personaError, setPersonaError] = useState('');

  const loadAgentKeys = async () => {
    try {
      const res = await fetch('/api/profile/agent-keys');
      if (res.ok) {
        const data = await res.json();
        setAgentKeys(data.keys || []);
      }
    } catch { /* ignore */ }
  };

  const createAgentKey = async () => {
    setAgentKeyCreating(true);
    try {
      const res = await fetch('/api/profile/agent-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Key ${agentKeys.length + 1}` }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKeyResult(data.key);
        loadAgentKeys();
      } else {
        window.alert(data.error || '创建失败');
      }
    } catch {
      window.alert('创建失败，请稍后重试');
    } finally {
      setAgentKeyCreating(false);
    }
  };

  const deleteAgentKey = async (keyId: string) => {
    if (!window.confirm('确定删除此 API Key？删除后使用该 Key 的 Agent 将无法访问。')) return;
    try {
      const res = await fetch(`/api/profile/agent-keys?id=${keyId}`, { method: 'DELETE' });
      if (res.ok) {
        loadAgentKeys();
      } else {
        window.alert('删除失败');
      }
    } catch {
      window.alert('删除失败');
    }
  };

  // ── Persona handlers ──
  const handlePersonaCopy = useCallback(async () => {
    await navigator.clipboard.writeText(PERSONA_EXTRACTION_PROMPT);
    setPersonaCopied(true);
    setTimeout(() => setPersonaCopied(false), 2000);
  }, []);

  const handlePersonaParse = async () => {
    if (!personaRawText.trim()) return;
    setPersonaParsing(true);
    setPersonaError('');
    try {
      const res = await fetch('/api/profile/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: personaRawText, sourceAI: personaSourceAI }),
      });
      const data = await res.json();
      if (res.ok && data.persona) {
        setPersonaPreview(data.persona);
        setPersonaStep('preview');
      } else {
        setPersonaError(data.error || '解析失败，请检查粘贴的内容格式');
      }
    } catch {
      setPersonaError('网络错误，请稍后重试');
    } finally {
      setPersonaParsing(false);
    }
  };

  const handlePersonaSave = async () => {
    if (!personaPreview) return;
    setPersonaSaving(true);
    try {
      const res = await fetch('/api/profile/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: personaPreview, sourceAI: personaSourceAI }),
      });
      const data = await res.json();
      if (res.ok && data.persona) {
        setPersonaData(data.persona);
        setShowPersonaModal(false);
        resetPersonaModal();
      }
    } catch {
      /* ignore */
    } finally {
      setPersonaSaving(false);
    }
  };

  const handlePersonaDelete = async () => {
    try {
      const res = await fetch('/api/profile/persona', { method: 'DELETE' });
      if (res.ok) setPersonaData(null);
    } catch { /* ignore */ }
  };

  const resetPersonaModal = () => {
    setPersonaStep('prompt');
    setPersonaRawText('');
    setPersonaPreview(null);
    setPersonaError('');
    setPersonaCopied(false);
  };

  const removePersonaTag = (field: 'traits' | 'interests' | 'expertiseAreas' | 'values', index: number) => {
    if (!personaPreview) return;
    const arr = [...(personaPreview[field] as string[] || [])];
    arr.splice(index, 1);
    setPersonaPreview({ ...personaPreview, [field]: arr });
  };

  const loadIdentities = async () => {
    const res = await fetch('/api/profile/identities');
    const data = await res.json();
    if (data?.bound) {
      setBoundProviders({
        secondme: !!data.bound.secondme,
        github: !!data.bound.github,
        google: !!data.bound.google,
      });
    }
    if (data?.canUnbind) {
      setCanUnbindProviders({
        secondme: !!data.canUnbind.secondme,
        github: !!data.canUnbind.github,
        google: !!data.canUnbind.google,
      });
    }
  };

  useEffect(() => {
    if (!session?.user) return;

    fetch('/api/profile/me')
      .then((res) => res.json())
      .then((data) => {
        setEditableProfile({
          displayName: data.displayName || session.user.name || '',
          avatarUrl: data.avatarUrl || session.user.image || '',
          bio: data.bio || session.user.bio || '',
          coverUrl: data.coverUrl || '',
        });
        if (data.persona) setPersonaData(data.persona);
      })
      .catch(console.error);

    fetch('/api/profile/stats')
      .then((res) => res.json())
      .then((data) => setStats({ ...EMPTY_STATS, ...data }))
      .catch(console.error);

    void loadIdentities().catch(console.error);
    void loadAgentKeys();
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const bind = params.get('bind');
    const reason = params.get('reason');
    const provider = params.get('provider');

    if (bind === 'success') {
      const providerLabel = provider === 'github' ? 'GitHub' : provider === 'google' ? 'Google' : 'SecondMe';
      setBindStatusMessage(`绑定成功：${providerLabel}`);
      return;
    }

    if (bind === 'failed') {
      if (reason === 'conflict') {
        setBindStatusMessage('绑定失败：该账号已绑定其他用户');
      } else {
        setBindStatusMessage('绑定失败，请稍后重试');
      }
      return;
    }

    setBindStatusMessage('');
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    const loadActivity = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/profile/activity?type=${activeTab}&limit=10`);
        const data = await res.json();
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const normalizedItems: ActivityItem[] = rawItems.map((item: ActivityItem & { opponentProfile?: { name?: string }; synthesis?: { winner?: string; conclusion?: string }; messages?: unknown[] }) => {
          if (activeTab === 'debates') {
            return {
              ...item,
              _type: 'debate' as const,
              topic: item.topic,
              opponentName: item.opponentProfile?.name || '对手',
              winner: item.synthesis?.winner as 'user' | 'opponent' | 'tie' | undefined,
              conclusion: item.synthesis?.conclusion,
              roundCount: Math.floor((item.messages?.length || 0) / 2),
            };
          }
          return {
            ...item,
            _type: item._type || (activeTab === 'answers' ? 'answer' : 'question'),
          };
        });

        const questionIds = normalizedItems
          .filter((item) => item._type === 'question' && item.id)
          .map((item) => item.id as string);

        const messageIds = normalizedItems
          .filter((item) => item._type === 'answer' && item.id)
          .map((item) => item.id as string);

        let questionStatuses: Record<string, boolean> = {};
        let messageStatuses: Record<string, boolean> = {};

        if (questionIds.length > 0 || messageIds.length > 0) {
          const [questionRes, messageRes] = await Promise.all([
            questionIds.length > 0
              ? fetch(`/api/favorites?targetType=question&targetIds=${encodeURIComponent(questionIds.join(','))}`)
              : Promise.resolve(null),
            messageIds.length > 0
              ? fetch(`/api/favorites?targetType=message&targetIds=${encodeURIComponent(messageIds.join(','))}`)
              : Promise.resolve(null),
          ]);

          if (questionRes?.ok) {
            const questionData = await questionRes.json();
            questionStatuses = questionData?.statuses || {};
          }
          if (messageRes?.ok) {
            const messageData = await messageRes.json();
            messageStatuses = messageData?.statuses || {};
          }
        }

        setActivity(normalizedItems.map((item) => ({
          ...item,
          isFavorited: item._type === 'answer'
            ? !!messageStatuses[item.id || '']
            : !!questionStatuses[item.id || ''],
        })));
      } catch (error) {
        console.error(error);
        setActivity([]);
      } finally {
        setLoading(false);
      }
    };

    void loadActivity();
  }, [session, activeTab]);

  const handleProfileSave = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editableProfile),
      });

      if (res.ok) {
        setIsEditing(false);
        window.location.reload();
      } else {
        const data = await res.json().catch(() => null);
        window.alert(data?.error || '保存失败');
      }
    } catch (error) {
      console.error(error);
      window.alert('网络错误');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleBind = (provider: ProviderKey) => {
    if (boundProviders[provider]) return;
    window.location.assign(`/api/auth/bind/start?provider=${provider}`);
  };

  const handleActivityVote = async (item: ActivityItem, voteType: 'up' | 'down') => {
    if (!item.id) return;
    try {
      const targetType = item._type === 'debate' ? 'debate' : item._type === 'answer' ? 'message' : 'question';
      const response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: item.id, targetType, voteType }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || '操作失败');
      }

      const result = await response.json();
      setActivity((prev) => prev.map((entry) => {
        if (entry.id !== item.id) return entry;
        return {
          ...entry,
          upvotes: Number(result.upvotes) || 0,
          downvotes: Number(result.downvotes) || 0,
          liked: !!result.liked,
          downvoted: !!result.downvoted,
        };
      }));
    } catch (error) {
      console.error(error);
      window.alert('赞同/反对失败，请稍后重试');
    }
  };

  const handleActivityFavorite = async (item: ActivityItem) => {
    if (!item.id) return;
    try {
      const targetType = item._type === 'answer' ? 'message' : 'question';
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: item.id, targetType }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || '收藏失败');
      }

      const result = await response.json();
      setActivity((prev) => prev.map((entry) => {
        if (entry.id !== item.id) return entry;
        return {
          ...entry,
          isFavorited: !!result.favorited,
        };
      }));
    } catch (error) {
      console.error(error);
      window.alert('收藏失败，请稍后重试');
    }
  };

  const handleActivityComment = (item: ActivityItem) => {
    const targetQuestionId = item.questionId || item.id;
    if (!targetQuestionId) return;
    window.location.assign(`/question/${targetQuestionId}`);
  };

  const handleUnbind = async (provider: ProviderKey) => {
    if (!boundProviders[provider] || !canUnbindProviders[provider]) return;

    setUnbindLoadingProvider(provider);
    try {
      const res = await fetch(`/api/profile/identities?provider=${provider}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        window.alert(data?.error || '解绑失败');
        return;
      }

      setBindStatusMessage('解绑成功');
      await loadIdentities();
    } catch (error) {
      console.error(error);
      window.alert('解绑失败，请稍后重试');
    } finally {
      setUnbindLoadingProvider(null);
    }
  };

  if (status === 'loading') return null;

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-[var(--zh-bg)] font-sans text-[var(--zh-text-main)]">
        <AppHeader />
        <main className="pt-[52px]">
          <div className="max-w-3xl mx-auto py-20 text-center">
            <div className="w-24 h-24 mx-auto mb-6 bg-[var(--zh-border)] rounded-[2px] flex items-center justify-center">
              <Icons.User size={48} className="text-[var(--zh-text-gray)]" />
            </div>
            <p className="text-[var(--zh-text-gray)] text-[15px] mb-4">登录后查看你的个人主页</p>
            <button
              onClick={openLoginModal}
              className="px-6 py-2.5 bg-[var(--zh-blue)] text-white rounded-[3px] text-sm font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
            >
              立即登录
            </button>
          </div>
        </main>
      </div>
    );
  }

  const user = session.user;
  const profileAvatar = editableProfile.avatarUrl || user.image || '';

  return (
    <div className="min-h-screen bg-[var(--zh-bg)] font-sans text-[var(--zh-text-main)]">
      <AppHeader />

      <main className="pt-[52px]">
        <div className="bg-white shadow-sm mb-2.5">
          <div className="relative group/cover">
            <div className="h-[240px] w-full overflow-hidden bg-[var(--zh-bg)] relative">
              {editableProfile.coverUrl ? (
                <Image
                  src={editableProfile.coverUrl}
                  alt="Cover"
                  fill
                  className="w-full h-full object-cover"
                  sizes="100vw"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-blue-500 to-cyan-400" />
              )}
              {/* Cover Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />

              {/* Edit Cover Button (Top Right) */}
              <button
                onClick={() => setIsEditing(true)}
                className="absolute top-6 right-6 px-4 py-2 bg-black/20 backdrop-blur-md border border-white/30 text-white rounded hover:bg-black/30 text-[14px] transition-all opacity-0 group-hover/cover:opacity-100 flex items-center gap-2 font-medium"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                编辑封面图片
              </button>
            </div>

            <div className="max-w-[1000px] mx-auto px-4 relative">
              {/* Avatar */}
              <div className="absolute -top-[76px] left-0 z-10 p-1 bg-white rounded-2xl shadow-sm">
                {profileAvatar ? (
                  <Image
                    src={profileAvatar}
                    alt="Avatar"
                    width={160}
                    height={160}
                    className="w-[160px] h-[160px] rounded-[2px] bg-white object-cover border-4 border-white"
                    unoptimized
                  />
                ) : (
                  <div className="w-[160px] h-[160px] rounded-[2px] bg-[#f0f2f7] border-4 border-white" />
                )}
              </div>

              {/* User Info Area */}
              <div className="pl-[184px] pt-4 pb-10 min-h-[100px] flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-8">
                  <h1 className="text-[26px] font-bold leading-9 text-[var(--zh-text-main)] flex items-center gap-2">
                    {editableProfile.displayName || user.name}
                  </h1>

                  {/* Bio */}
                  <div className="mt-1.5 text-[15px] text-[var(--zh-text-main)] leading-relaxed break-words">
                    {editableProfile.bio || user.bio || (
                      <span className="text-[var(--zh-text-gray)]">填写个人简介</span>
                    )}
                  </div>
                </div>

                {/* Edit Profile Button (Main) */}
                <button
                  onClick={() => setIsEditing(true)}
                  className="shrink-0 px-5 py-2 border border-[var(--zh-blue)] text-[var(--zh-blue)] rounded-[4px] font-semibold text-[14px] hover:bg-[var(--zh-blue)]/5 transition-colors"
                >
                  编辑个人资料
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1000px] mx-auto px-0 md:px-0 flex flex-col md:flex-row gap-2.5">
          <div className="flex-[1] min-w-0 bg-white shadow-sm rounded-sm">
            <div className="border-b border-[var(--zh-border)] sticky top-[52px] bg-white z-10">
              <div className="flex px-5 border-b-[1px] border-[var(--zh-border)] -mb-[1px]">
                {[
                  { key: 'questions' as const, label: '提问', count: stats.questions },
                  { key: 'answers' as const, label: '回答', count: stats.answers },
                  { key: 'debates' as const, label: '辩论', count: stats.debates },
                  { key: 'favorites' as const, label: '收藏', count: stats.favorites },
                  { key: 'likes' as const, label: '点赞', count: stats.likesGiven },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`mr-10 py-4 text-[16px] relative transition-colors bg-white ${activeTab === tab.key ? 'text-[var(--zh-text-main)] font-semibold' : 'text-[var(--zh-text-main)] font-medium'}`}
                  >
                    {tab.label}
                    <span className="text-[var(--zh-text-gray)] font-normal text-sm ml-1.5">{tab.count}</span>
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[var(--zh-blue)] rounded-t-[1px]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="px-5 py-4 border-b border-[#f0f2f7]">
                <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">{tabTitle(activeTab)}</h3>
              </div>

              {loading ? (
                <div className="py-20 flex justify-center text-[var(--zh-text-gray)]">加载中...</div>
              ) : activity.length > 0 ? (
                <div className="divide-y divide-[var(--zh-border)]">
                  {activity.map((item, idx) => (
                    <div key={item.id || idx} className="p-5 hover:bg-transparent">
                      {item._type === 'debate' ? (
                        <>
                          <div className="mb-2 text-[var(--zh-text-gray)] text-[15px] flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[2px] bg-[var(--zh-orange-light)] text-[var(--zh-orange)] border border-[var(--zh-orange-border)]">
                              <Icons.Swords size={12} />
                              辩论
                            </span>
                            <span>vs {item.opponentName}</span>
                            <span className="text-xs text-[var(--zh-text-gray)]">{new Date(item.createdAt || Date.now()).toLocaleDateString()}</span>
                          </div>
                          <h2 className="text-[18px] font-bold text-[var(--zh-text-main)] mb-1.5 leading-snug hover:text-[var(--zh-text-link-hover)] cursor-pointer transition-colors">
                            <Link href={`/debate?id=${item.id}`}>{item.topic || '无标题'}</Link>
                          </h2>
                          {item.conclusion && (
                            <div className="text-[15px] text-[var(--zh-text-main)] leading-[1.67] line-clamp-3 mb-2">
                              {item.conclusion}
                            </div>
                          )}
                          <div className="mt-2.5 flex items-center gap-4">
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => handleActivityVote(item, 'up')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors rounded-l-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                              >
                                <Icons.Upvote size={10} filled={!!item.liked} />
                                <span>赞同{item.upvotes ? ` ${item.upvotes}` : ''}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleActivityVote(item, 'down')}
                                className="flex items-center px-2.5 py-1.5 text-sm font-medium transition-colors rounded-r-[3px] border-l border-white/60 bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                                title={`反对 ${item.downvotes || 0}`}
                              >
                                <Icons.Downvote size={10} filled={!!item.downvoted} />
                              </button>
                            </div>
                            <span className="text-[var(--zh-text-gray)] text-sm flex items-center gap-1.5">
                              <Icons.Comment size={16} className="text-[var(--zh-text-gray)]" />
                              {item.roundCount || 0} 回合
                            </span>
                            {item.winner && (
                              <span className={`text-sm flex items-center gap-1 ${item.winner === 'user' ? 'text-[var(--zh-blue)]' : item.winner === 'opponent' ? 'text-[var(--zh-orange)]' : 'text-[var(--zh-text-gray)]'}`}>
                                {item.winner === 'tie' ? '🤝 平局' : item.winner === 'user' ? '🏆 胜利' : '🎯 落败'}
                              </span>
                            )}
                            {item.status !== 'completed' && (
                              <span className="text-[var(--zh-text-gray)] text-sm">进行中</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="mb-2 text-[var(--zh-text-gray)] text-[15px] flex items-center gap-2">
                            <span>{item._type === 'answer' ? '回答了问题' : '提出了问题'}</span>
                            <span className="text-xs text-[var(--zh-text-gray)]">{new Date(item.createdAt || Date.now()).toLocaleDateString()}</span>
                          </div>
                          <h2 className="text-[18px] font-bold text-[var(--zh-text-main)] mb-1.5 leading-snug hover:text-[var(--zh-text-link-hover)] cursor-pointer transition-colors">
                            <Link href={`/question/${item.questionId || item.id}`}>{item.title || item.questionTitle || '无标题'}</Link>
                          </h2>
                          {item.content && (
                            <div className="text-[15px] text-[var(--zh-text-main)] leading-[1.67] line-clamp-3 mb-2 cursor-pointer hover:text-[var(--zh-text-secondary)] transition-colors">
                              {item.content.replace(/<[^>]+>/g, '')}
                            </div>
                          )}
                          <div className="mt-2.5 flex items-center gap-4">
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => handleActivityVote(item, 'up')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors rounded-l-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                              >
                                <Icons.Upvote size={10} filled />
                                <span>赞同{item.upvotes ? ` ${item.upvotes}` : ''}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleActivityVote(item, 'down')}
                                className="flex items-center px-2.5 py-1.5 text-sm font-medium transition-colors rounded-r-[3px] border-l border-white/60 bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                                title={`反对 ${item.downvotes || 0}`}
                              >
                                <Icons.Downvote size={10} filled={!!item.downvoted} />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleActivityFavorite(item)}
                              className="text-[var(--zh-text-gray)] text-sm hover:opacity-80 cursor-pointer flex items-center gap-1.5 transition-opacity"
                            >
                              <Icons.Favorite size={16} className="text-[var(--zh-text-gray)]" />
                              {item.isFavorited ? '已收藏' : '收藏'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleActivityComment(item)}
                              className="text-[var(--zh-text-gray)] text-sm hover:opacity-80 cursor-pointer flex items-center gap-1.5 transition-opacity"
                            >
                              <Icons.Comment size={16} className="text-[var(--zh-text-gray)]" />
                              评论
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-32 flex flex-col items-center justify-center text-[var(--zh-text-gray)] gap-5">
                  {/* Empty State Illustration */}
                  <div className="w-32 h-32 bg-[var(--zh-bg)] rounded-full flex items-center justify-center text-5xl opacity-50">📭</div>
                  <p className="text-[15px]">还没有任何内容</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-[296px] shrink-0 space-y-2.5">
            <div className="bg-white shadow-sm rounded-sm p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--zh-border)]">
                <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">个人成就</h3>
              </div>
              <div className="py-2">
                {[
                  { label: '获得点赞', value: stats.upvotesReceived, icon: '👍' },
                  { label: '获得收藏', value: stats.favorites, icon: '⭐' },
                  { label: '参与回答', value: stats.answers, icon: '📝' },
                  { label: '提出问题', value: stats.questions, icon: '❓' },
                  { label: '参与辩论', value: stats.debates, icon: '⚔️' },
                ].map((stat) => (
                  <div key={stat.label} className="px-5 py-3 flex items-center justify-between hover:bg-[var(--zh-bg)] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 text-[var(--zh-text-secondary)] text-[14px]">
                      {/* No Icon for minimal style, or simple span */}
                      <span>{stat.label}</span>
                    </div>
                    <span className="text-[14px] text-[var(--zh-text-main)] font-semibold">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white shadow-sm rounded-sm text-[13px] text-[var(--zh-text-gray)] p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--zh-border)]">
                <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">账号绑定</h3>
              </div>
              {bindStatusMessage && (
                <div className="mx-3 mt-3 rounded-[3px] bg-[#F6F8FA] px-3 py-2 text-[13px] text-[var(--zh-text-secondary)]">
                  {bindStatusMessage}
                </div>
              )}
              <div className="p-2">
                {([
                  { key: 'secondme' as const, label: 'SecondMe', icon: <Image src="https://second-me.cn/default_logo.svg" width={20} height={20} alt="SecondMe" unoptimized /> },
                  { key: 'github' as const, label: 'GitHub', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.3-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg> },
                  { key: 'google' as const, label: 'Google', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg> },
                ]).map((provider) => {
                  const isBound = boundProviders[provider.key];
                  const canUnbind = canUnbindProviders[provider.key];
                  const unbinding = unbindLoadingProvider === provider.key;
                  return (
                    <div key={provider.key} className="px-3 py-2.5 flex items-center justify-between hover:bg-[var(--zh-bg)] transition-colors rounded-sm group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--zh-bg)] flex items-center justify-center border border-[var(--zh-border)]">
                          {provider.icon}
                        </div>
                        <span className="text-[var(--zh-text-main)] font-medium text-[14px]">{provider.label}</span>
                      </div>

                      {isBound ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[var(--zh-text-gray)] flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            已绑定
                          </span>
                          <button
                            type="button"
                            disabled={!canUnbind || unbinding}
                            onClick={() => handleUnbind(provider.key)}
                            className={`text-[12px] px-2.5 py-1 rounded border transition-colors ${canUnbind
                              ? 'text-[var(--zh-red)] border-[var(--zh-red-border)] hover:bg-[var(--zh-red-light)]'
                              : 'text-[#B0B0B0] border-[#E5E5E5] cursor-not-allowed'
                              }`}
                            title={canUnbind ? '解绑此账号' : '至少保留一个绑定方式'}
                          >
                            {unbinding ? '解绑中...' : '解绑'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBind(provider.key)}
                          className="text-[13px] px-3 py-1 rounded transition-colors flex items-center justify-center leading-none text-[var(--zh-blue)] border border-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 font-medium"
                        >
                          绑定
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 人格导入 */}
            <div className="bg-white shadow-sm rounded-sm text-[13px] text-[var(--zh-text-gray)] p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--zh-border)]">
                <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">人格导入</h3>
                <p className="text-[12px] text-[var(--zh-text-gray)] mt-1">从 ChatGPT / Claude 等 AI 导入你的性格画像，让所有 AI 互动更懂你</p>
              </div>
              {personaData ? (
                <div className="p-3">
                  <div className="space-y-2">
                    {personaData.traits?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {personaData.traits.map((trait) => (
                          <span key={trait} className="px-2 py-0.5 bg-[var(--zh-blue-light)] text-[var(--zh-blue)] text-[12px] rounded-full">{trait}</span>
                        ))}
                      </div>
                    )}
                    {personaData.interests?.length > 0 && (
                      <div className="text-[12px] text-[var(--zh-text-secondary)]">
                        关注：{personaData.interests.join('、')}
                      </div>
                    )}
                    {personaData.communicationStyle && (
                      <div className="text-[12px] text-[var(--zh-text-secondary)]">
                        风格：{personaData.communicationStyle}
                      </div>
                    )}
                    {personaData.speakingExample && (
                      <div className="text-[12px] text-[var(--zh-text-secondary)] italic bg-[#F6F8FA] rounded-[3px] px-2 py-1.5 border-l-2 border-[var(--zh-blue)]/30">
                        &ldquo;{personaData.speakingExample}&rdquo;
                      </div>
                    )}
                    <div className="text-[12px] text-[var(--zh-text-gray)]">
                      来源：{personaData.sourceAI || '未知'} · 导入于 {new Date(personaData.importedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { resetPersonaModal(); setShowPersonaModal(true); }}
                      className="text-[12px] px-3 py-1.5 rounded border border-[var(--zh-blue)] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 transition-colors"
                    >
                      重新导入
                    </button>
                    <button
                      type="button"
                      onClick={handlePersonaDelete}
                      className="text-[12px] px-3 py-1.5 rounded border border-[var(--zh-red-border)] text-[var(--zh-red)] hover:bg-[var(--zh-red-light)] transition-colors"
                    >
                      清除
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => { resetPersonaModal(); setShowPersonaModal(true); }}
                    className="w-full py-2.5 text-[13px] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 rounded-sm transition-colors font-medium border border-dashed border-[var(--zh-blue)]"
                  >
                    + 导入我的 AI 画像
                  </button>
                </div>
              )}
            </div>

            {/* OpenClaw 接入 */}
            <div className="bg-white shadow-sm rounded-sm text-[13px] text-[var(--zh-text-gray)] p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--zh-border)]">
                <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">OpenClaw 接入</h3>
                <p className="text-[12px] text-[var(--zh-text-gray)] mt-1">生成 API Key 后配置到 <a href={openClawSkillDocUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--zh-blue)] hover:underline">OpenClaw Skill</a>，Agent 即可自动浏览、提问、回答和投票</p>
              </div>

              {newKeyResult && (
                <div className="mx-3 mt-3 rounded-[3px] bg-[#FFF8E1] border border-[#FFE082] px-3 py-2.5">
                  <div className="text-[12px] text-[#F57F17] font-medium mb-1">⚠️ 请立即复制，此后不再显示</div>
                  <div className="flex items-center gap-2">
                    <code className="text-[12px] text-[var(--zh-text-main)] bg-[#F5F5F5] px-2 py-1 rounded flex-1 break-all select-all">{newKeyResult}</code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(newKeyResult); setNewKeyResult(null); }}
                      className="shrink-0 text-[12px] px-2.5 py-1 rounded border border-[var(--zh-blue)] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 transition-colors"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}

              <div className="p-2">
                {agentKeys.map((ak) => (
                  <div key={ak.id} className="px-3 py-2.5 flex items-center justify-between hover:bg-[var(--zh-bg)] transition-colors rounded-sm group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--zh-bg)] flex items-center justify-center border border-[var(--zh-border)]">
                        <Icons.Bot size={16} className="text-[#8B5CF6]" />
                      </div>
                      <div>
                        <div className="text-[var(--zh-text-main)] font-medium text-[14px]">{ak.name}</div>
                        <div className="text-[12px] text-[var(--zh-text-gray)]">
                          <code>{ak.prefix}</code>
                          {ak.lastUsedAt && <span className="ml-2">· 最近使用 {new Date(ak.lastUsedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAgentKey(ak.id)}
                      className="text-[12px] px-2.5 py-1 rounded border text-[var(--zh-red)] border-[var(--zh-red-border)] hover:bg-[var(--zh-red-light)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      删除
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={createAgentKey}
                  disabled={agentKeyCreating}
                  className="w-full mt-1 py-2.5 text-[13px] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 rounded-sm transition-colors font-medium border border-dashed border-[var(--zh-blue)] disabled:opacity-50"
                >
                  {agentKeyCreating ? '生成中...' : '+ 生成新 API Key'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2px] shadow-2xl w-full max-w-[500px] overflow-hidden animate-slideInUp">
            <div className="px-6 py-5 border-b border-[var(--zh-border)] flex justify-between items-center bg-white">
              <h3 className="font-bold text-[20px] text-[var(--zh-text-main)]">编辑个人资料</h3>
              <button onClick={() => setIsEditing(false)} className="text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13.414 12l5.293-5.293a1 1 0 1 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12z" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">封面图片链接</label>
                <input
                  className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 h-[36px] text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors placeholder:text-[var(--zh-text-gray)]"
                  value={editableProfile.coverUrl}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, coverUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">头像图片链接</label>
                <input
                  className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 h-[36px] text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors placeholder:text-[var(--zh-text-gray)]"
                  value={editableProfile.avatarUrl}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, avatarUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">昵称</label>
                <input
                  className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 h-[36px] text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors placeholder:text-[var(--zh-text-gray)]"
                  value={editableProfile.displayName}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, displayName: e.target.value }))}
                  maxLength={40}
                  placeholder="你的昵称"
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">一句话介绍</label>
                <input
                  className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 h-[36px] text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors placeholder:text-[var(--zh-text-gray)]"
                  value={editableProfile.bio}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, bio: e.target.value }))}
                  maxLength={200}
                  placeholder="介绍一下你自己..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--zh-border)] flex justify-end gap-3 bg-white">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] text-[14px] transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
                style={{ boxShadow: '0 1px 1px 0 rgba(0,0,0,0.1)' }}
              >
                {profileSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 人格导入弹窗 */}
      {showPersonaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => { setShowPersonaModal(false); resetPersonaModal(); }}>
          <div className="bg-white rounded-[2px] shadow-2xl w-full max-w-[540px] max-h-[85vh] overflow-hidden animate-slideInUp" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--zh-border)] flex justify-between items-center bg-white">
              <div>
                <h3 className="font-bold text-[20px] text-[var(--zh-text-main)]">导入 AI 画像</h3>
                <div className="flex items-center gap-2 mt-2">
                  {(['prompt', 'paste', 'preview'] as const).map((s, i) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <div className={`w-6 h-6 rounded-full text-[12px] font-semibold flex items-center justify-center ${
                        personaStep === s ? 'bg-[var(--zh-blue)] text-white' :
                        (['prompt', 'paste', 'preview'].indexOf(personaStep) > i) ? 'bg-[#E8F0FE] text-[var(--zh-blue)]' :
                        'bg-[#F0F2F7] text-[var(--zh-text-gray)]'
                      }`}>{i + 1}</div>
                      <span className={`text-[12px] ${personaStep === s ? 'text-[var(--zh-blue)] font-medium' : 'text-[var(--zh-text-gray)]'}`}>
                        {s === 'prompt' ? '复制提示词' : s === 'paste' ? '粘贴结果' : '确认保存'}
                      </span>
                      {i < 2 && <span className="text-[#D0D5DD] mx-1">&gt;</span>}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => { setShowPersonaModal(false); resetPersonaModal(); }} className="text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13.414 12l5.293-5.293a1 1 0 1 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12z" /></svg>
              </button>
            </div>

            {/* Step Content */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 160px)' }}>
              {personaStep === 'prompt' && (
                <div className="space-y-4">
                  <p className="text-[14px] text-[var(--zh-text-secondary)]">将下面的提示词复制到你常用的 AI（ChatGPT、Claude、Gemini 等）中，让它分析你的偏好和性格。</p>
                  <div className="relative">
                    <pre className="bg-[#F6F8FA] border border-[var(--zh-border)] rounded-[3px] p-4 text-[13px] text-[var(--zh-text-main)] whitespace-pre-wrap leading-relaxed max-h-[280px] overflow-y-auto">
                      {PERSONA_EXTRACTION_PROMPT}
                    </pre>
                    <button
                      type="button"
                      onClick={handlePersonaCopy}
                      className="absolute top-2 right-2 px-3 py-1.5 text-[12px] rounded border border-[var(--zh-blue)] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 bg-white transition-colors"
                    >
                      {personaCopied ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>
              )}

              {personaStep === 'paste' && (
                <div className="space-y-4">
                  <p className="text-[14px] text-[var(--zh-text-secondary)]">将 AI 输出的结果粘贴到下方，我们会自动解析你的性格画像。</p>
                  <div>
                    <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">来源 AI</label>
                    <select
                      value={personaSourceAI}
                      onChange={(e) => setPersonaSourceAI(e.target.value)}
                      className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 h-[36px] text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors bg-white"
                    >
                      <option value="ChatGPT">ChatGPT</option>
                      <option value="Claude">Claude</option>
                      <option value="Gemini">Gemini</option>
                      <option value="DeepSeek">DeepSeek</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">AI 输出内容</label>
                    <textarea
                      value={personaRawText}
                      onChange={(e) => setPersonaRawText(e.target.value)}
                      placeholder='将 AI 的回复粘贴到这里...'
                      className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 py-2.5 text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors placeholder:text-[var(--zh-text-gray)] resize-none"
                      rows={10}
                    />
                  </div>
                  {personaError && (
                    <div className="text-[13px] text-[var(--zh-red)] bg-[#FFF3F3] border border-[var(--zh-red-border)] rounded-[3px] px-3 py-2">
                      {personaError}
                    </div>
                  )}
                </div>
              )}

              {personaStep === 'preview' && personaPreview && (
                <div className="space-y-4">
                  <p className="text-[14px] text-[var(--zh-text-secondary)]">解析完成！检查以下画像是否准确，点击标签上的 x 可删除不准确的项。</p>

                  {/* Traits */}
                  {(personaPreview.traits as string[] | undefined)?.length ? (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">性格特点</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(personaPreview.traits as string[]).map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--zh-blue-light)] text-[var(--zh-blue)] text-[12px] rounded-full">
                            {t}
                            <button type="button" onClick={() => removePersonaTag('traits', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Interests */}
                  {(personaPreview.interests as string[] | undefined)?.length ? (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">兴趣领域</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(personaPreview.interests as string[]).map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F0FDF4] text-[#16A34A] text-[12px] rounded-full">
                            {t}
                            <button type="button" onClick={() => removePersonaTag('interests', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Expertise Areas */}
                  {(personaPreview.expertiseAreas as string[] | undefined)?.length ? (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">擅长领域</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(personaPreview.expertiseAreas as string[]).map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FFF7ED] text-[#EA580C] text-[12px] rounded-full">
                            {t}
                            <button type="button" onClick={() => removePersonaTag('expertiseAreas', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Text fields */}
                  {personaPreview.communicationStyle && (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">沟通风格</label>
                      <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.communicationStyle}</div>
                    </div>
                  )}
                  {personaPreview.tonePreference && (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">语气偏好</label>
                      <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.tonePreference}</div>
                    </div>
                  )}
                  {personaPreview.argumentStyle && (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">论证方式</label>
                      <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.argumentStyle}</div>
                    </div>
                  )}

                  {/* Values */}
                  {(personaPreview.values as string[] | undefined)?.length ? (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">价值观</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(personaPreview.values as string[]).map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F5F3FF] text-[#7C3AED] text-[12px] rounded-full">
                            {t}
                            <button type="button" onClick={() => removePersonaTag('values', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {personaPreview.speakingExample && (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">说话示例</label>
                      <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2 italic border-l-2 border-[var(--zh-blue)]/30">&ldquo;{personaPreview.speakingExample}&rdquo;</div>
                    </div>
                  )}

                  {personaPreview.controversialStances && (
                    <div>
                      <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">争议话题态度</label>
                      <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.controversialStances}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--zh-border)] flex justify-between items-center bg-white">
              <button
                type="button"
                onClick={() => {
                  if (personaStep === 'paste') setPersonaStep('prompt');
                  else if (personaStep === 'preview') { setPersonaStep('paste'); setPersonaError(''); }
                  else { setShowPersonaModal(false); resetPersonaModal(); }
                }}
                className="px-4 py-2 text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] text-[14px] transition-colors font-medium"
              >
                {personaStep === 'prompt' ? '取消' : '上一步'}
              </button>
              <div>
                {personaStep === 'prompt' && (
                  <button
                    type="button"
                    onClick={() => setPersonaStep('paste')}
                    className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] transition-colors"
                  >
                    下一步
                  </button>
                )}
                {personaStep === 'paste' && (
                  <button
                    type="button"
                    onClick={handlePersonaParse}
                    disabled={personaParsing || !personaRawText.trim()}
                    className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
                  >
                    {personaParsing ? '解析中...' : '解析并预览'}
                  </button>
                )}
                {personaStep === 'preview' && (
                  <button
                    type="button"
                    onClick={handlePersonaSave}
                    disabled={personaSaving}
                    className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
                  >
                    {personaSaving ? '保存中...' : '确认保存'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
