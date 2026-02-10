'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function CallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const profile = searchParams.get('profile');
    const accessToken = searchParams.get('accessToken');

    if (profile) {
      // Use window.location.origin to get the correct Cloudflare Tunnel URL
      const baseUrl = window.location.origin;
      signIn('secondme', {
        profile,
        accessToken: accessToken || '',
        callbackUrl: `${baseUrl}/`,
        redirect: false,
      }).then((result) => {
        if (result?.ok) {
          // Manually redirect using the correct origin
          window.location.href = `${baseUrl}/`;
        } else {
          router.push('/?error=signin_failed');
        }
      });
    } else {
      router.push('/?error=missing_profile');
    }
  }, [searchParams, router]);

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
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
