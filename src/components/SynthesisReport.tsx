'use client';

import { DebateSynthesis } from '@/types/secondme';

interface SynthesisReportProps {
  synthesis: DebateSynthesis;
  userName: string;
  opponentName: string;
}

export function SynthesisReport({ synthesis, userName, opponentName }: SynthesisReportProps) {
  const winnerName = synthesis.winner === 'user' ? userName : synthesis.winner === 'opponent' ? opponentName : '平局';
  const winnerColor = synthesis.winner === 'user' ? 'text-[var(--zh-blue)]' : synthesis.winner === 'opponent' ? 'text-orange-600' : 'text-[var(--zh-text-gray)]';

  return (
    <div className="space-y-[-1px]">
      {/* Winner */}
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[var(--zh-text-gray)] mb-1">本场胜者</p>
            <p className={`text-[20px] font-semibold ${winnerColor}`}>{winnerName}</p>
          </div>
          <span className="text-[28px]">
            {synthesis.winner === 'user' ? '🏆' : synthesis.winner === 'opponent' ? '🎯' : '🤝'}
          </span>
        </div>
        <p className="mt-2 text-[14px] text-[var(--zh-text-secondary)]">{synthesis.winnerReason}</p>
      </div>

      {/* Consensus */}
      {synthesis.consensus.length > 0 && (
        <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
          <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)] mb-2">双方共识</h3>
          <ul className="space-y-1.5">
            {synthesis.consensus.map((item, idx) => (
              <li key={idx} className="text-[14px] text-[var(--zh-text-secondary)] flex items-start gap-2">
                <span className="text-green-500 mt-0.5 flex-shrink-0">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disagreements */}
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
        <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)] mb-2">核心分歧</h3>
        <ul className="space-y-1.5">
          {synthesis.disagreements.map((item, idx) => (
            <li key={idx} className="text-[14px] text-[var(--zh-text-secondary)] flex items-start gap-2">
              <span className="text-red-400 mt-0.5 flex-shrink-0">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Conclusion */}
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
        <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)] mb-2">最终结论</h3>
        <p className="text-[14px] text-[var(--zh-text-secondary)] leading-relaxed">{synthesis.conclusion}</p>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-[2px] border border-[var(--zh-border)] p-4">
        <h3 className="text-[15px] font-semibold text-[var(--zh-text-main)] mb-2">给你的建议</h3>
        <ul className="space-y-1.5">
          {synthesis.recommendations.map((item, idx) => (
            <li key={idx} className="text-[14px] text-[var(--zh-text-secondary)] flex items-start gap-2">
              <span className="text-[var(--zh-blue)] mt-0.5 flex-shrink-0">{idx + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
