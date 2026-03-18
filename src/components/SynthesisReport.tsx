'use client';

import { DebateSynthesis } from '@/types/secondme';

interface SynthesisReportProps {
  synthesis: DebateSynthesis;
  userName: string;
  opponentName: string;
}

export function SynthesisReport({ synthesis, userName, opponentName }: SynthesisReportProps) {
  const winnerName = synthesis.winner === 'user' ? userName : synthesis.winner === 'opponent' ? opponentName : '平局';
  const isUserWin = synthesis.winner === 'user';
  const isTie = synthesis.winner === 'tie';

  return (
    <div className="bg-white border border-[var(--zh-border)] rounded-[2px] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <h2 className="text-[18px] font-bold text-[var(--zh-text-main)]">认知博弈报告</h2>
      </div>

      {/* Winner */}
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-[var(--zh-text-gray)] mb-1">本场胜者</p>
            <p className={`text-[20px] font-bold ${isUserWin ? 'text-[var(--zh-blue)]' : isTie ? 'text-[var(--zh-text-gray)]' : 'text-[#FF6A00]'}`}>
              {winnerName}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-[4px] flex items-center justify-center text-[24px] ${
            isUserWin ? 'bg-[#EBF5FF]' : isTie ? 'bg-[var(--zh-bg)]' : 'bg-[#FFF7F0]'
          }`}>
            {isUserWin ? '🏆' : isTie ? '🤝' : '🎯'}
          </div>
        </div>
        <p className="mt-2 text-[14px] text-[var(--zh-text-secondary)] leading-relaxed">{synthesis.winnerReason}</p>
      </div>

      {/* Consensus */}
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <h3 className="text-[15px] font-bold text-[#00B96B] mb-2">双方共识</h3>
        {synthesis.consensus.map((item, index) => (
          <p key={index} className="text-[14px] text-[var(--zh-text-secondary)] leading-relaxed pl-3 border-l-2 border-[#B7EBD0] mb-1.5">{item}</p>
        ))}
      </div>

      {/* Disagreements */}
      <div className="px-5 py-4 border-b border-[var(--zh-border)]">
        <h3 className="text-[15px] font-bold text-[#FF4D4F] mb-2">核心分歧</h3>
        {synthesis.disagreements.map((item, index) => (
          <p key={index} className="text-[14px] text-[var(--zh-text-secondary)] leading-relaxed pl-3 border-l-2 border-[#FFA39E] mb-1.5">{item}</p>
        ))}
      </div>

      {/* Conclusion */}
      <div className="px-5 py-4 border-b border-[var(--zh-border)] bg-[var(--zh-bg)]">
        <h3 className="text-[15px] font-bold text-[var(--zh-text-main)] mb-2">最终结论</h3>
        <p className="text-[14px] text-[var(--zh-text-secondary)] leading-7">{synthesis.conclusion}</p>
      </div>

      {/* Recommendations */}
      <div className="px-5 py-4">
        <h3 className="text-[15px] font-bold text-[var(--zh-blue)] mb-2">给你的建议</h3>
        {synthesis.recommendations.map((item, index) => (
          <p key={index} className="text-[14px] text-[var(--zh-text-secondary)] leading-relaxed pl-3 border-l-2 border-[#D6E4FF] mb-1.5">
            <span className="text-[var(--zh-blue)] font-medium mr-1">{index + 1}.</span>{item}
          </p>
        ))}
      </div>
    </div>
  );
}
