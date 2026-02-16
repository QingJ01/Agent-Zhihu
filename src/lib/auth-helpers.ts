import { createHash } from 'crypto';
import { connectDB } from '@/lib/mongodb';
import User, { IUser } from '@/models/User';

type ProviderType = 'github' | 'google' | 'secondme';

interface UserProfile {
  name: string;
  email?: string;
  image?: string;
  bio?: string;
}

/**
 * Find an existing user by provider + account ID, or create a new one.
 * Returns the User document.
 */
export async function findOrCreateUser(
  provider: ProviderType,
  providerAccountId: string,
  profile: UserProfile,
  tokens?: { accessToken?: string; refreshToken?: string },
): Promise<IUser> {
  await connectDB();

  // Look up by linked account
  let user = await User.findOne({
    'linkedAccounts.provider': provider,
    'linkedAccounts.providerAccountId': providerAccountId,
  });

  if (user) {
    const updateFields: Record<string, unknown> = {};

    // Only fill in missing profile fields, never overwrite existing ones
    if (!user.name && profile.name) updateFields.name = profile.name;
    if (!user.image && profile.image) updateFields.image = profile.image;
    if (!user.email && profile.email) updateFields.email = profile.email;

    // Update tokens
    if (tokens?.accessToken) {
      updateFields['linkedAccounts.$.accessToken'] = tokens.accessToken;
      if (tokens.refreshToken) {
        updateFields['linkedAccounts.$.refreshToken'] = tokens.refreshToken;
      }
    }

    if (Object.keys(updateFields).length > 0) {
      await User.updateOne(
        {
          id: user.id,
          'linkedAccounts.provider': provider,
          'linkedAccounts.providerAccountId': providerAccountId,
        },
        { $set: updateFields },
      );
      if (updateFields.name) user.name = updateFields.name as string;
      if (updateFields.image) user.image = updateFields.image as string;
    }

    return user;
  }

  // Create new user
  user = await User.create({
    name: profile.name || 'Anonymous',
    email: profile.email,
    image: profile.image,
    bio: profile.bio,
    linkedAccounts: [{
      provider,
      providerAccountId,
      accessToken: tokens?.accessToken,
      refreshToken: tokens?.refreshToken,
      profileData: {
        name: profile.name,
        email: profile.email,
        image: profile.image,
      },
      linkedAt: new Date(),
    }],
    // Store legacy ID mapping for SecondMe migration
    ...(provider === 'secondme' && {
      legacyIds: new Map([['secondme', providerAccountId]]),
    }),
  });

  return user;
}

/**
 * Link an additional provider account to an existing user.
 * Returns true if linked, false if already linked to another user.
 */
export async function linkAccountToUser(
  userId: string,
  provider: ProviderType,
  providerAccountId: string,
  profile: UserProfile,
  tokens?: { accessToken?: string; refreshToken?: string },
): Promise<{ success: boolean; error?: string }> {
  await connectDB();

  // Check if already linked to another user
  const existingLink = await User.findOne({
    'linkedAccounts.provider': provider,
    'linkedAccounts.providerAccountId': providerAccountId,
  });

  if (existingLink && existingLink.id !== userId) {
    return { success: false, error: '该账号已绑定到其他用户' };
  }

  if (existingLink && existingLink.id === userId) {
    return { success: true }; // Already linked to this user
  }

  await User.updateOne(
    { id: userId },
    {
      $push: {
        linkedAccounts: {
          provider,
          providerAccountId,
          accessToken: tokens?.accessToken,
          refreshToken: tokens?.refreshToken,
          profileData: {
            name: profile.name,
            email: profile.email,
            image: profile.image,
          },
          linkedAt: new Date(),
        },
      },
    },
  );

  return { success: true };
}

/**
 * Get all user IDs for a session user (internal ID + legacy IDs).
 * Used during migration period for backward-compatible queries.
 */
export async function getUserIds(userId: string): Promise<string[]> {
  await connectDB();
  const user = await User.findOne({ id: userId }).lean();
  if (!user) return [userId];

  const ids = [user.id];
  if (user.legacyIds) {
    // .lean() converts Map to plain object
    const legacyValues = user.legacyIds instanceof Map
      ? Array.from(user.legacyIds.values())
      : Object.values(user.legacyIds);
    for (const legacyId of legacyValues) {
      if (typeof legacyId === 'string' && legacyId !== user.id) {
        ids.push(legacyId);
      }
    }
  }
  return ids;
}

/**
 * Validate an API token (Bearer token).
 * Returns the user if the token is valid, null otherwise.
 */
export async function validateApiToken(token: string): Promise<IUser | null> {
  if (!token || !token.startsWith('azh_')) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  await connectDB();

  const user = await User.findOneAndUpdate(
    {
      'apiTokens.tokenHash': tokenHash,
      'apiTokens.revoked': false,
    },
    {
      $set: { 'apiTokens.$.lastUsedAt': new Date() },
    },
    { new: true },
  );

  return user;
}

/**
 * Display name for auth providers (Chinese).
 */
export function providerDisplayName(provider: string): string {
  const names: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
    secondme: 'SecondMe',
  };
  return names[provider] || provider;
}
