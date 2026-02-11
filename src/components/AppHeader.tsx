'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { Icons } from '@/components/Icons';

interface AppHeaderProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onAskClick?: () => void;
}

const NAV_ITEMS = [
  { href: '/', label: '首页' },
  { href: '/logs', label: '日志' },
  { href: '/profile', label: '个人主页' },
];

export function AppHeader({ searchValue, onSearchChange, onAskClick }: AppHeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [localSearch, setLocalSearch] = useState('');

  const isControlledSearch = typeof searchValue === 'string' && !!onSearchChange;
  const displayedSearch = isControlledSearch ? searchValue : localSearch;

  const activePath = useMemo(() => {
    if (pathname.startsWith('/question/')) return '/';
    return pathname;
  }, [pathname]);

  const submitSearch = () => {
    const query = displayedSearch.trim();
    if (isControlledSearch) return;
    router.push(query ? `/?q=${encodeURIComponent(query)}` : '/');
  };

  const handleAskClick = () => {
    if (onAskClick) {
      onAskClick();
      return;
    }
    router.push('/?focus=ask');
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-white shadow-sm z-50 border-b border-[var(--zh-border)]">
      <div className="max-w-[1000px] mx-auto px-3 md:px-4">
        <div className="md:hidden py-2">
          <div className="flex items-center justify-between gap-2">
            <Link href="/" className="text-[28px] font-black text-[var(--zh-blue)] leading-none select-none" aria-label="返回首页">
              A知
            </Link>
            <div className="flex items-center gap-1 text-[#999]">
              <button
                type="button"
                onClick={handleAskClick}
                className="px-3 py-1.5 bg-[var(--zh-blue)] text-white rounded-full text-xs font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
              >
                提问
              </button>
              <Link href="/logs" className="p-2 hover:text-[#8590A6]" aria-label="查看日志">
                <Icons.Bell className="w-5 h-5" />
              </Link>
              <Link href="/profile" className="p-2 hover:text-[#8590A6]" aria-label="查看个人主页">
                <Icons.Message className="w-5 h-5" />
              </Link>
              {session?.user ? (
                <Link href="/profile" aria-label="打开个人主页" className="ml-1">
                  {session.user.image ? (
                    <img src={session.user.image} alt={`${session.user.name || '用户'}头像`} className="w-7 h-7 rounded-[2px] object-cover" />
                  ) : (
                    <div className="w-7 h-7 bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400">
                      <Icons.User size={16} />
                    </div>
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/auth/login'; }}
                  className="text-[13px] text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)] px-1"
                >
                  登录
                </button>
              )}
            </div>
          </div>

          <div className="relative mt-2">
            <input
              className="w-full bg-[var(--zh-bg)] border border-transparent focus:bg-white focus:border-[var(--zh-text-gray)] rounded-full pl-4 pr-10 py-2 text-sm transition-all outline-none text-[var(--zh-text-main)] placeholder-[var(--zh-text-gray)]"
              placeholder="搜索你感兴趣的内容..."
              aria-label="搜索内容"
              value={displayedSearch}
              onChange={(e) => {
                if (isControlledSearch && onSearchChange) {
                  onSearchChange(e.target.value);
                  return;
                }
                setLocalSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  submitSearch();
                }
              }}
            />
            <button
              type="button"
              onClick={submitSearch}
              className="absolute right-3 top-2 text-[var(--zh-text-gray)] hover:text-[var(--zh-blue)]"
              aria-label="执行搜索"
            >
              <Icons.Search size={18} />
            </button>
          </div>
        </div>

        <div className="hidden md:flex h-[52px] items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-[30px] font-black text-[var(--zh-blue)] leading-none select-none" aria-label="返回首页">
              A知
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-[15px]" aria-label="主导航">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`font-medium transition-colors ${activePath === item.href
                    ? 'text-[var(--zh-blue)]'
                    : 'text-[var(--zh-text-main)] hover:text-[var(--zh-blue)]'
                    }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4 flex-1 justify-end max-w-xl ml-4">
            <div className="relative hidden sm:block flex-1 max-w-sm">
              <input
                className="w-full bg-[var(--zh-bg)] border border-transparent focus:bg-white focus:border-[var(--zh-text-gray)] rounded-full px-4 py-1.5 text-sm transition-all outline-none text-[var(--zh-text-main)] placeholder-[var(--zh-text-gray)]"
                placeholder="搜索你感兴趣的内容..."
                aria-label="搜索内容"
                value={displayedSearch}
                onChange={(e) => {
                  if (isControlledSearch && onSearchChange) {
                    onSearchChange(e.target.value);
                    return;
                  }
                  setLocalSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    submitSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={submitSearch}
                className="absolute right-3 top-1.5 text-[var(--zh-text-gray)] hover:text-[var(--zh-blue)]"
                aria-label="执行搜索"
              >
                <Icons.Search size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAskClick}
              className="px-5 py-[6px] bg-[var(--zh-blue)] text-white rounded-full text-sm font-medium hover:bg-[var(--zh-blue-hover)] transition-colors"
            >
              提问
            </button>

            <div className="flex items-center gap-6 text-[#999]">
              <Link href="/logs" className="hover:text-[#8590A6]" aria-label="查看日志">
                <Icons.Bell className="w-6 h-6" />
              </Link>
              <Link href="/profile" className="hover:text-[#8590A6]" aria-label="查看个人主页">
                <Icons.Message className="w-6 h-6" />
              </Link>
              {session?.user ? (
                <Link href="/profile" aria-label="打开个人主页">
                  {session.user.image ? (
                    <img src={session.user.image} alt={`${session.user.name || '用户'}头像`} className="w-[30px] h-[30px] rounded-[2px] object-cover" />
                  ) : (
                    <div className="w-[30px] h-[30px] bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400">
                      <Icons.User size={20} />
                    </div>
                  )}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => { window.location.href = '/api/auth/login'; }}
                  className="text-[14px] text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)]"
                >
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
