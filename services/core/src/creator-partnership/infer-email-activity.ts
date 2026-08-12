import type {
  PartnershipActivityType,
  PartnershipEntityType,
  PartnershipPipelineStatus,
} from './types.js';
import { parseFollowUpFromEmail } from './parse-follow-up.js';

export type InferredEmailActivity = {
  activityType: PartnershipActivityType;
  entityType: PartnershipEntityType;
  entityName: string | null;
  suggestedStatus: PartnershipPipelineStatus | null;
  suggestedAction: string | null;
  suggestedFollowUpAt: Date | null;
};

export function inferEmailActivity(input: {
  subject: string;
  bodyText: string;
  senderDomain: string | null;
  receivedAt?: Date;
  knownBrandNames?: string[];
  knownProgramNames?: string[];
}): InferredEmailActivity {
  const blob = `${input.subject}\n${input.bodyText}`.toLowerCase();
  const followUp = parseFollowUpFromEmail(`${input.subject} ${input.bodyText}`, input.receivedAt);
  const brandName = findKnownName(blob, input.knownBrandNames);
  const programName = findKnownName(blob, input.knownProgramNames) ?? extractProgramName(blob);

  if (/shopmy/i.test(blob) && /thank you for your (?:shopmy )?application|thanks for applying to shopmy/i.test(blob)) {
    return {
      activityType: 'platform_application_received',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'Wait for ShopMy review (typically 1–3 business days).',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/shopmy/i.test(blob) && /approv(ed|al)/i.test(blob)) {
    return {
      activityType: 'platform_approved',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'Finish ShopMy setup and search for brand storefronts after approval.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/shopmy/i.test(blob) && /(reject|not approved|unable to approve|declined|not selected)/i.test(blob)) {
    return {
      activityType: 'platform_rejected',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'ShopMy application was not approved — revisit requirements or reapply later.',
      suggestedFollowUpAt: null,
    };
  }

  if (/shopmy/i.test(blob) && /(complete your (?:profile|setup)|set up your account|finish setting up)/i.test(blob)) {
    return {
      activityType: 'platform_setup_required',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'Complete ShopMy account setup before searching for brand programs.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/shopmy/i.test(blob) && /(submitted|received your application|under review)/i.test(blob)) {
    return {
      activityType: 'platform_submitted',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'Wait for ShopMy review; monitor for approval separately from brand acceptance.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/shopmy/i.test(blob) && /(1-3 business days|1–3 business days|review takes)/i.test(blob)) {
    return {
      activityType: 'platform_pending',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'ShopMy review in progress — not a brand acceptance signal.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/shopmy/i.test(blob) && input.senderDomain?.includes('shopmy')) {
    return {
      activityType: 'platform_notification',
      entityType: 'platform',
      entityName: 'ShopMy',
      suggestedStatus: null,
      suggestedAction: 'Review ShopMy platform update.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/conscious collective/i.test(blob) && /(welcome|accepted|approved|congratulations)/i.test(blob)) {
    return {
      activityType: 'program_approved',
      entityType: 'program',
      entityName: programName ?? 'Conscious Collective',
      suggestedStatus: 'accepted',
      suggestedAction: 'Review program terms and next onboarding steps.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (
    /thanks for applying|application received|we received your application/i.test(blob) &&
    !/shopmy/i.test(blob)
  ) {
    return {
      activityType: 'application_received',
      entityType: 'program',
      entityName: programName ?? brandName,
      suggestedStatus: 'applied',
      suggestedAction: 'Track response window and prepare follow-up if no reply.',
      suggestedFollowUpAt: followUp,
    };
  }

  if (/(unfortunately|not moving forward|declined|not selected|pass for now)/i.test(blob)) {
    return {
      activityType: 'program_rejected',
      entityType: programName ? 'program' : brandName ? 'brand' : 'unknown',
      entityName: programName ?? brandName,
      suggestedStatus: 'declined',
      suggestedAction: 'Confirm rejection and archive or revisit later if appropriate.',
      suggestedFollowUpAt: null,
    };
  }

  if (/(media kit|rates|rate card|pricing|partnership deck)/i.test(blob)) {
    return {
      activityType: 'brand_response',
      entityType: 'brand',
      entityName: brandName,
      suggestedStatus: null,
      suggestedAction: 'Prepare/send media kit or rates if requested.',
      suggestedFollowUpAt: followUp,
    };
  }

  return {
    activityType: 'unknown_inbound',
    entityType: 'unknown',
    entityName: null,
    suggestedStatus: null,
    suggestedAction: null,
    suggestedFollowUpAt: followUp,
  };
}

function extractProgramName(blob: string): string | null {
  if (/conscious collective/i.test(blob)) return 'Conscious Collective';
  return null;
}

function findKnownName(blob: string, names: string[] | undefined): string | null {
  if (!names?.length) return null;
  for (const name of names) {
    if (name && blob.includes(name.toLowerCase())) return name;
  }
  return null;
}

/** Platform approval must never imply brand partnership acceptance. */
export function sanitizeSuggestedStatus(input: InferredEmailActivity): PartnershipPipelineStatus | null {
  if (input.entityType === 'platform') return null;
  if (input.activityType === 'platform_approved') return null;
  return input.suggestedStatus;
}
