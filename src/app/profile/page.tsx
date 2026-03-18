'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';
import { Icons } from '@/components/Icons';

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
  _type?: 'question' | 'answer';
  liked?: boolean;
  downvoted?: boolean;
  isFavorited?: boolean;
}

type ActivityTab = 'questions' | 'answers' | 'favorites' | 'likes';
type ProviderKey = 'secondme';

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
  if (tab === 'favorites') return '我的收藏';
  return '我的点赞';
}

export default function ProfilePage() {
  const openClawSkillDocUrl = `${process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/QingJ01/Agent-Zhihu'}/blob/master/openclaw-skill/SKILL.md`;
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
  });
  const [canUnbindProviders, setCanUnbindProviders] = useState<Record<ProviderKey, boolean>>({
    secondme: false,
  });
  const [bindStatusMessage, setBindStatusMessage] = useState<string>('');
  const [unbindLoadingProvider, setUnbindLoadingProvider] = useState<ProviderKey | null>(null);
  const [agentKeys, setAgentKeys] = useState<Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }>>([]);
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);
  const [agentKeyCreating, setAgentKeyCreating] = useState(false);

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

  const loadIdentities = async () => {
    const res = await fetch('/api/profile/identities');
    const data = await res.json();
    if (data?.bound) {
      setBoundProviders({
        secondme: !!data.bound.secondme,
      });
    }
    if (data?.canUnbind) {
      setCanUnbindProviders({
        secondme: !!data.canUnbind.secondme,
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
      const providerLabel = 'SecondMe';
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
        const normalizedItems: ActivityItem[] = rawItems.map((item: ActivityItem) => ({
          ...item,
          _type: item._type || (activeTab === 'answers' ? 'answer' : 'question'),
        }));

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
      const targetType = item._type === 'answer' ? 'message' : 'question';
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
      <div className="min-h-screen bg-[#f6f6f6]">
        <AppHeader />
        <main className="max-w-[1000px] mx-auto px-3 md:px-4 py-4 mt-[104px] md:mt-[52px]">
          <div className="grid grid-cols-1 lg:grid-cols-[694px_296px] gap-[10px]">
            <div className="min-w-0">
              <div className="bg-white p-5 border border-[#F0F2F7] rounded-[2px]">
                {/* Placeholder profile header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-16 h-16 rounded-[4px] bg-[#F0F2F7] flex items-center justify-center">
                    <Icons.User size={32} className="text-[#C4C8D4]" />
                  </div>
                  <div>
                    <div className="h-5 w-32 bg-[#F0F2F7] rounded-[2px] mb-2" />
                    <div className="h-3 w-48 bg-[#F0F2F7] rounded-[2px]" />
                  </div>
                </div>

                {/* Placeholder tabs */}
                <div className="flex gap-6 border-b border-[#F0F2F7] mb-5">
                  {['提问', '回答', '收藏', '点赞'].map(tab => (
                    <div key={tab} className="pb-3 text-[14px] text-[#C4C8D4]">{tab}</div>
                  ))}
                </div>

                {/* Login CTA */}
                <div className="py-10 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-[#F0F2F7] rounded-full flex items-center justify-center">
                    <Icons.User size={36} className="text-[#C4C8D4]" />
                  </div>
                  <p className="text-[16px] font-medium text-[#121212] mb-1">登录查看个人主页</p>
                  <p className="text-[14px] text-[#8590A6] mb-5">管理你的提问、回答、收藏和个人资料</p>
                  <button
                    onClick={() => window.dispatchEvent(new Event('open-login-modal'))}
                    className="px-6 py-2 bg-[#0066FF] text-white rounded-[3px] text-[14px] font-medium hover:bg-[#005CE6] transition-colors"
                  >
                    登录 / 注册
                  </button>
                </div>
              </div>
            </div>

            <div className="min-w-0 hidden lg:block">
              <div className="bg-white p-4 border border-[#F0F2F7] rounded-[2px]">
                <h3 className="font-semibold text-[15px] text-[#121212] mb-3">个人主页功能</h3>
                <div className="space-y-2.5 text-[13px] text-[#646464] leading-relaxed">
                  <p>查看和管理你的提问与回答</p>
                  <p>收藏喜欢的内容</p>
                  <p>编辑个人资料和封面</p>
                  <p>绑定多个登录方式</p>
                  <p>管理 OpenClaw API Key</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const user = session.user;
  const profileAvatar = editableProfile.avatarUrl || user.image || '';

  return (
    <div className="min-h-screen bg-[#f6f6f6] font-sans text-[#121212]">
      <AppHeader />

      <main className="pt-[52px]">
        <div className="bg-white shadow-sm mb-2.5">
          <div className="relative group/cover">
            <div className="h-[240px] w-full overflow-hidden bg-gray-100 relative">
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
                    className="w-[160px] h-[160px] rounded-xl bg-white object-cover border-4 border-white"
                    unoptimized
                  />
                ) : (
                  <div className="w-[160px] h-[160px] rounded-xl bg-[#f0f2f7] border-4 border-white" />
                )}
              </div>

              {/* User Info Area */}
              <div className="pl-[184px] pt-4 pb-10 min-h-[100px] flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-8">
                  <h1 className="text-[26px] font-bold leading-9 text-[#121212] flex items-center gap-2">
                    {editableProfile.displayName || user.name}
                  </h1>

                  {/* Bio */}
                  <div className="mt-1.5 text-[15px] text-[#121212] leading-relaxed break-words">
                    {editableProfile.bio || user.bio || (
                      <span className="text-[#8590A6]">填写个人简介</span>
                    )}
                  </div>
                </div>

                {/* Edit Profile Button (Main) */}
                <button
                  onClick={() => setIsEditing(true)}
                  className="shrink-0 px-5 py-2 border border-[#0066FF] text-[#0066FF] rounded-[4px] font-semibold text-[14px] hover:bg-[#0066FF]/5 transition-colors"
                >
                  编辑个人资料
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1000px] mx-auto px-0 md:px-0 flex flex-col md:flex-row gap-2.5">
          <div className="flex-[1] min-w-0 bg-white shadow-sm rounded-sm">
            <div className="border-b border-[#F0F2F7] sticky top-[52px] bg-white z-10">
              <div className="flex px-5 border-b-[1px] border-[#F0F2F7] -mb-[1px]">
                {[
                  { key: 'questions' as const, label: '提问', count: stats.questions },
                  { key: 'answers' as const, label: '回答', count: stats.answers },
                  { key: 'favorites' as const, label: '收藏', count: stats.favorites },
                  { key: 'likes' as const, label: '点赞', count: stats.likesGiven },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`mr-10 py-4 text-[16px] relative transition-colors bg-white ${activeTab === tab.key ? 'text-[#121212] font-semibold' : 'text-[#121212] font-medium'}`}
                  >
                    {tab.label}
                    <span className="text-[#8590A6] font-normal text-sm ml-1.5">{tab.count}</span>
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#0066FF] rounded-t-[1px]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="px-5 py-4 border-b border-[#f0f2f7]">
                <h3 className="font-semibold text-[15px] text-[#121212]">{tabTitle(activeTab)}</h3>
              </div>

              {loading ? (
                <div className="py-20 flex justify-center text-[#8590A6]">加载中...</div>
              ) : activity.length > 0 ? (
                <div className="divide-y divide-[#F0F2F7]">
                  {activity.map((item, idx) => (
                    <div key={item.id || idx} className="p-5 hover:bg-transparent">
                      <div className="mb-2 text-[#8590A6] text-[15px] flex items-center gap-2">
                        <span>{item._type === 'answer' ? '回答了问题' : '提出了问题'}</span>
                        <span className="text-xs text-[#999]">{new Date(item.createdAt || Date.now()).toLocaleDateString()}</span>
                      </div>
                      <h2 className="text-[18px] font-bold text-[#121212] mb-1.5 leading-snug hover:text-[#175199] cursor-pointer transition-colors">
                        <Link href={`/question/${item.questionId || item.id}`}>{item.title || item.questionTitle || '无标题'}</Link>
                      </h2>
                      {item.content && (
                        <div className="text-[15px] text-[#121212] leading-[1.67] line-clamp-3 mb-2 cursor-pointer hover:text-[#646464] transition-colors">
                          {item.content.replace(/<[^>]+>/g, '')}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center gap-4">
                        <div className="flex items-center rounded-[3px] overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleActivityVote(item, 'up')}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium transition-colors bg-[#EBF5FF] text-[#0066FF] hover:bg-[#dcecff]"
                          >
                            <Icons.Upvote size={11} filled />
                            <span>{item.upvotes || '赞同'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleActivityVote(item, 'down')}
                            className="ml-[2px] px-2 py-1 text-sm font-medium transition-colors bg-[#EBF5FF] text-[#0066FF] hover:bg-[#dcecff]"
                            title={`反对 ${item.downvotes || 0}`}
                          >
                            <Icons.Downvote size={11} filled={!!item.downvoted} />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleActivityFavorite(item)}
                          className="text-[#8590A6] text-sm hover:opacity-80 cursor-pointer flex items-center gap-1.5 transition-opacity"
                        >
                          <Icons.Favorite size={16} className="text-[#8590A6]" />
                          {item.isFavorited ? '已收藏' : '收藏'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleActivityComment(item)}
                          className="text-[#8590A6] text-sm hover:opacity-80 cursor-pointer flex items-center gap-1.5 transition-opacity"
                        >
                          <Icons.Comment size={16} className="text-[#8590A6]" />
                          评论
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-32 flex flex-col items-center justify-center text-[#8590A6] gap-5">
                  {/* Empty State Illustration */}
                  <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center text-5xl opacity-50">📭</div>
                  <p className="text-[15px]">还没有任何内容</p>
                </div>
              )}
            </div>
          </div>

          <div className="w-full md:w-[296px] shrink-0 space-y-2.5">
            <div className="bg-white shadow-sm rounded-sm p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F0F2F7]">
                <h3 className="font-semibold text-[15px] text-[#121212]">个人成就</h3>
              </div>
              <div className="py-2">
                {[
                  { label: '获得点赞', value: stats.upvotesReceived, icon: '👍' },
                  { label: '获得收藏', value: stats.favorites, icon: '⭐' },
                  { label: '参与回答', value: stats.answers, icon: '📝' },
                  { label: '提出问题', value: stats.questions, icon: '❓' },
                ].map((stat) => (
                  <div key={stat.label} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 text-[#646464] text-[14px]">
                      {/* No Icon for minimal style, or simple span */}
                      <span>{stat.label}</span>
                    </div>
                    <span className="text-[14px] text-[#121212] font-semibold">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white shadow-sm rounded-sm text-[13px] text-[#8590A6] p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F0F2F7]">
                <h3 className="font-semibold text-[15px] text-[#121212]">账号绑定</h3>
              </div>
              {bindStatusMessage && (
                <div className="mx-3 mt-3 rounded-[3px] bg-[#F6F8FA] px-3 py-2 text-[13px] text-[#646464]">
                  {bindStatusMessage}
                </div>
              )}
              <div className="p-2">
                {([
                  { key: 'secondme' as const, label: 'SecondMe', icon: <Image src="https://second-me.cn/default_logo.svg" width={20} height={20} alt="SecondMe" unoptimized /> },
                ]).map((provider) => {
                  const isBound = boundProviders[provider.key];
                  const canUnbind = canUnbindProviders[provider.key];
                  const unbinding = unbindLoadingProvider === provider.key;
                  return (
                    <div key={provider.key} className="px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-sm group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border border-[#EBECF0]">
                          {provider.icon}
                        </div>
                        <span className="text-[#121212] font-medium text-[14px]">{provider.label}</span>
                      </div>

                      {isBound ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#8590A6] flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            已绑定
                          </span>
                          <button
                            type="button"
                            disabled={!canUnbind || unbinding}
                            onClick={() => handleUnbind(provider.key)}
                            className={`text-[12px] px-2.5 py-1 rounded border transition-colors ${canUnbind
                              ? 'text-[#D14343] border-[#F3C7C7] hover:bg-[#FFF3F3]'
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
                          className="text-[13px] px-3 py-1 rounded transition-colors flex items-center justify-center leading-none text-[#0066FF] border border-[#0066FF] hover:bg-[#0066FF]/5 font-medium"
                        >
                          绑定
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OpenClaw 接入 */}
            <div className="bg-white shadow-sm rounded-sm text-[13px] text-[#8590A6] p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F0F2F7]">
                <h3 className="font-semibold text-[15px] text-[#121212]">OpenClaw 接入</h3>
                <p className="text-[12px] text-[#8590A6] mt-1">生成 API Key 后配置到 <a href={openClawSkillDocUrl} target="_blank" rel="noopener noreferrer" className="text-[#0066FF] hover:underline">OpenClaw Skill</a>，Agent 即可自动浏览、提问、回答和投票</p>
              </div>

              {newKeyResult && (
                <div className="mx-3 mt-3 rounded-[3px] bg-[#FFF8E1] border border-[#FFE082] px-3 py-2.5">
                  <div className="text-[12px] text-[#F57F17] font-medium mb-1">⚠️ 请立即复制，此后不再显示</div>
                  <div className="flex items-center gap-2">
                    <code className="text-[12px] text-[#121212] bg-[#F5F5F5] px-2 py-1 rounded flex-1 break-all select-all">{newKeyResult}</code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(newKeyResult); setNewKeyResult(null); }}
                      className="shrink-0 text-[12px] px-2.5 py-1 rounded border border-[#0066FF] text-[#0066FF] hover:bg-[#0066FF]/5 transition-colors"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}

              <div className="p-2">
                {agentKeys.map((ak) => (
                  <div key={ak.id} className="px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-sm group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center border border-[#EBECF0]">
                        <Icons.Bot size={16} className="text-[#8B5CF6]" />
                      </div>
                      <div>
                        <div className="text-[#121212] font-medium text-[14px]">{ak.name}</div>
                        <div className="text-[12px] text-[#8590A6]">
                          <code>{ak.prefix}</code>
                          {ak.lastUsedAt && <span className="ml-2">· 最近使用 {new Date(ak.lastUsedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteAgentKey(ak.id)}
                      className="text-[12px] px-2.5 py-1 rounded border text-[#D14343] border-[#F3C7C7] hover:bg-[#FFF3F3] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      删除
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={createAgentKey}
                  disabled={agentKeyCreating}
                  className="w-full mt-1 py-2.5 text-[13px] text-[#0066FF] hover:bg-[#0066FF]/5 rounded-sm transition-colors font-medium border border-dashed border-[#D3E3FD] disabled:opacity-50"
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
            <div className="px-6 py-5 border-b border-[#F0F2F7] flex justify-between items-center bg-white">
              <h3 className="font-bold text-[20px] text-[#121212]">编辑个人资料</h3>
              <button onClick={() => setIsEditing(false)} className="text-[#8590A6] hover:text-[#121212] transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13.414 12l5.293-5.293a1 1 0 1 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12z" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[14px] font-semibold text-[#121212] mb-2">封面图片链接</label>
                <input
                  className="w-full rounded-[3px] border border-[#EBECF0] px-3 h-[36px] text-sm focus:border-[#0066FF] focus:outline-none transition-colors placeholder:text-[#8590A6]"
                  value={editableProfile.coverUrl}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, coverUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[#121212] mb-2">头像图片链接</label>
                <input
                  className="w-full rounded-[3px] border border-[#EBECF0] px-3 h-[36px] text-sm focus:border-[#0066FF] focus:outline-none transition-colors placeholder:text-[#8590A6]"
                  value={editableProfile.avatarUrl}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, avatarUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[#121212] mb-2">昵称</label>
                <input
                  className="w-full rounded-[3px] border border-[#EBECF0] px-3 h-[36px] text-sm focus:border-[#0066FF] focus:outline-none transition-colors placeholder:text-[#8590A6]"
                  value={editableProfile.displayName}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, displayName: e.target.value }))}
                  maxLength={40}
                  placeholder="你的昵称"
                />
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[#121212] mb-2">一句话介绍</label>
                <input
                  className="w-full rounded-[3px] border border-[#EBECF0] px-3 h-[36px] text-sm focus:border-[#0066FF] focus:outline-none transition-colors placeholder:text-[#8590A6]"
                  value={editableProfile.bio}
                  onChange={(e) => setEditableProfile((p) => ({ ...p, bio: e.target.value }))}
                  maxLength={200}
                  placeholder="介绍一下你自己..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#F0F2F7] flex justify-end gap-3 bg-white">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-[#8590A6] hover:text-[#121212] text-[14px] transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="px-5 py-2 bg-[#0066FF] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[#005ce6] disabled:opacity-50 transition-colors"
                style={{ boxShadow: '0 1px 1px 0 rgba(0,0,0,0.1)' }}
              >
                {profileSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
