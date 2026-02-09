'use client';

import { DebateSynthesis } from '@/types/secondme';

interface SynthesisReportProps {
  synthesis: DebateSynthesis;
  userName: string;
  opponentName: string;
}

export function SynthesisReport({ synthesis, userName, opponentName }: SynthesisReportProps) {
  const winnerName = synthesis.winner === 'user' ? userName : synthesis.winner === 'opponent' ? opponentName : '平局';
  const winnerColor = synthesis.winner === 'user' ? 'text-blue-600' : synthesis.winner === 'opponent' ? 'text-orange-600' : 'text-gray-600';
  const winnerBg = synthesis.winner === 'user' ? 'from-blue-500 to-purple-600' : synthesis.winner === 'opponent' ? 'from-orange-500 to-red-600' : 'from-gray-400 to-gray-600';

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className={`bg-gradient-to-r ${winnerBg} p-6 text-white`}>
        <h2 className="text-2xl font-bold mb-2">认知博弈报告</h2>
        <p className="opacity-90">Cognitive Battle Report</p>
      </div>

      {/* Winner Section */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">本场胜者</p>
            <p className={`text-2xl font-bold ${winnerColor}`}>{winnerName}</p>
          </div>
          <div className={`w-16 h-16 rounded-full bg-gradient-to-r ${winnerBg} flex items-center justify-center`}>
            <span className="text-3xl">
              {synthesis.winner === 'user' ? '🏆' : synthesis.winner === 'opponent' ? '🎯' : '🤝'}
            </span>
          </div>
        </div>
        <p className="mt-3 text-gray-600">{synthesis.winnerReason}</p>
      </div>

      {/* Consensus */}
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold text-green-600 mb-3 flex items-center gap-2">
          <span>✅</span> 双方共识
        </h3>
        <ul className="space-y-2">
          {synthesis.consensus.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-gray-700">
              <span className="text-green-500 mt-1">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Disagreements */}
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold text-red-600 mb-3 flex items-center gap-2">
          <span>⚔️</span> 核心分歧
        </h3>
        <ul className="space-y-2">
          {synthesis.disagreements.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-gray-700">
              <span className="text-red-500 mt-1">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Conclusion */}
      <div className="p-6 border-b bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span>💡</span> 最终结论
        </h3>
        <p className="text-gray-700 leading-relaxed">{synthesis.conclusion}</p>
      </div>

      {/* Recommendations */}
      <div className="p-6">
        <h3 className="text-lg font-semibold text-purple-600 mb-3 flex items-center gap-2">
          <span>📌</span> 给你的建议
        </h3>
        <ul className="space-y-2">
          {synthesis.recommendations.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-gray-700">
              <span className="text-purple-500 mt-1">{index + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
