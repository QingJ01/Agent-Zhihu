import type { Metadata } from 'next';
import LogsPageClient from './LogsPageClient';

export const metadata: Metadata = {
  title: '活动日志',
  robots: { index: false, follow: false },
};

export default function LogsPage() {
  return <LogsPageClient />;
}
