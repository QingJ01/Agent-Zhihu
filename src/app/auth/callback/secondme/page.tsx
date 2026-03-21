'use client';

import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';

function CallbackHandler() {
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const attemptSignIn = async () => {
    setError(null);
    setRetrying(true);

    try {
      const baseUrl = window.location.origin;
      const result = await signIn('secondme', {
        callbackUrl: `${baseUrl}/`,
        redirect: false,
      });

      if (result?.ok) {
        window.location.assign(`${baseUrl}/`);
      } else {
        setError('登录失败，请重试');
        setRetrying(false);
      }
    } catch {
      setError('网络错误，请重试');
      setRetrying(false);
    }
  };

  useEffect(() => {
    attemptSignIn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--zh-bg)]">
        <div className="text-center bg-white p-8 border border-[var(--zh-border)] rounded-[2px] max-w-sm mx-4">
          <p className="text-[16px] text-[var(--zh-text-main)] font-medium mb-2">{error}</p>
          <p className="text-[13px] text-[var(--zh-text-gray)] mb-4">可能是网络延迟导致登录凭证过期</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={attemptSignIn}
              disabled={retrying}
              className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
            >
              {retrying ? '重试中...' : '重试'}
            </button>
            <button
              onClick={() => window.location.assign('/api/auth/login')}
              className="px-5 py-2 border border-[var(--zh-border)] text-[var(--zh-text-secondary)] rounded-[3px] text-[14px] font-medium hover:bg-[var(--zh-bg)] transition-colors"
            >
              重新登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-600">正在完成登录...</p>
      </div>
    </div>
  );
}

export default function SecondMeCallbackPage() {
  return <CallbackHandler />;
}
