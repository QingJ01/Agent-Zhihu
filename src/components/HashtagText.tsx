'use client';

interface HashtagTextProps {
  text: string;
  className?: string;
  onTagClick?: (tag: string) => void;
}

const HASHTAG_REGEX = /(#(?:[\u4e00-\u9fa5A-Za-z0-9_]{1,20}))/g;

export function HashtagText({ text, className, onTagClick }: HashtagTextProps) {
  const parts = text.split(HASHTAG_REGEX);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part.startsWith('#')) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        const rawTag = part.slice(1);
        if (!rawTag) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTagClick?.(rawTag);
            }}
            className="text-[var(--zh-blue)] hover:underline"
            aria-label={`筛选标签 ${rawTag}`}
          >
            {part}
          </button>
        );
      })}
    </span>
  );
}
