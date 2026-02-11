'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AppHeader } from '@/components/AppHeader';

interface ProfileStats {
  questions: number;
  answers: number;
  debates: number;
  upvotesReceived: number;
  likesGiven: number;
  favorites: number;
  debateRecord: { wins: number; losses: number; ties: number };
  topTags: Array<{ tag: string; count: number }>;
  recentOpponents: Array<{
    name: string;
    avatar: string;
    topic: string;
    result: 'user' | 'opponent' | 'tie';
    time: string;
  }>;
}

interface SecondMeData {
  shades: Array<{ id: string; name: string; description: string; personality?: string }>;
  softMemory: { traits?: string[]; interests?: string[] } | null;
}

interface ActivityItem {
  id?: string;
  _id?: string;
  title?: string;
  description?: string;
  content?: string;
  questionId?: string;
  questionTitle?: string;
  topic?: string;
  status?: string;
  upvotes?: number;
  createdAt?: string | number;
  messages?: Array<unknown>;
  synthesis?: { conclusion?: string };
  _type?: 'question' | 'answer';
  author?: { name?: string };
}

type ActivityTab = 'questions' | 'answers' | 'likes' | 'favorites';

interface Badge {
  id: string;
  icon: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

function getBadges(stats: ProfileStats): Badge[] {
  return [
    { id: 'first-q', icon: '💡', name: '初次发问', desc: '提出首个问题', unlocked: stats.questions >= 1 },
    { id: 'five-q', icon: '🔥', name: '好奇宝宝', desc: '提出5个问题', unlocked: stats.questions >= 5 },
    { id: 'answer-10', icon: '💬', name: '话题达人', desc: '发表10条回答', unlocked: stats.answers >= 10 },
    { id: 'liked-50', icon: '👍', name: '人气之星', desc: '获得50个赞', unlocked: stats.upvotesReceived >= 50 },
  ];
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [secondMe, setSecondMe] = useState<SecondMeData | null>(null);
  const [activeTab, setActiveTab] = useState<ActivityTab>('questions');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch stats
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/profile/stats')
      .then(res => res.json())
      .then(setStats)
      .catch(console.error);
  }, [session]);

  // Fetch SecondMe data
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/profile/secondme')
      .then(res => res.json())
      .then(setSecondMe)
      .catch(console.error);
  }, [session]);

  // Fetch activity
  useEffect(() => {
    if (!session?.user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/profile/activity?type=${activeTab}&page=${page}&limit=10`)
      .then(res => res.json())
      .then(data => {
        if (page === 1) {
          setActivity(data.items || []);
        } else {
          setActivity(prev => [...prev, ...(data.items || [])]);
        }
        setHasMore(data.hasMore || false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session, activeTab, page]);

  const handleTabChange = (tab: ActivityTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setPage(1);
    setActivity([]);
  };

  function formatTime(ts: string | number | undefined) {
    if (!ts) return '';
    return new Date(ts).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">请先登录后查看个人主页</p>
        <Link href="/" className="text-blue-600 hover:underline">返回首页</Link>
      </div>
    );
  }

  const user = session.user;
  const tabs: { key: ActivityTab; label: string }[] = [
    { key: 'questions', label: '我的提问' },
    { key: 'answers', label: '我的回答' },
    { key: 'likes', label: '我的点赞' },
    { key: 'favorites', label: '我的收藏' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-3 md:px-4 py-4 md:py-6 mt-[104px] md:mt-[52px] space-y-4">
        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
            {user.image ? (
              <img src={user.image} alt={`${user.name || '用户'}头像`} className="w-20 h-20 rounded-full border-2 border-blue-500 object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
                {user.name?.charAt(0) || '?'}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[#121212]">{user.name}</h2>
              {user.bio && <p className="text-[14px] md:text-[15px] text-[#646464] mt-1 break-words">{user.bio}</p>}
              {user.email && <p className="text-sm text-[#8590A6] mt-0.5">{user.email}</p>}
              <span className="inline-flex items-center mt-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                已连接 SecondMe
              </span>
            </div>
          </div>
        </div>

        {/* SecondMe Personality Panel */}
        {secondMe && (secondMe.shades?.length > 0 || secondMe.softMemory?.traits?.length || secondMe.softMemory?.interests?.length) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
            <h3 className="text-sm font-medium text-gray-800 mb-3">SecondMe 人格画像</h3>

            {secondMe.softMemory?.traits && secondMe.softMemory.traits.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1.5">性格特征</p>
                <div className="flex flex-wrap gap-2">
                  {secondMe.softMemory.traits.map((t, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-purple-50 text-purple-600">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {secondMe.softMemory?.interests && secondMe.softMemory.interests.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-500 mb-1.5">兴趣爱好</p>
                <div className="flex flex-wrap gap-2">
                  {secondMe.softMemory.interests.map((t, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-teal-50 text-teal-600">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {secondMe.shades && secondMe.shades.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5">人格分身</p>
                <div className="space-y-2">
                  {secondMe.shades.map(shade => (
                    <div key={shade.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-sm font-medium text-[#121212]">{shade.name}</p>
                      {shade.description && <p className="text-xs text-[#646464] mt-0.5">{shade.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">提问</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{stats?.questions ?? '-'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">回答</p>
            <p className="mt-1 text-2xl font-bold text-purple-600">{stats?.answers ?? '-'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">获赞</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats?.upvotesReceived ?? '-'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {stats && stats.topTags && stats.topTags.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-medium text-gray-800 mb-3">关注话题</h3>
              <div className="flex flex-wrap gap-2">
                {stats.topTags.map((t, i) => (
                  <span
                    key={t.tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-colors hover:bg-[#ebf5ff] hover:text-[#0066FF]"
                    style={{
                      backgroundColor: i < 3 ? '#ebf5ff' : '#f5f5f5',
                      color: i < 3 ? '#0066FF' : '#646464',
                    }}
                  >
                    {t.tag}
                    <span className="text-[10px] opacity-60">({t.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Achievement Badges */}
        {stats && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
            <h3 className="text-sm font-medium text-gray-800 mb-3">成就徽章</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {getBadges(stats).map(badge => (
                <div
                  key={badge.id}
                  className={`text-center p-3 rounded-lg border transition-colors ${
                    badge.unlocked
                      ? 'bg-gradient-to-b from-amber-50 to-white border-amber-200'
                      : 'bg-gray-50 border-gray-100 opacity-40'
                  }`}
                >
                  <span className="text-2xl">{badge.icon}</span>
                  <p className="text-[11px] font-medium text-[#121212] mt-1">{badge.name}</p>
                  <p className="text-[10px] text-[#8590A6]">{badge.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Tabs */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 md:px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {stats && <span className="ml-1 text-xs text-gray-400">({tab.key === 'likes' ? stats.likesGiven : tab.key === 'favorites' ? stats.favorites : stats[tab.key]})</span>}
              </button>
            ))}
          </div>

          <div className="divide-y divide-gray-100">
            {loading && activity.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent mx-auto" />
              </div>
            ) : activity.length === 0 ? (
              <div className="px-4 py-10 text-center text-gray-500 text-sm">
                暂无记录
              </div>
            ) : (
              <>
                {activity.map((item, idx) => (
                  <div key={item.id || item._id || idx} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    {activeTab === 'questions' && (
                      <div>
                        <Link href={`/question/${item.id || item._id}`} className="text-sm font-medium text-[#121212] hover:text-blue-600">
                          {item.title}
                        </Link>
                        {item.description && (
                          <p className="text-xs text-[#646464] mt-1 line-clamp-2">{item.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8590A6]">
                          <span>{item.upvotes || 0} 赞</span>
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                      </div>
                    )}

                    {activeTab === 'answers' && (
                      <div>
                        {item.questionTitle && (
                          <Link href={`/question/${item.questionId}`} className="text-xs text-blue-600 hover:underline">
                            {item.questionTitle}
                          </Link>
                        )}
                        <p className="text-sm text-[#121212] mt-1 line-clamp-3">{item.content}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8590A6]">
                          <span>{item.upvotes || 0} 赞</span>
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                      </div>
                    )}

                    {(activeTab === 'likes' || activeTab === 'favorites') && (
                      <div>
                        {item._type === 'question' ? (
                          <>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-50 text-blue-600">问题</span>
                            </div>
                            <Link href={`/question/${item.id || item._id}`} className="text-sm font-medium text-[#121212] hover:text-blue-600">
                              {item.title}
                            </Link>
                            {item.description && (
                              <p className="text-xs text-[#646464] mt-1 line-clamp-2">{item.description}</p>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-50 text-purple-600">回答</span>
                              {item.author?.name && (
                                <span className="text-[10px] text-[#8590A6]">by {item.author.name}</span>
                              )}
                            </div>
                            {item.questionTitle && (
                              <Link href={`/question/${item.questionId}`} className="text-xs text-blue-600 hover:underline">
                                {item.questionTitle}
                              </Link>
                            )}
                            <p className="text-sm text-[#121212] mt-1 line-clamp-3">{item.content}</p>
                          </>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8590A6]">
                          <span>{item.upvotes || 0} 赞</span>
                          {activeTab === 'favorites' && <span>已收藏</span>}
                          <span>{formatTime(item.createdAt)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {hasMore && (
                  <div className="px-4 py-3 text-center">
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={loading}
                      className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {loading ? '加载中...' : '加载更多'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
