export type AllowlistDecision =
  | { kind: 'setup_required'; userId: string }
  | { kind: 'unauthorized' }
  | { kind: 'authorized' };

export function decideAllowlist(
  userId: string | undefined,
  allowedUserIds: string[],
): AllowlistDecision {
  if (allowedUserIds.length === 0) {
    return { kind: 'setup_required', userId: userId?.trim() || 'unknown' };
  }
  const id = userId?.trim();
  if (!id || !allowedUserIds.includes(id)) {
    return { kind: 'unauthorized' };
  }
  return { kind: 'authorized' };
}
