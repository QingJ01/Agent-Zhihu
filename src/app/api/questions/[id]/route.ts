import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { getUserIds } from '@/lib/auth-helpers';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';
import FavoriteModel from '@/models/Favorite';

// GET: 获取单个问题及其所有消息
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const session = await getServerSession(authOptions);
        const userId = session?.user?.id;

        await connectDB();

        // 获取问题
        const question = await QuestionModel.findOne({ id }).lean();
        if (!question) {
            return NextResponse.json({ error: 'Question not found' }, { status: 404 });
        }

        // 获取该问题的所有消息
        const messages = await MessageModel.find({ questionId: id })
            .sort({ createdAt: 1 })
            .lean();

        const messageIds = (messages as Array<{ id: string }>).map((m) => m.id).filter(Boolean);

        const favoriteSet = new Set<string>();
        let questionFavorited = false;
        const userIds = userId ? await getUserIds(userId) : [];
        if (userIds.length > 0) {
            const favoriteDocs = await FavoriteModel.find({
                userId: { $in: userIds },
                $or: [
                    { targetType: 'question', targetId: id },
                    ...(messageIds.length > 0
                        ? [{ targetType: 'message', targetId: { $in: messageIds } }]
                        : []),
                ],
            })
                .select('targetType targetId -_id')
                .lean();

            for (const doc of favoriteDocs as Array<{ targetType?: string; targetId?: string }>) {
                if (!doc.targetId) continue;
                if (doc.targetType === 'question' && doc.targetId === id) {
                    questionFavorited = true;
                }
                if (doc.targetType === 'message') {
                    favoriteSet.add(doc.targetId);
                }
            }
        }

        // 转换为前端格式
        const formattedQuestion = {
            ...question,
            createdAt: new Date(question.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
            messageCount: messages.length,
            isFavorited: questionFavorited,
        };

        const formattedMessages = messages.map(m => ({
            ...m,
            createdAt: new Date(m.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
            isFavorited: favoriteSet.has(m.id),
        }));

        return NextResponse.json({
            question: formattedQuestion,
            messages: formattedMessages,
        });
    } catch (error) {
        console.error('Question detail error:', error);
        return NextResponse.json({ error: 'Failed to fetch question' }, { status: 500 });
    }
}
