import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import QuestionModel from '@/models/Question';
import MessageModel from '@/models/Message';
import DebateModel from '@/models/Debate';

// POST: 批量导入数据
export async function POST(request: NextRequest) {
    try {
        const { questions, messages, debates } = await request.json();

        if (!questions && !messages && !debates) {
            return NextResponse.json(
                { error: 'No data provided' },
                { status: 400 }
            );
        }

        await connectDB();

        const results = {
            questions: { imported: 0, skipped: 0, errors: 0 },
            messages: { imported: 0, skipped: 0, errors: 0 },
            debates: { imported: 0, skipped: 0, errors: 0 },
        };

        // 导入问题
        if (questions && Array.isArray(questions)) {
            for (const question of questions) {
                try {
                    // 检查是否已存在
                    const existing = await QuestionModel.findOne({ id: question.id });
                    if (existing) {
                        results.questions.skipped++;
                        continue;
                    }

                    // 创建问题
                    await QuestionModel.create({
                        ...question,
                        createdAt: new Date(question.createdAt || Date.now()),
                    });
                    results.questions.imported++;
                } catch (error) {
                    console.error('Failed to import question:', question.id, error);
                    results.questions.errors++;
                }
            }
        }

        // 导入消息
        if (messages) {
            // messages 可能是 { questionId: [messages] } 格式
            const allMessages: any[] = [];

            if (Array.isArray(messages)) {
                allMessages.push(...messages);
            } else if (typeof messages === 'object') {
                // 从 { questionId: [messages] } 格式提取
                Object.values(messages).forEach((msgs: any) => {
                    if (Array.isArray(msgs)) {
                        allMessages.push(...msgs);
                    }
                });
            }

            for (const message of allMessages) {
                try {
                    // 检查是否已存在
                    const existing = await MessageModel.findOne({ id: message.id });
                    if (existing) {
                        results.messages.skipped++;
                        continue;
                    }

                    // 创建消息
                    await MessageModel.create({
                        ...message,
                        createdAt: new Date(message.createdAt || Date.now()),
                    });
                    results.messages.imported++;
                } catch (error) {
                    console.error('Failed to import message:', message.id, error);
                    results.messages.errors++;
                }
            }
        }

        // 导入辩论
        if (debates && Array.isArray(debates)) {
            for (const debate of debates) {
                try {
                    // 检查是否已存在
                    const existing = await DebateModel.findOne({ id: debate.id });
                    if (existing) {
                        results.debates.skipped++;
                        continue;
                    }

                    // 创建辩论
                    await DebateModel.create({
                        ...debate,
                        createdAt: new Date(debate.createdAt || Date.now()),
                        userId: debate.userId || debate.userProfile?.id || debate.userProfile?.name || 'unknown',
                    });
                    results.debates.imported++;
                } catch (error) {
                    console.error('Failed to import debate:', debate.id, error);
                    results.debates.errors++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            results,
            message: `Migration completed. Questions: ${results.questions.imported} imported, ${results.questions.skipped} skipped. Messages: ${results.messages.imported} imported, ${results.messages.skipped} skipped. Debates: ${results.debates.imported} imported, ${results.debates.skipped} skipped.`,
        });
    } catch (error) {
        console.error('Migration error:', error);
        return NextResponse.json(
            { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// GET: 导出数据（从数据库）
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const userId = searchParams.get('userId');

        await connectDB();

        // 获取问题
        const questions = await QuestionModel.find().lean();

        // 获取消息
        const messages = await MessageModel.find().lean();

        // 获取辩论（可选：仅用户自己的）
        const debateQuery = userId ? { userId } : {};
        const debates = await DebateModel.find(debateQuery).lean();

        // 转换为前端格式
        const formattedQuestions = questions.map(q => ({
            ...q,
            createdAt: new Date(q.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
        }));

        const formattedMessages = messages.map(m => ({
            ...m,
            createdAt: new Date(m.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
        }));

        const formattedDebates = debates.map(d => ({
            ...d,
            createdAt: new Date(d.createdAt).getTime(),
            _id: undefined,
            __v: undefined,
            updatedAt: undefined,
        }));

        // 按 questionId 组织消息
        const messagesByQuestion: Record<string, any[]> = {};
        formattedMessages.forEach(m => {
            if (!messagesByQuestion[m.questionId]) {
                messagesByQuestion[m.questionId] = [];
            }
            messagesByQuestion[m.questionId].push(m);
        });

        return NextResponse.json({
            questions: formattedQuestions,
            messages: messagesByQuestion,
            debates: formattedDebates,
            exportedAt: Date.now(),
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json(
            { error: 'Export failed' },
            { status: 500 }
        );
    }
}
