import { resolveActiveTikTokCreatorAccountId } from '../tiktok-oauth/connections.js';

export async function resolveOperatorCreatorId(creatorId?: string): Promise<string> {
  if (creatorId?.trim()) return creatorId.trim();
  return resolveActiveTikTokCreatorAccountId();
}
