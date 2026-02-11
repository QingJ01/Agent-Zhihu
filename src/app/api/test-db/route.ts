import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';

function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}

// 测试 API：创建测试数据并验证数据库功能
export async function GET() {
    if (isProduction()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        await connectDB();

        // 创建测试问题
        const testQuestion = {
            id: `test-q-${Date.now()}`,
            title: '测试问题：AI 是否会改变世界？',
            description: '这是一个测试问题，用于验证数据库功能。',
            tags: ['测试', 'AI', '科技'],
            createdAt: new Date(),
            status: 'discussing' as const,
            discussionRounds: 0,
            upvotes: 0,
            likedBy: [],
            createdBy: 'system' as const,
        };

        // 保存到数据库
        const savedQuestion = await QuestionModel.create(testQuestion);

        // 创建测试消息
        const testMessage = {
            id: `test-msg-${Date.now()}`,
            questionId: testQuestion.id,
            author: {
                id: 'expert-1',
                name: '测试专家',
                avatar: '👨‍💻',
                bio: '这是一个测试专家',
            },
            authorType: 'ai' as const,
            createdBy: 'system' as const,
            content: '这是一条测试回答，用于验证消息功能。',
            upvotes: 0,
            likedBy: [],
            createdAt: new Date(),
        };

        const savedMessage = await MessageModel.create(testMessage);

        // 查询数据验证
        const questions = await QuestionModel.find().lean();
        const messages = await MessageModel.find({ questionId: testQuestion.id }).lean();

        return NextResponse.json({
            success: true,
            message: '数据库测试成功！',
            results: {
                savedQuestion: {
                    id: savedQuestion.id,
                    title: savedQuestion.title,
                },
                savedMessage: {
                    id: savedMessage.id,
                    content: savedMessage.content,
                },
                totalQuestions: questions.length,
                totalMessages: messages.length,
            },
            data: {
                question: {
                    ...testQuestion,
                    createdAt: testQuestion.createdAt.getTime(),
                },
                message: {
                    ...testMessage,
                    createdAt: testMessage.createdAt.getTime(),
                },
            },
        });
    } catch (error) {
        console.error('Database test error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// DELETE: 清理测试数据
export async function DELETE() {
    if (isProduction()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        await connectDB();

        // 删除所有测试数据
        const deletedQuestions = await QuestionModel.deleteMany({ id: { $regex: /^test-/ } });
        const deletedMessages = await MessageModel.deleteMany({ id: { $regex: /^test-/ } });

        return NextResponse.json({
            success: true,
            message: '测试数据已清理',
            deleted: {
                questions: deletedQuestions.deletedCount,
                messages: deletedMessages.deletedCount,
            },
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        return NextResponse.json(
            { error: 'Cleanup failed' },
            { status: 500 }
        );
    }
}
