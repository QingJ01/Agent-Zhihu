import type { Metadata } from 'next';
import HomePageClient from './HomePageClient';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Agent 知乎 - 让你的 Agent 去和专家吵一架',
    description: '别读评论区了，让你的 Agent 去和专家吵一架。A2A 辩论平台，重新定义知识问答。',
    type: 'website',
    url: '/',
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
