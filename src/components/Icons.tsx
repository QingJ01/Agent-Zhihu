import React from 'react';

export const IconWrapper = ({ children, className = "", size = 20, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...props}
    >
        {children}
    </svg>
);

export const Icons = {
    // Navigation & Header
    Search: (props: any) => (
        <IconWrapper {...props}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </IconWrapper>
    ),
    Bell: (props: any) => (
        <IconWrapper {...props}>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </IconWrapper>
    ),
    Message: (props: any) => (
        <IconWrapper {...props}>
            <path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </IconWrapper>
    ),
    User: (props: any) => (
        <IconWrapper {...props}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </IconWrapper>
    ),
    CaretDown: (props: any) => (
        <IconWrapper {...props}>
            <path d="m6 9 6 6 6-6" />
        </IconWrapper>
    ),

    // Actions (Vote, Comment, Share, etc.)
    Upvote: ({ filled, ...props }: any) => (
        <IconWrapper {...props}>
            <path d="m18 15-6-6-6 6" fill={filled ? "currentColor" : "none"} />
        </IconWrapper>
    ),
    Downvote: ({ filled, ...props }: any) => (
        <IconWrapper {...props}>
            <path d="m6 9 6 6 6-6" fill={filled ? "currentColor" : "none"} />
        </IconWrapper>
    ),
    Comment: (props: any) => (
        <IconWrapper {...props}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </IconWrapper>
    ),
    Share: (props: any) => (
        <IconWrapper {...props}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
        </IconWrapper>
    ),
    Favorite: ({ filled, ...props }: any) => (
        <IconWrapper {...props}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={filled ? "currentColor" : "none"} />
        </IconWrapper>
    ),
    More: (props: any) => (
        <IconWrapper {...props}>
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
        </IconWrapper>
    ),

    // Input Module Toolbar
    Hash: (props: any) => (
        <IconWrapper {...props}>
            <line x1="4" y1="9" x2="20" y2="9" />
            <line x1="4" y1="15" x2="20" y2="15" />
            <line x1="10" y1="3" x2="8" y2="21" />
            <line x1="16" y1="3" x2="14" y2="21" />
        </IconWrapper>
    ),
    Smile: (props: any) => (
        <IconWrapper {...props}>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
        </IconWrapper>
    ),
    Image: (props: any) => (
        <IconWrapper {...props}>
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </IconWrapper>
    ),
    Video: (props: any) => (
        <IconWrapper {...props}>
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
        </IconWrapper>
    ),
    Chart: (props: any) => (
        <IconWrapper {...props}>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </IconWrapper>
    ),

    // Feature Types (Bottom Tabs)
    Question: (props: any) => (
        <IconWrapper {...props}>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </IconWrapper>
    ),
    Answer: (props: any) => (
        <IconWrapper {...props}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </IconWrapper>
    ),
    Article: (props: any) => (
        <IconWrapper {...props}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </IconWrapper>
    ),
    VideoPlay: (props: any) => (
        <IconWrapper {...props}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="10 8 16 12 10 16 10 8" />
        </IconWrapper>
    ),
};
