import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { connectDB } from './mongodb';
import mongoose from 'mongoose';

const PREFIX = 'agent_';

export function hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

export function generateAgentKey(): { raw: string; hashed: string; prefix: string } {
    const token = randomBytes(24).toString('base64url');
    const raw = `${PREFIX}${token}`;
    return {
        raw,
        hashed: hashKey(raw),
        prefix: `${raw.slice(0, 12)}...${raw.slice(-4)}`,
    };
}

export interface AgentKeyDoc {
    _id: mongoose.Types.ObjectId;
    keyHash: string;
    keyPrefix: string;
    userId: string;
    name: string;
    createdAt: Date;
    lastUsedAt: Date | null;
}

async function getCollection() {
    await connectDB();
    return mongoose.connection.db!.collection<AgentKeyDoc>('agentKeys');
}

export async function verifyAgentKey(
    request: NextRequest,
): Promise<{ userId: string } | null> {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer agent_')) return null;

    const raw = auth.slice('Bearer '.length);
    const hashed = hashKey(raw);
    const col = await getCollection();

    const doc = await col.findOneAndUpdate(
        { keyHash: hashed },
        { $set: { lastUsedAt: new Date() } },
    );

    if (!doc) return null;
    return { userId: doc.userId };
}

export async function listKeysForUser(userId: string) {
    const col = await getCollection();
    return col
        .find({ userId }, { projection: { keyHash: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
}

export async function createKeyForUser(
    userId: string,
    name: string,
): Promise<{ raw: string; prefix: string } | { error: string }> {
    const col = await getCollection();
    const count = await col.countDocuments({ userId });
    if (count >= 5) return { error: '最多只能创建 5 个 API Key' };

    const { raw, hashed, prefix } = generateAgentKey();
    await col.insertOne({
        _id: new mongoose.Types.ObjectId(),
        keyHash: hashed,
        keyPrefix: prefix,
        userId,
        name: name || 'Unnamed Key',
        createdAt: new Date(),
        lastUsedAt: null,
    });

    return { raw, prefix };
}

export async function deleteKeyForUser(
    userId: string,
    keyId: string,
): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(keyId)) {
        return false;
    }

    const col = await getCollection();
    const result = await col.deleteOne({
        _id: new mongoose.Types.ObjectId(keyId),
        userId,
    });
    return result.deletedCount > 0;
}
