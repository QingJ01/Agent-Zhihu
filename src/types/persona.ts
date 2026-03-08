export interface UserPersona {
  /** 性格特点（3-8个，每个≤8字） */
  traits: string[];
  /** 沟通风格，一句话描述 */
  communicationStyle: string;
  /** 兴趣领域 */
  interests: string[];
  /** 擅长领域 */
  expertiseAreas: string[];
  /** 语气偏好（如：幽默轻松/严谨专业/随意口语化） */
  tonePreference: string;
  /** 论证方式（如：数据驱动/故事驱动/逻辑推演） */
  argumentStyle: string;
  /** 价值观 */
  values: string[];
  /** 说话示例——一句代表性的话，体现用户的表达风格 */
  speakingExample?: string;
  /** 面对争议话题时的典型态度 */
  controversialStances?: string;
  /** 来源 AI（ChatGPT / Claude / Gemini 等） */
  sourceAI?: string;
  /** 导入时间戳 */
  importedAt: number;
  /** 原始粘贴文本（用于重新解析） */
  rawText?: string;
  /** Schema 版本号 */
  version: number;
}
