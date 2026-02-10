import { SecondMeProfile, SecondMeTokens } from '@/types/secondme';

const SECONDME_AUTH_URL = 'https://go.second.me';
const SECONDME_API_URL = 'https://app.mindos.com/gate/lab';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export function resolveAppBaseUrl(requestOrigin?: string): string {
  if (process.env.NEXTAUTH_URL) {
    return trimTrailingSlash(process.env.NEXTAUTH_URL);
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL);
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${trimTrailingSlash(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${trimTrailingSlash(process.env.VERCEL_URL)}`;
  }

  if (requestOrigin) {
    return trimTrailingSlash(requestOrigin);
  }

  return 'http://localhost:3000';
}

export function getSecondMeRedirectUri(requestOrigin?: string): string {
  return `${resolveAppBaseUrl(requestOrigin)}/api/auth/callback`;
}

export const secondMeConfig = {
  clientId: process.env.SECONDME_CLIENT_ID!,
  clientSecret: process.env.SECONDME_CLIENT_SECRET!,
  scopes: ['user.info', 'user.info.shades', 'user.info.softmemory', 'chat', 'note.add', 'voice'],
};

export function getAuthorizationUrl(state: string, requestOrigin?: string): string {
  const params = new URLSearchParams({
    client_id: secondMeConfig.clientId,
    redirect_uri: getSecondMeRedirectUri(requestOrigin),
    response_type: 'code',
    state,
  });
  return `${SECONDME_AUTH_URL}/oauth/?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, requestOrigin?: string): Promise<SecondMeTokens> {
  // 按文档要求使用 application/x-www-form-urlencoded 格式
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getSecondMeRedirectUri(requestOrigin),
    client_id: secondMeConfig.clientId,
    client_secret: secondMeConfig.clientSecret,
  });

  const response = await fetch(`${SECONDME_API_URL}/api/oauth/token/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  const result = await response.json();

  // 处理响应格式: { code: 0, data: { accessToken, refreshToken, ... } }
  if (result.code !== 0) {
    throw new Error(`OAuth error: ${result.message || 'Unknown error'}`);
  }

  const data = result.data;
  return {
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    expires_in: data.expiresIn,
    token_type: data.tokenType || 'Bearer',
    scope: Array.isArray(data.scope) ? data.scope.join(' ') : data.scope,
  };
}

export async function getUserProfile(accessToken: string): Promise<SecondMeProfile> {
  const response = await fetch(`${SECONDME_API_URL}/api/secondme/user/info`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user profile');
  }

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(`API error: ${result.message || 'Unknown error'}`);
  }

  const data = result.data;
  return {
    id: data.userId || data.id,
    name: data.name || 'Anonymous',
    email: data.email,
    avatar: data.avatar,
    bio: data.bio || data.selfIntroduction,
  };
}

export async function getUserShades(accessToken: string): Promise<SecondMeProfile['shades']> {
  try {
    const response = await fetch(`${SECONDME_API_URL}/api/secondme/user/shades`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return [];
    const result = await response.json();
    if (result.code !== 0) return [];
    return result.data?.shades || [];
  } catch {
    return [];
  }
}

export async function getUserSoftMemory(accessToken: string): Promise<SecondMeProfile['softMemory']> {
  try {
    const response = await fetch(`${SECONDME_API_URL}/api/secondme/user/softmemory`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return undefined;
    const result = await response.json();
    if (result.code !== 0) return undefined;

    // 从软记忆列表提取特征
    const list = result.data?.list || [];
    const traits: string[] = [];
    const interests: string[] = [];

    for (const item of list) {
      if (item.factObject?.includes('性格') || item.factObject?.includes('特点')) {
        traits.push(item.factContent);
      } else if (item.factObject?.includes('兴趣') || item.factObject?.includes('爱好')) {
        interests.push(item.factContent);
      }
    }

    return {
      traits: traits.length > 0 ? traits : undefined,
      interests: interests.length > 0 ? interests : undefined,
    };
  } catch {
    return undefined;
  }
}
