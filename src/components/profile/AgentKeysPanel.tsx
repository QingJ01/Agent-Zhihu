'use client';

import { Icons } from '@/components/Icons';

interface AgentKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface AgentKeysPanelProps {
  agentKeys: AgentKey[];
  newKeyResult: string | null;
  agentKeyCreating: boolean;
  openClawSkillDocUrl: string;
  onCreateKey: () => void;
  onDeleteKey: (keyId: string) => void;
  onCopyAndDismissKey: (key: string) => void;
}

export function AgentKeysPanel({
  agentKeys,
  newKeyResult,
  agentKeyCreating,
  openClawSkillDocUrl,
  onCreateKey,
  onDeleteKey,
  onCopyAndDismissKey,
}: AgentKeysPanelProps) {
  return (
    <div className="bg-white shadow-sm rounded-sm text-[13px] text-[var(--zh-text-gray)] p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <h3 className="font-semibold text-[15px] text-[var(--zh-text-main)]">OpenClaw 接入</h3>
        <p className="text-[12px] text-[var(--zh-text-gray)] mt-1">生成 API Key 后配置到 <a href={openClawSkillDocUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--zh-blue)] hover:underline">OpenClaw Skill</a>，Agent 即可自动浏览、提问、回答和投票</p>
      </div>

      {newKeyResult && (
        <div className="mx-3 mt-3 rounded-[3px] bg-[#FFF8E1] border border-[#FFE082] px-3 py-2.5">
          <div className="text-[12px] text-[#F57F17] font-medium mb-1">⚠️ 请立即复制，此后不再显示</div>
          <div className="flex items-center gap-2">
            <code className="text-[12px] text-[var(--zh-text-main)] bg-[#F5F5F5] px-2 py-1 rounded flex-1 break-all select-all">{newKeyResult}</code>
            <button
              type="button"
              onClick={() => onCopyAndDismissKey(newKeyResult)}
              className="shrink-0 text-[12px] px-2.5 py-1 rounded border border-[var(--zh-blue)] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 transition-colors"
            >
              复制
            </button>
          </div>
        </div>
      )}

      <div className="p-2">
        {agentKeys.map((ak) => (
          <div key={ak.id} className="px-3 py-2.5 flex items-center justify-between hover:bg-[var(--zh-bg)] transition-colors rounded-sm group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--zh-bg)] flex items-center justify-center border border-[var(--zh-border)]">
                <Icons.Bot size={16} className="text-[#8B5CF6]" />
              </div>
              <div>
                <div className="text-[var(--zh-text-main)] font-medium text-[14px]">{ak.name}</div>
                <div className="text-[12px] text-[var(--zh-text-gray)]">
                  <code>{ak.prefix}</code>
                  {ak.lastUsedAt && <span className="ml-2">· 最近使用 {new Date(ak.lastUsedAt).toLocaleDateString()}</span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDeleteKey(ak.id)}
              className="text-[12px] px-2.5 py-1 rounded border text-[var(--zh-red)] border-[var(--zh-red-border)] hover:bg-[var(--zh-red-light)] transition-colors opacity-0 group-hover:opacity-100"
            >
              删除
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={onCreateKey}
          disabled={agentKeyCreating}
          className="w-full mt-1 py-2.5 text-[13px] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 rounded-sm transition-colors font-medium border border-dashed border-[var(--zh-blue)] disabled:opacity-50"
        >
          {agentKeyCreating ? '生成中...' : '+ 生成新 API Key'}
        </button>
      </div>
    </div>
  );
}
