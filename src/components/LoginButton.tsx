'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { LoginModal } from '@/components/LoginModal';

export function LoginButton() {
  const { data: session, status } = useSession();
  const [showModal, setShowModal] = useState(false);

  if (status === 'loading') {
    return (
      <button
        disabled
        className="px-6 py-3 bg-gray-200 text-gray-500 rounded-full font-medium"
      >
        加载中...
      </button>
    );
  }

  if (session?.user) {
    const providers = session.user.linkedProviders || [];
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          {session.user.image && (
            <img
              src={session.user.image}
              alt={session.user.name || 'User'}
              className="w-10 h-10 rounded-full border-2 border-blue-500"
            />
          )}
          <div className="text-left">
            <p className="font-medium text-gray-900">{session.user.name}</p>
            <p className="text-sm text-gray-500">
              {providers.length > 0
                ? `已连接 ${providers.map(p => p === 'github' ? 'GitHub' : p === 'google' ? 'Google' : 'SecondMe').join(', ')}`
                : '已登录'}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          退出
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
      >
        登录
      </button>
      <LoginModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}
