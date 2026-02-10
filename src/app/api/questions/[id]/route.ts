import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

// GET: 获取单个问题及其所有消息
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;

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

        // 转换为前端格式
        const formattedQuestion = {
            ...question,
            createdAt: new Date(question.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
        };

        const formattedMessages = messages.map(m => ({
            ...m,
            createdAt: new Date(m.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
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
