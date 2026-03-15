'use client';

import { useCallback, useState } from 'react';
import { toast } from '@/components/Toast';
import { openLoginModal } from '@/lib/loginModal';

export function useFavorite(
  targetId: string,
  targetType: 'question' | 'message',
  currentUserId: string | undefined,
  onFavoriteChange?: (id: string, favorited: boolean) => void,
) {
  const [isFavoriting, setIsFavoriting] = useState(false);

  const toggleFavorite = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!currentUserId) {
        openLoginModal();
        return;
      }
      if (isFavoriting) return;

      setIsFavoriting(true);
      try {
        const response = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId, targetType }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || '收藏失败');
        }

        const result = await response.json();
        onFavoriteChange?.(targetId, !!result.favorited);
      } catch (error) {
        console.error(`${targetType} favorite failed:`, error);
        toast.error('收藏失败，请稍后再试');
      } finally {
        setIsFavoriting(false);
      }
    },
    [currentUserId, isFavoriting, targetId, targetType, onFavoriteChange],
  );

  return { isFavoriting, toggleFavorite };
}
