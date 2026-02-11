'use client';

import { DebateMessage } from '@/types/secondme';
import { useEffect, useRef } from 'react';

interface ChatBubbleProps {
  message: DebateMessage;
  isUser: boolean;
  avatar?: string;
  isTyping?: boolean;
}

export function ChatBubble({ message, isUser, avatar, isTyping }: ChatBubbleProps) {
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fadeIn`}>
      <div className="flex-shrink-0">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
            isUser
              ? 'bg-gradient-to-br from-blue-500 to-purple-600'
              : 'bg-gradient-to-br from-orange-500 to-red-600'
          }`}
        >
          {avatar ? (
            <img src={avatar} alt={message.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            message.name.charAt(0)
          )}
        </div>
      </div>
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[70%]`}>
        <span className={`text-sm font-medium mb-1 ${isUser ? 'text-blue-600' : 'text-orange-600'}`}>
          {message.name}
        </span>
        <div
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-tr-sm'
              : 'bg-gray-100 text-gray-800 rounded-tl-sm'
          }`}
        >
          {isTyping ? (
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface ChatListProps {
  messages: DebateMessage[];
  userAvatar?: string;
  opponentAvatar?: string;
  isGenerating?: boolean;
  currentSpeaker?: 'user' | 'opponent';
}

export function ChatList({ messages, userAvatar, opponentAvatar, isGenerating, currentSpeaker }: ChatListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);


  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message, index) => (
        <ChatBubble
          key={index}
          message={message}
          isUser={message.role === 'user'}
          avatar={message.role === 'user' ? userAvatar : opponentAvatar}
        />
      ))}
      {isGenerating && currentSpeaker && (
        <ChatBubble
          message={{
            role: currentSpeaker,
            name: currentSpeaker === 'user' ? '我的Agent' : '对手',
            content: '',
            timestamp: messages[messages.length - 1]?.timestamp ?? 0,
          }}
          isUser={currentSpeaker === 'user'}
          avatar={currentSpeaker === 'user' ? userAvatar : opponentAvatar}
          isTyping
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
