/**
 * Creator asset roles and public-use states.
 *
 * Photos never reach a public media kit silently: they start as draft / pending and
 * only become assignable after Kellie explicitly approves public use.
 */

export const CREATOR_ASSET_ROLES = [
  'hero',
  'headshot',
  'proof_still',
  'lifestyle',
  'property',
  'food',
  'event',
  'other',
] as const;
export type CreatorAssetRole = (typeof CREATOR_ASSET_ROLES)[number];

export const CREATOR_ASSET_PUBLIC_USE_STATES = [
  'draft',
  'pending_public_use',
  'approved_public_use',
  'rejected_public_use',
  'archived',
] as const;
export type CreatorAssetPublicUseState = (typeof CREATOR_ASSET_PUBLIC_USE_STATES)[number];

export function isCreatorAssetRole(value: string): value is CreatorAssetRole {
  return (CREATOR_ASSET_ROLES as readonly string[]).includes(value);
}

export function isCreatorAssetPublicUseState(
  value: string,
): value is CreatorAssetPublicUseState {
  return (CREATOR_ASSET_PUBLIC_USE_STATES as readonly string[]).includes(value);
}

/** Only approved assets may appear on public kit pages or in generated PDFs. */
export function canAppearOnPublicKit(state: CreatorAssetPublicUseState): boolean {
  return state === 'approved_public_use';
}

/**
 * Private dashboard file route (`/api/creator-assets/files/*`) may serve bytes only
 * while the asset is still in an active library state. Archived/rejected fixtures
 * stay on disk (history) but must 404 — UUID filenames alone are not access control.
 */
export function mayServeCreatorAssetPrivateFile(
  state: CreatorAssetPublicUseState,
): boolean {
  return state !== 'archived' && state !== 'rejected_public_use';
}

/** Assets Kellie still needs to decide on. */
export function needsPublicUseDecision(state: CreatorAssetPublicUseState): boolean {
  return state === 'draft' || state === 'pending_public_use';
}
