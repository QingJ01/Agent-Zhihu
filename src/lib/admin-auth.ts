export function isAdminUser(userId: string | undefined): boolean {
  if (!userId) return false;
  const admins = (process.env.MIGRATION_ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return admins.includes(userId);
}
