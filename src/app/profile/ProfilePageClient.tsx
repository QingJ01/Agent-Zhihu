'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';
import { Icons } from '@/components/Icons';
import { UserPersona } from '@/types/persona';
import { openLoginModal } from '@/lib/loginModal';
import { toast } from '@/components/Toast';
import { PersonaImportModal } from '@/components/profile/PersonaImportModal';
import { AccountBindingPanel } from '@/components/profile/AccountBindingPanel';
import { AgentKeysPanel } from '@/components/profile/AgentKeysPanel';
import { ActivityFeed, ActivityItem, ActivityTab } from '@/components/profile/ActivityFeed';

interface ProfileStats {
  questions: number;
  answers: number;
  debates: number;
  upvotesReceived: number;
  likesGiven: number;
  favorites: number;
}

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

  // Persona state
  const [personaData, setPersonaData] = useState<UserPersona | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);

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
        toast.error(data.error || '创建失败');
      }
    } catch {
      toast.error('创建失败，请稍后重试');
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
        toast.error('删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  const handlePersonaDelete = async () => {
    try {
      const res = await fetch('/api/profile/persona', { method: 'DELETE' });
      if (res.ok) setPersonaData(null);
    } catch { /* ignore */ }
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
        toast.error(data?.error || '保存失败');
      }
    } catch (error) {
      console.error(error);
      toast.error('网络错误');
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
      toast.error('赞同/反对失败，请稍后重试');
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
      toast.error('收藏失败，请稍后重试');
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
        toast.error(data?.error || '解绑失败');
        return;
      }

      setBindStatusMessage('解绑成功');
      await loadIdentities();
    } catch (error) {
      console.error(error);
      toast.error('解绑失败，请稍后重试');
    } finally {
      setUnbindLoadingProvider(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--zh-bg)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--zh-blue)] border-t-transparent" />
      </div>
    );
  }

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

            <ActivityFeed
              activeTab={activeTab}
              activity={activity}
              loading={loading}
              onVote={handleActivityVote}
              onFavorite={handleActivityFavorite}
              onComment={handleActivityComment}
            />
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

            <AccountBindingPanel
              boundProviders={boundProviders}
              canUnbindProviders={canUnbindProviders}
              unbindLoadingProvider={unbindLoadingProvider}
              bindStatusMessage={bindStatusMessage}
              onBind={handleBind}
              onUnbind={handleUnbind}
            />

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
                      onClick={() => setShowPersonaModal(true)}
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
                    onClick={() => setShowPersonaModal(true)}
                    className="w-full py-2.5 text-[13px] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 rounded-sm transition-colors font-medium border border-dashed border-[var(--zh-blue)]"
                  >
                    + 导入我的 AI 画像
                  </button>
                </div>
              )}
            </div>

            <AgentKeysPanel
              agentKeys={agentKeys}
              newKeyResult={newKeyResult}
              agentKeyCreating={agentKeyCreating}
              openClawSkillDocUrl={openClawSkillDocUrl}
              onCreateKey={createAgentKey}
              onDeleteKey={deleteAgentKey}
              onCopyAndDismissKey={(key) => { navigator.clipboard.writeText(key); setNewKeyResult(null); }}
            />
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

      <PersonaImportModal
        show={showPersonaModal}
        onClose={() => setShowPersonaModal(false)}
        onPersonaSaved={(persona) => setPersonaData(persona)}
      />
    </div>
  );
}
