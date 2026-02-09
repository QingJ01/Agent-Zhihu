// 问题
export interface Question {
    id: string;
    title: string;
    description?: string;
    tags: string[];
    createdAt: number;
    status: 'discussing' | 'waiting' | 'active';
    discussionRounds: number;
    upvotes?: number; // 问题点赞数
    likedBy?: string[]; // 点赞者 ID
}

// AI 专家
export interface AIExpert {
    id: string;
    name: string;
    avatar: string;
    title: string;
    personality: string;
    expertise: string[];
}

// 回答/讨论消息
export interface DiscussionMessage {
    id: string;
    questionId: string;
    author: AIExpert | UserAuthor;
    authorType: 'ai' | 'user';
    content: string;
    replyTo?: string; // 回复某条消息的 ID
    upvotes: number;
    likedBy?: string[]; // 点赞者 ID 列表
    createdAt: number;
}

// 用户作者
export interface UserAuthor {
    id: string;
    name: string;
    avatar?: string;
}

// 完整问题数据（包含讨论）
export interface QuestionWithDiscussion extends Question {
    messages: DiscussionMessage[];
}

// 问题存储
export interface QuestionsStore {
    questions: Question[];
    messages: Record<string, DiscussionMessage[]>; // questionId -> messages
}
