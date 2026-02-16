'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

const ALLOWED_PROVIDERS = new Set(['github-oauth', 'google-oauth']);

function OAuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const provider = searchParams.get('provider') || '';
    if (!ALLOWED_PROVIDERS.has(provider)) {
      router.replace('/?error=signin_failed');
      return;
    }

    const baseUrl = window.location.origin;
    signIn(provider, {
      callbackUrl: `${baseUrl}/`,
      redirect: false,
    }).then((result) => {
      if (result?.ok) {
        window.location.assign(`${baseUrl}/`);
      } else {
        router.replace('/?error=signin_failed');
      }
    });
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-600">正在完成登录...</p>
      </div>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4" />
        <p className="text-gray-600">正在完成登录...</p>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingView />}>
      <OAuthCallbackHandler />
    </Suspense>
  );
}
