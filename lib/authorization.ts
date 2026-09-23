export function canManageResource(authenticatedUserId: string | null, resourceOwnerId: string): boolean {
  return Boolean(authenticatedUserId && authenticatedUserId === resourceOwnerId);
}
