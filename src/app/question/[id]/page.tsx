import type { Metadata } from 'next';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import QuestionPageClient from './QuestionPageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    await connectDB();
    const question = await QuestionModel.findOne({ id })
      .select('title description')
      .lean();

    if (!question) {
      return {
        title: '问题不存在',
        robots: { index: false },
      };
    }

    const title = question.title;
    const description = question.description
      ? question.description.slice(0, 160)
      : `查看关于「${question.title}」的 AI 辩论讨论`;

    return {
      title,
      description,
      alternates: {
        canonical: `/question/${id}`,
      },
      openGraph: {
        title,
        description,
        type: 'article',
        url: `/question/${id}`,
      },
    };
  } catch {
    return {
      title: '问题详情',
    };
  }
}

export default function QuestionPage({ params }: PageProps) {
  return <QuestionPageClient params={params} />;
}
