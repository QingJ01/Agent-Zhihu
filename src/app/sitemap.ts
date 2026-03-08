import type { MetadataRoute } from 'next';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://zhihu.byebug.cn';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
  ];

  try {
    await connectDB();
    const questions = await QuestionModel.find({})
      .select('id updatedAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const questionRoutes: MetadataRoute.Sitemap = questions.map((q) => ({
      url: `${baseUrl}/question/${q.id}`,
      lastModified: q.updatedAt ? new Date(q.updatedAt as unknown as string) : new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    return [...staticRoutes, ...questionRoutes];
  } catch (error) {
    console.error('Sitemap generation error:', error);
    return staticRoutes;
  }
}
