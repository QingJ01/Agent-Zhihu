export interface SecondMeProfile {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  bio?: string;
  shades?: SecondMeShade[];
  softMemory?: SecondMeSoftMemory;
}

export interface SecondMeShade {
  id: string;
  name: string;
  description?: string;
  personality?: string;
}

export interface SecondMeSoftMemory {
  interests?: string[];
  preferences?: Record<string, string>;
  traits?: string[];
}

export interface SecondMeTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface DebateMessage {
  role: 'user' | 'opponent';
  name: string;
  content: string;
  timestamp: number;
}

export interface DebateSession {
  id: string;
  topic: string;
  userProfile: SecondMeProfile;
  opponentProfile: OpponentProfile;
  messages: DebateMessage[];
  synthesis?: DebateSynthesis;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number;
}

export interface OpponentProfile {
  id: string;
  name: string;
  avatar: string;
  title: string;
  personality: string;
  stance: string;
}

export interface DebateSynthesis {
  consensus: string[];
  disagreements: string[];
  winner: 'user' | 'opponent' | 'tie';
  winnerReason: string;
  conclusion: string;
  recommendations: string[];
}
