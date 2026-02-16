import { randomUUID } from 'crypto';

export function generateId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
