'use client';

import { DebateMessage } from '@/types/secondme';
import { useEffect, useRef } from 'react';
import Image from 'next/image';

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
        <div className={`w-9 h-9 rounded-[4px] flex items-center justify-center text-white font-bold text-[14px] ${
          isUser ? 'bg-[var(--zh-blue)]' : 'bg-[#FF6A00]'
        }`}>
          {avatar ? (
            <Image
              src={avatar}
              alt={message.name}
              width={36}
              height={36}
              className="w-full h-full rounded-[4px] object-cover"
              unoptimized
            />
          ) : (
            message.name.charAt(0)
          )}
        </div>
      </div>
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[75%]`}>
        <span className={`text-[13px] font-medium mb-1 ${isUser ? 'text-[var(--zh-blue)]' : 'text-[#FF6A00]'}`}>
          {message.name}
        </span>
        <div className={`px-3.5 py-2.5 rounded-[3px] ${
          isUser
            ? 'bg-[#EBF5FF] text-[var(--zh-text-main)] border border-[#D6E4FF]'
            : 'bg-[var(--zh-bg)] text-[var(--zh-text-main)] border border-[var(--zh-border)]'
        }`}>
          {isTyping ? (
            <div className="flex gap-1 py-1">
              <span className="w-1.5 h-1.5 bg-[var(--zh-text-gray)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-[var(--zh-text-gray)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-[var(--zh-text-gray)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <p className="text-[14px] leading-7 whitespace-pre-wrap">{message.content}</p>
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
    <div className="flex flex-col gap-3 p-4">
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
