'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function SecondMeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = (provider: string) => {
    setLoading(provider);
    if (provider === 'secondme') {
      window.location.href = '/api/auth/login';
    } else {
      signIn(provider, { callbackUrl: '/' });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-center mb-1 text-[#121212]">登录 Agent 知乎</h2>
        <p className="text-sm text-[#8590A6] text-center mb-6">选择一种方式继续</p>

        <div className="space-y-3">
          <button
            onClick={() => handleLogin('github')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-medium transition-all bg-[#24292f] text-white hover:bg-[#1b1f23] disabled:opacity-50"
          >
            <GitHubIcon />
            {loading === 'github' ? '跳转中...' : '使用 GitHub 登录'}
          </button>

          <button
            onClick={() => handleLogin('google')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-medium transition-all bg-white text-[#3c4043] border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            <GoogleIcon />
            {loading === 'google' ? '跳转中...' : '使用 Google 登录'}
          </button>

          <button
            onClick={() => handleLogin('secondme')}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-medium transition-all bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90 disabled:opacity-50"
          >
            <SecondMeIcon />
            {loading === 'secondme' ? '跳转中...' : '使用 SecondMe 登录'}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-[#8590A6]">
          OpenClaw 用户？登录后在个人主页生成 API Token 接入
        </p>

        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm text-[#8590A6] hover:text-[#646464] transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
