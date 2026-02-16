export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface OAuthProfileResult {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function buildGitHubAuthUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('GITHUB_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(code: string, redirectUri: string): Promise<OAuthTokenResult> {
  const clientId = requireEnv('GITHUB_ID');
  const clientSecret = requireEnv('GITHUB_SECRET');

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error('GitHub token exchange failed');
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) {
    throw new Error('GitHub token missing');
  }

  return { accessToken: data.access_token };
}

export async function getGitHubProfile(accessToken: string): Promise<OAuthProfileResult> {
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!userResponse.ok) {
    throw new Error('GitHub profile fetch failed');
  }

  const userData = await userResponse.json() as { id: number; login?: string; name?: string; avatar_url?: string; email?: string | null };

  let email = userData.email || undefined;
  if (!email) {
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (emailsResponse.ok) {
      const emails = await emailsResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      const primary = emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified);
      email = primary?.email;
    }
  }

  return {
    id: String(userData.id),
    name: userData.name || userData.login || 'GitHub User',
    email,
    avatar: userData.avatar_url,
  };
}

export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<OAuthTokenResult> {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error('Google token exchange failed');
  }

  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error('Google token missing');
  }

  const expiresAt = typeof data.expires_in === 'number'
    ? Date.now() + data.expires_in * 1000
    : undefined;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

export async function getGoogleProfile(accessToken: string): Promise<OAuthProfileResult> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Google profile fetch failed');
  }

  const data = await response.json() as {
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
  };

  return {
    id: data.sub,
    name: data.name || 'Google User',
    email: data.email,
    avatar: data.picture,
  };
}
