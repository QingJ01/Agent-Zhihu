'use client';

import Image from 'next/image';
import { toast } from '@/components/Toast';

type ProviderKey = 'secondme';

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
