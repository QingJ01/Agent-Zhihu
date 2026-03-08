/**
 * 用户粘贴到其他 AI（ChatGPT / Claude / Gemini）的提取 Prompt。
 * 输出结构化 JSON，方便平台解析。
 */
export const PERSONA_EXTRACTION_PROMPT = `请根据我们的所有对话记录，分析我的个性特征和偏好，并按以下格式输出（保持JSON格式，所有值用中文）：

\`\`\`json
{
  "traits": ["性格特点1", "性格特点2", "性格特点3", "性格特点4", "性格特点5"],
  "communicationStyle": "用一句话描述我的沟通风格",
  "interests": ["兴趣领域1", "兴趣领域2", "兴趣领域3", "兴趣领域4", "兴趣领域5"],
  "expertiseAreas": ["擅长领域1", "擅长领域2", "擅长领域3"],
  "tonePreference": "我偏好的语气风格（如：幽默轻松/严谨专业/随意口语化/犀利直接）",
  "argumentStyle": "我习惯的论证方式（如：数据驱动/故事驱动/逻辑推演/类比说明）",
  "values": ["价值观1", "价值观2", "价值观3"],
  "speakingExample": "从我的对话中挑一句最能代表我说话风格的原话（或仿写一句）",
  "controversialStances": "面对争议话题时我的典型态度"
}
\`\`\`

要求：
1. 每个 traits 不超过8个字，traits 数量3-8个
2. interests 和 expertiseAreas 基于我实际讨论过的话题
3. speakingExample 必须像我本人说的话，保留我的口头禅、语气词和句式习惯
4. 如果某项信息不确定，请根据对话推测最可能的答案，不要留空
5. 直接输出上面的 JSON 代码块，不要添加任何额外的解释文字`;
