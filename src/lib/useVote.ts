'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/components/Toast';
import { openLoginModal } from '@/lib/loginModal';

export interface VotePayload {
  liked: boolean;
  downvoted: boolean;
  upvotes: number;
  downvotes: number;
}

export function useVote(
  targetId: string,
  targetType: 'question' | 'message' | 'debate',
  currentUserId: string | undefined,
  onVoteChange?: (id: string, payload: VotePayload) => void,
) {
  const [isVoting, setIsVoting] = useState(false);

  const vote = useCallback(
    async (voteType: 'up' | 'down', e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!currentUserId) {
        openLoginModal();
        return;
      }
      if (isVoting) return;

      setIsVoting(true);
      try {
        const response = await fetch('/api/likes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId, targetType, voteType }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || '操作失败');
        }

        const result = await response.json();
        onVoteChange?.(targetId, {
          liked: !!result.liked,
          downvoted: !!result.downvoted,
          upvotes: Number(result.upvotes) || 0,
          downvotes: Number(result.downvotes) || 0,
        });
      } catch (error) {
        console.error(`${targetType} vote failed:`, error);
        toast.error(voteType === 'up' ? '赞同失败，请稍后再试' : '反对失败，请稍后再试');
      } finally {
        setIsVoting(false);
      }
    },
    [currentUserId, isVoting, targetId, targetType, onVoteChange],
  );

  return { isVoting, vote };
}
