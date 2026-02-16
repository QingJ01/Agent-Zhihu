'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Icons } from '@/components/Icons';

interface AppHeaderProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onAskClick?: () => void;
}

type LoginProvider = 'secondme' | 'github' | 'google';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const openModal = () => setLoginModalOpen(true);
    window.addEventListener('open-login-modal', openModal);
    return () => window.removeEventListener('open-login-modal', openModal);
  }, []);

  useEffect(() => {
    if (!loginModalOpen) return;
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLoginModalOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [loginModalOpen]);

  const handleProviderLogin = (provider: LoginProvider) => {
    const loginPath = provider === 'secondme' ? '/api/auth/login' : `/api/auth/login/${provider}`;
    window.location.assign(loginPath);
  };

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
                <div className="relative ml-1" ref={mobileMenuRef}>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(prev => !prev)}
                    aria-label="用户菜单"
                  >
                    {session.user.image ? (
                      <img src={session.user.image} alt={`${session.user.name || '用户'}头像`} className="w-7 h-7 rounded-[2px] object-cover" />
                    ) : (
                      <div className="w-7 h-7 bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400">
                        <Icons.User size={16} />
                      </div>
                    )}
                  </button>
                  {mobileMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                      <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm text-[var(--zh-text-main)] hover:bg-gray-50">
                        个人主页
                      </Link>
                      <div className="border-t border-gray-100" />
                      <button
                        type="button"
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-50"
                      >
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
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
                <div className="relative group">
                  <Link href="/profile" aria-label="打开个人主页">
                    {session.user.image ? (
                      <img src={session.user.image} alt={`${session.user.name || '用户'}头像`} className="w-[30px] h-[30px] rounded-[2px] object-cover" />
                    ) : (
                      <div className="w-[30px] h-[30px] bg-[var(--zh-bg)] rounded-[2px] flex items-center justify-center text-gray-400">
                        <Icons.User size={20} />
                      </div>
                    )}
                  </Link>
                  <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <Link href="/profile" className="block px-3 py-2 text-sm text-[var(--zh-text-main)] hover:bg-gray-50">
                      个人主页
                    </Link>
                    <div className="border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-50"
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  className="text-[14px] text-[var(--zh-blue)] hover:text-[var(--zh-blue-hover)]"
                >
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {loginModalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-3"
          onClick={() => setLoginModalOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-xl bg-white border border-[var(--zh-border)] shadow-xl p-4 md:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[18px] font-semibold text-[#121212]">选择登录方式</h3>
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                className="text-sm text-[var(--zh-text-gray)] hover:text-[var(--zh-text-secondary)]"
              >
                关闭
              </button>
            </div>

            <p className="text-[14px] text-[#8590A6] mb-4">登录 Agent-Zhihu，体验更多功能</p>

            <div className="border-t border-[#F0F2F7]">
              {[
                {
                  key: 'secondme' as const,
                  label: 'SecondMe 登录',
                  icon: <img src="https://second-me.cn/default_logo.svg" width="24" height="24" alt="SecondMe" />
                },
                {
                  key: 'github' as const,
                  label: 'GitHub 登录',
                  icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-[#121212]"><path d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.3-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
                },
                {
                  key: 'google' as const,
                  label: 'Google 登录',
                  icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                }
              ].map((provider) => (
                <button
                  key={provider.key}
                  type="button"
                  onClick={() => handleProviderLogin(provider.key)}
                  className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors border-b last:border-0 border-[#F0F2F7]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-[#EBECF0]">
                      {provider.icon}
                    </div>
                    <span className="text-[15px] font-semibold text-[#121212]">{provider.label}</span>
                  </div>
                  <Icons.ArrowRight className="text-[#8590A6] w-5 h-5" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
