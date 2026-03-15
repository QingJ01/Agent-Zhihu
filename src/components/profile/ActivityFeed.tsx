'use client';

import Link from 'next/link';
import { Icons } from '@/components/Icons';

export interface ActivityItem {
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

export type ActivityTab = 'questions' | 'answers' | 'debates' | 'favorites' | 'likes';

interface ActivityFeedProps {
  activeTab: ActivityTab;
  activity: ActivityItem[];
  loading: boolean;
  onVote: (item: ActivityItem, voteType: 'up' | 'down') => void;
  onFavorite: (item: ActivityItem) => void;
  onComment: (item: ActivityItem) => void;
}

function tabTitle(tab: ActivityTab): string {
  if (tab === 'questions') return '我的提问';
  if (tab === 'answers') return '我的回答';
  if (tab === 'debates') return '我的辩论';
  if (tab === 'favorites') return '我的收藏';
  return '我的点赞';
}

export function ActivityFeed({ activeTab, activity, loading, onVote, onFavorite, onComment }: ActivityFeedProps) {
  return (
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onVote(item, 'up')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                      >
                        <Icons.Upvote size={10} filled={!!item.liked} />
                        <span>赞同{item.upvotes ? ` ${item.upvotes}` : ''}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onVote(item, 'down')}
                        className="flex items-center px-3 py-1.5 text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onVote(item, 'up')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                      >
                        <Icons.Upvote size={10} filled />
                        <span>赞同{item.upvotes ? ` ${item.upvotes}` : ''}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onVote(item, 'down')}
                        className="flex items-center px-3 py-1.5 text-sm font-medium transition-colors rounded-[3px] bg-[var(--zh-blue-light)] text-[var(--zh-blue)] hover:bg-[#D6EAFF]"
                        title={`反对 ${item.downvotes || 0}`}
                      >
                        <Icons.Downvote size={10} filled={!!item.downvoted} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFavorite(item)}
                      className="text-[var(--zh-text-gray)] text-sm hover:opacity-80 cursor-pointer flex items-center gap-1.5 transition-opacity"
                    >
                      <Icons.Favorite size={16} className="text-[var(--zh-text-gray)]" />
                      {item.isFavorited ? '已收藏' : '收藏'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onComment(item)}
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
  );
}
