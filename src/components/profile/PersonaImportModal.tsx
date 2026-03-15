'use client';

import { useState, useCallback } from 'react';
import { UserPersona } from '@/types/persona';
import { PERSONA_EXTRACTION_PROMPT } from '@/lib/persona-prompt';

interface PersonaImportModalProps {
  show: boolean;
  onClose: () => void;
  onPersonaSaved: (persona: UserPersona) => void;
}

type PersonaStep = 'prompt' | 'paste' | 'preview';
type PersonaTagField = 'traits' | 'interests' | 'expertiseAreas' | 'values';

export function PersonaImportModal({ show, onClose, onPersonaSaved }: PersonaImportModalProps) {
  const [personaStep, setPersonaStep] = useState<PersonaStep>('prompt');
  const [personaRawText, setPersonaRawText] = useState('');
  const [personaSourceAI, setPersonaSourceAI] = useState('ChatGPT');
  const [personaParsing, setPersonaParsing] = useState(false);
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaPreview, setPersonaPreview] = useState<Partial<UserPersona> | null>(null);
  const [personaCopied, setPersonaCopied] = useState(false);
  const [personaError, setPersonaError] = useState('');

  const resetModal = () => {
    setPersonaStep('prompt');
    setPersonaRawText('');
    setPersonaPreview(null);
    setPersonaError('');
    setPersonaCopied(false);
  };

  const handleClose = () => {
    onClose();
    resetModal();
  };

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(PERSONA_EXTRACTION_PROMPT);
    setPersonaCopied(true);
    setTimeout(() => setPersonaCopied(false), 2000);
  }, []);

  const handleParse = async () => {
    if (!personaRawText.trim()) return;
    setPersonaParsing(true);
    setPersonaError('');
    try {
      const res = await fetch('/api/profile/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: personaRawText, sourceAI: personaSourceAI }),
      });
      const data = await res.json();
      if (res.ok && data.persona) {
        setPersonaPreview(data.persona);
        setPersonaStep('preview');
      } else {
        setPersonaError(data.error || '解析失败，请检查粘贴的内容格式');
      }
    } catch {
      setPersonaError('网络错误，请稍后重试');
    } finally {
      setPersonaParsing(false);
    }
  };

  const handleSave = async () => {
    if (!personaPreview) return;
    setPersonaSaving(true);
    try {
      const res = await fetch('/api/profile/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed: personaPreview, sourceAI: personaSourceAI }),
      });
      const data = await res.json();
      if (res.ok && data.persona) {
        onPersonaSaved(data.persona);
        onClose();
        resetModal();
      }
    } catch {
      /* ignore */
    } finally {
      setPersonaSaving(false);
    }
  };

  const removeTag = (field: PersonaTagField, index: number) => {
    if (!personaPreview) return;
    const arr = [...(personaPreview[field] as string[] || [])];
    arr.splice(index, 1);
    setPersonaPreview({ ...personaPreview, [field]: arr });
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={handleClose}>
      <div className="bg-white rounded-[2px] shadow-2xl w-full max-w-[540px] max-h-[85vh] overflow-hidden animate-slideInUp" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--zh-border)] flex justify-between items-center bg-white">
          <div>
            <h3 className="font-bold text-[20px] text-[var(--zh-text-main)]">导入 AI 画像</h3>
            <div className="flex items-center gap-2 mt-2">
              {(['prompt', 'paste', 'preview'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full text-[12px] font-semibold flex items-center justify-center ${
                    personaStep === s ? 'bg-[var(--zh-blue)] text-white' :
                    (['prompt', 'paste', 'preview'].indexOf(personaStep) > i) ? 'bg-[#E8F0FE] text-[var(--zh-blue)]' :
                    'bg-[#F0F2F7] text-[var(--zh-text-gray)]'
                  }`}>{i + 1}</div>
                  <span className={`text-[12px] ${personaStep === s ? 'text-[var(--zh-blue)] font-medium' : 'text-[var(--zh-text-gray)]'}`}>
                    {s === 'prompt' ? '复制提示词' : s === 'paste' ? '粘贴结果' : '确认保存'}
                  </span>
                  {i < 2 && <span className="text-[#D0D5DD] mx-1">&gt;</span>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={handleClose} className="text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M13.414 12l5.293-5.293a1 1 0 1 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12z" /></svg>
          </button>
        </div>

        {/* Step Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 160px)' }}>
          {personaStep === 'prompt' && (
            <div className="space-y-4">
              <p className="text-[14px] text-[var(--zh-text-secondary)]">将下面的提示词复制到你常用的 AI（ChatGPT、Claude、Gemini 等）中，让它分析你的偏好和性格。</p>
              <div className="relative">
                <pre className="bg-[#F6F8FA] border border-[var(--zh-border)] rounded-[3px] p-4 text-[13px] text-[var(--zh-text-main)] whitespace-pre-wrap leading-relaxed max-h-[280px] overflow-y-auto">
                  {PERSONA_EXTRACTION_PROMPT}
                </pre>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute top-2 right-2 px-3 py-1.5 text-[12px] rounded border border-[var(--zh-blue)] text-[var(--zh-blue)] hover:bg-[var(--zh-blue)]/5 bg-white transition-colors"
                >
                  {personaCopied ? '已复制' : '复制'}
                </button>
              </div>
            </div>
          )}

          {personaStep === 'paste' && (
            <div className="space-y-4">
              <p className="text-[14px] text-[var(--zh-text-secondary)]">将 AI 输出的结果粘贴到下方，我们会自动解析你的性格画像。</p>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">来源 AI</label>
                <select
                  value={personaSourceAI}
                  onChange={(e) => setPersonaSourceAI(e.target.value)}
                  className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 h-[36px] text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors bg-white"
                >
                  <option value="ChatGPT">ChatGPT</option>
                  <option value="Claude">Claude</option>
                  <option value="Gemini">Gemini</option>
                  <option value="DeepSeek">DeepSeek</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-[14px] font-semibold text-[var(--zh-text-main)] mb-2">AI 输出内容</label>
                <textarea
                  value={personaRawText}
                  onChange={(e) => setPersonaRawText(e.target.value)}
                  placeholder='将 AI 的回复粘贴到这里...'
                  className="w-full rounded-[3px] border border-[var(--zh-border)] px-3 py-2.5 text-sm focus:border-[var(--zh-blue)] focus:outline-none transition-colors placeholder:text-[var(--zh-text-gray)] resize-none"
                  rows={10}
                />
              </div>
              {personaError && (
                <div className="text-[13px] text-[var(--zh-red)] bg-[#FFF3F3] border border-[var(--zh-red-border)] rounded-[3px] px-3 py-2">
                  {personaError}
                </div>
              )}
            </div>
          )}

          {personaStep === 'preview' && personaPreview && (
            <div className="space-y-4">
              <p className="text-[14px] text-[var(--zh-text-secondary)]">解析完成！检查以下画像是否准确，点击标签上的 x 可删除不准确的项。</p>

              {/* Traits */}
              {(personaPreview.traits as string[] | undefined)?.length ? (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">性格特点</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(personaPreview.traits as string[]).map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--zh-blue-light)] text-[var(--zh-blue)] text-[12px] rounded-full">
                        {t}
                        <button type="button" onClick={() => removeTag('traits', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Interests */}
              {(personaPreview.interests as string[] | undefined)?.length ? (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">兴趣领域</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(personaPreview.interests as string[]).map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F0FDF4] text-[#16A34A] text-[12px] rounded-full">
                        {t}
                        <button type="button" onClick={() => removeTag('interests', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Expertise Areas */}
              {(personaPreview.expertiseAreas as string[] | undefined)?.length ? (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">擅长领域</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(personaPreview.expertiseAreas as string[]).map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FFF7ED] text-[#EA580C] text-[12px] rounded-full">
                        {t}
                        <button type="button" onClick={() => removeTag('expertiseAreas', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Text fields */}
              {personaPreview.communicationStyle && (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">沟通风格</label>
                  <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.communicationStyle}</div>
                </div>
              )}
              {personaPreview.tonePreference && (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">语气偏好</label>
                  <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.tonePreference}</div>
                </div>
              )}
              {personaPreview.argumentStyle && (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">论证方式</label>
                  <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.argumentStyle}</div>
                </div>
              )}

              {/* Values */}
              {(personaPreview.values as string[] | undefined)?.length ? (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">价值观</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(personaPreview.values as string[]).map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#F5F3FF] text-[#7C3AED] text-[12px] rounded-full">
                        {t}
                        <button type="button" onClick={() => removeTag('values', i)} className="hover:text-[var(--zh-red)]">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {personaPreview.speakingExample && (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">说话示例</label>
                  <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2 italic border-l-2 border-[var(--zh-blue)]/30">&ldquo;{personaPreview.speakingExample}&rdquo;</div>
                </div>
              )}

              {personaPreview.controversialStances && (
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--zh-text-main)] mb-1.5">争议话题态度</label>
                  <div className="text-[13px] text-[var(--zh-text-secondary)] bg-[#F6F8FA] rounded-[3px] px-3 py-2">{personaPreview.controversialStances}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--zh-border)] flex justify-between items-center bg-white">
          <button
            type="button"
            onClick={() => {
              if (personaStep === 'paste') setPersonaStep('prompt');
              else if (personaStep === 'preview') { setPersonaStep('paste'); setPersonaError(''); }
              else handleClose();
            }}
            className="px-4 py-2 text-[var(--zh-text-gray)] hover:text-[var(--zh-text-main)] text-[14px] transition-colors font-medium"
          >
            {personaStep === 'prompt' ? '取消' : '上一步'}
          </button>
          <div>
            {personaStep === 'prompt' && (
              <button
                type="button"
                onClick={() => setPersonaStep('paste')}
                className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] transition-colors"
              >
                下一步
              </button>
            )}
            {personaStep === 'paste' && (
              <button
                type="button"
                onClick={handleParse}
                disabled={personaParsing || !personaRawText.trim()}
                className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
              >
                {personaParsing ? '解析中...' : '解析并预览'}
              </button>
            )}
            {personaStep === 'preview' && (
              <button
                type="button"
                onClick={handleSave}
                disabled={personaSaving}
                className="px-5 py-2 bg-[var(--zh-blue)] text-white rounded-[3px] text-[14px] font-semibold hover:bg-[var(--zh-blue-hover)] disabled:opacity-50 transition-colors"
              >
                {personaSaving ? '保存中...' : '确认保存'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
