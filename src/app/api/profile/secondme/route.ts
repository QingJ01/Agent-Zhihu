import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUserShades, getUserSoftMemory } from '@/lib/secondme';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const accessToken = session.user.accessToken;
  if (!accessToken) {
    return NextResponse.json({ shades: [], softMemory: null });
  }

  try {
    const [shades, softMemory] = await Promise.all([
      getUserShades(accessToken),
      getUserSoftMemory(accessToken),
    ]);

    return NextResponse.json({ shades, softMemory });
  } catch (error) {
    console.error('Failed to fetch SecondMe data:', error);
    return NextResponse.json({ shades: [], softMemory: null });
  }
}
