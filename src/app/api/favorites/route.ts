import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { getUserIds } from '@/lib/auth-helpers';
import FavoriteModel from '@/models/Favorite';
import MessageModel from '@/models/Message';

function parseTargetIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, 200);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const targetType = request.nextUrl.searchParams.get('targetType');
    const targetIds = parseTargetIds(request.nextUrl.searchParams.get('targetIds'));

    if (targetType !== 'question' && targetType !== 'message') {
      return NextResponse.json({ error: 'Invalid target type' }, { status: 400 });
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    await connectDB();
    const userIds = await getUserIds(userId);

    const docs = await FavoriteModel.find({
      userId: { $in: userIds },
      targetType,
      targetId: { $in: targetIds },
    })
      .select('targetId -_id')
      .lean();

    const targetSet = new Set((docs as Array<{ targetId?: string }>).map((d) => d.targetId).filter(Boolean));
    const statuses = targetIds.reduce<Record<string, boolean>>((acc, id) => {
      acc[id] = targetSet.has(id);
      return acc;
    }, {});

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error('Favorites status error:', error);
    return NextResponse.json({ error: 'Failed to fetch favorite statuses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { targetId, targetType } = await request.json();

    if (!targetId || (targetType !== 'question' && targetType !== 'message')) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    await connectDB();
    const userIds = await getUserIds(userId);

    const existed = await FavoriteModel.findOne({ userId: { $in: userIds }, targetType, targetId }).lean();
    if (existed) {
      await FavoriteModel.deleteOne({ userId: { $in: userIds }, targetType, targetId });
      return NextResponse.json({ favorited: false, action: 'unfavorited' });
    }

    const questionId =
      targetType === 'question'
        ? targetId
        : (await MessageModel.findOne({ id: targetId }).select('questionId -_id').lean())?.questionId;

    if (!questionId) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }

    await FavoriteModel.create({ userId, targetType, targetId, questionId });

    return NextResponse.json({ favorited: true, action: 'favorited' });
  } catch (error) {
    console.error('Favorites toggle error:', error);
    return NextResponse.json({ error: 'Favorite failed' }, { status: 500 });
  }
}
