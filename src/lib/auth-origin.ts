import { NextRequest } from 'next/server';

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function resolveAuthOrigin(request: NextRequest): string {
  const envOrigin = normalizeOrigin(process.env.NEXTAUTH_URL);
  if (envOrigin) return envOrigin;

  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const forwardedOrigin = normalizeOrigin(
    forwardedHost ? `${forwardedProto}://${forwardedHost}` : null
  );
  if (forwardedOrigin) return forwardedOrigin;

  return request.nextUrl.origin;
}
