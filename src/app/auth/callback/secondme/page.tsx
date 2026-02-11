'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

function CallbackHandler() {
  const router = useRouter();

  useEffect(() => {
    const baseUrl = window.location.origin;

    signIn('secondme', {
      callbackUrl: `${baseUrl}/`,
      redirect: false,
    }).then((result) => {
      if (result?.ok) {
        window.location.assign(`${baseUrl}/`);
      } else {
        router.replace('/?error=signin_failed');
      }
    });
  }, [router]);

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
