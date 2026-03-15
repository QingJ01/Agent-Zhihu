'use client';

import Image from 'next/image';
import { toast } from '@/components/Toast';

type ProviderKey = 'secondme' | 'github' | 'google';

interface AccountBindingPanelProps {
  boundProviders: Record<ProviderKey, boolean>;
  canUnbindProviders: Record<ProviderKey, boolean>;
  unbindLoadingProvider: ProviderKey | null;
  bindStatusMessage: string;
  onBind: (provider: ProviderKey) => void;
  onUnbind: (provider: ProviderKey) => void;
}

const PROVIDERS: Array<{ key: ProviderKey; label: string; icon: React.ReactNode }> = [
  {
    key: 'secondme',
    label: 'SecondMe',
    icon: <Image src="https://second-me.cn/default_logo.svg" width={20} height={20} alt="SecondMe" unoptimized />,
  },
  {
    key: 'github',
    label: 'GitHub',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.26.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.3-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    key: 'google',
    label: 'Google',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
];

export function AccountBindingPanel({
  boundProviders,
  canUnbindProviders,
  unbindLoadingProvider,
  bindStatusMessage,
  onBind,
  onUnbind,
}: AccountBindingPanelProps) {
  return (
    <div className="bg-white shadow-sm rounded-sm text-[13px] text-[var(--zh-text-gray)] p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">账号绑定</h3>
      </div>
      {bindStatusMessage && (
        <div className="mx-3 mt-3 rounded-[3px] bg-[#F6F8FA] px-3 py-2 text-[13px] text-[var(--zh-text-secondary)]">
          {bindStatusMessage}
        </div>
      )}
      <div className="p-2">
        {PROVIDERS.map((provider) => {
          const isBound = boundProviders[provider.key];
          const canUnbind = canUnbindProviders[provider.key];
          const unbinding = unbindLoadingProvider === provider.key;
          return (
            <div key={provider.key} className="px-3 py-2.5 flex items-center justify-between hover:bg-[var(--zh-bg)] transition-colors rounded-sm group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--zh-bg)] flex items-center justify-center border border-[var(--zh-border)]">
                  {provider.icon}
                </div>
                <span className="text-[var(--zh-text-main)] font-medium text-[14px]">{provider.label}</span>
              </div>

              {isBound ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--zh-text-gray)] flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    已绑定
                  </span>
                  <button
                    type="button"
                    disabled={!canUnbind || unbinding}
                    onClick={() => onUnbind(provider.key)}
                    className={`text-[12px] px-2.5 py-1 rounded border transition-colors ${canUnbind
                      ? 'text-[var(--zh-red)] border-[var(--zh-red-border)] hover:bg-[var(--zh-red-light)]'
                      : 'text-[#B0B0B0] border-[#E5E5E5] cursor-not-allowed'
                      }`}
                    title={canUnbind ? '解绑此账号' : '至少保留一个绑定方式'}
                  >
                    {unbinding ? '解绑中...' : '解绑'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onBind(provider.key)}
                  className="text-[13px] px-3 py-1 rounded transition-colors flex items-center justify-center leading-none text-[var(--zh-blue)] border border-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 font-medium"
                >
                  绑定
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
