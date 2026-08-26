import type { ResolvedUrlEntity } from './qualify-url-opportunity.js';
import type { UrlIntakeDiagnostics } from './url-intake-pipeline.js';
import type { UrlIntakeOutcome } from './url-entity-opportunity.js';
import { isDirectoryListingIntake } from './intake-intents.js';
import { formatOpportunityTypeLabel } from './url-entity-opportunity.js';
import {
  editorialRoundupPlace,
  editorialRoundupSeason,
  extractRoundupYear,
} from './editorial-roundup.js';
import type { StandaloneUrlType } from './url-type.js';

export type UrlIntakeOpportunityAction = {
  label: string;
  href: string;
};

export type UrlIntakeSummary = {
  entity: ResolvedUrlEntity | null;
  locationScope: string | null;
  watchRuleSaved: boolean;
  qualifiedCount: number;
  quarantinedCount: number;
  quarantineReasons: string[];
  needsLocationConfirmation: boolean;
  identifiedLocations: string[];
  savedTitles: string[];
  diagnostics?: UrlIntakeDiagnostics[];
  qualificationOutcome?: UrlIntakeOutcome;
  entityOpportunityId?: string | null;
  entityOpportunityTitle?: string | null;
  entityOpportunityType?: string | null;
  entityCreated?: boolean;
  entityUpdated?: boolean;
  opportunityActions?: UrlIntakeOpportunityAction[];
  calendarItemsCreated?: number;
  instagramRoundup?: boolean;
  instagramHandle?: string | null;
  directoryListing?: boolean;
  eventListing?: boolean;
  officialEventOccurrence?: boolean;
  operatorCorrectionApplied?: boolean;
  listingLabel?: string | null;
  listingCreated?: number;
  listingUpdated?: number;
  extractedTitles?: string[];
  userConfirmedSave?: boolean;
  enrichmentFailures?: number;
  primaryOpportunityId?: string | null;
  editorialRoundup?: boolean;
  staleEditorialRoundup?: boolean;
  staleEditorialYear?: number | null;
  retainedQuietlyCount?: number;
  extractedCount?: number;
  hubOwner?: string | null;
  hubDestinations?: Array<{ url: string; type: StandaloneUrlType }>;
};

export function buildEvidenceFirstImageAnswer(input: {
  documentTitle?: string | null;
  extractedCount: number;
  created: number;
  updated: number;
  savedTitles: string[];
  intakeError?: string | null;
  userMessage?: string;
}): { answer: string; evidence: string[]; suggestedActions: string[] } {
  const directoryMode = isDirectoryListingIntake(input.userMessage);
  const docTitle = input.documentTitle?.trim();
  const saved = input.savedTitles.slice(0, 6);
  const lines: string[] = [];

  if (input.intakeError) {
    lines.push(`I couldn't read that upload — ${input.intakeError}`);
  } else if (input.created + input.updated > 0) {
    const count = input.created + input.updated;
    if (directoryMode || /directory|black.?owned|business list/i.test(docTitle ?? '')) {
      lines.push(
        docTitle
          ? `I read **${docTitle}** and added **${count}** business${count === 1 ? '' : 'es'} to your inventory.`
          : `I read your directory upload and added **${count}** business${count === 1 ? '' : 'es'} to inventory.`,
      );
    } else {
      lines.push(
        docTitle
          ? `I read **${docTitle}** and saved **${count}** item${count === 1 ? '' : 's'} to inventory.`
          : `I saved **${count}** item${count === 1 ? '' : 's'} from your upload to inventory.`,
      );
    }
    if (saved.length > 0) {
      lines.push(`Including: ${saved.join('; ')}${input.savedTitles.length > 6 ? '…' : ''}.`);
    }
    lines.push('Review them in inventory — mark Interested, plan a visit, or dismiss what is not a fit.');
  } else if (input.extractedCount > 0) {
    lines.push(
      `I could read **${input.extractedCount}** listing${input.extractedCount === 1 ? '' : 's'} but none were new — they may already be in inventory.`,
    );
  } else {
    lines.push(
      directoryMode
        ? 'I could not pull readable business names from that directory — try a sharper screenshot or scroll capture.'
        : 'I could not extract readable listings from that image — try a sharper photo or clearer screenshot.',
    );
  }

  return {
    answer: lines.join(' '),
    evidence: [
      docTitle ? `Document: ${docTitle}` : 'Image upload via Ask Benson',
      `Extracted: ${input.extractedCount}, Saved: ${input.created + input.updated}`,
      ...(input.intakeError ? [input.intakeError] : []),
    ].slice(0, 4),
    suggestedActions: [
      input.created + input.updated > 0 ? 'Open inventory → /review/inventory' : 'Retry with a clearer screenshot',
      'Add a short note about what you want to do with these places',
    ].slice(0, 4),
  };
}

export function buildEvidenceFirstUrlAnswer(input: {
  summary: UrlIntakeSummary;
  pageUrl: string;
  userMessage?: string;
}): { answer: string; evidence: string[]; suggestedActions: string[]; opportunityActions?: UrlIntakeOpportunityAction[] } {
  const staleEditorial =
    input.summary.staleEditorialRoundup ||
    input.summary.qualificationOutcome === 'EDITORIAL_ROUNDUP_STALE';
  if (staleEditorial) {
    const year =
      input.summary.staleEditorialYear ??
      extractRoundupYear(input.pageUrl, input.summary.listingLabel) ??
      extractRoundupYear(input.pageUrl);
    const place = editorialRoundupPlace(input.pageUrl, input.summary.listingLabel);
    const season = editorialRoundupSeason(input.pageUrl, input.summary.listingLabel);
    const labelParts = [year ? String(year) : null, place, season].filter(Boolean);
    const label = labelParts.length > 0 ? `${labelParts.join(' ')} ` : '';
    const extracted =
      input.summary.extractedCount ??
      input.summary.qualifiedCount +
        input.summary.quarantinedCount +
        (input.summary.retainedQuietlyCount ?? 0);
    const expired = input.summary.quarantinedCount;
    const retained = input.summary.retainedQuietlyCount ?? 0;
    const lines = [
      `This is a ${label}roundup, so the dated recommendations are stale for current planning. I'm not promoting them into active opportunities.`,
    ];
    if (extracted > 0 || expired > 0 || retained > 0) {
      lines.push(`Extracted: **${extracted}**. Expired/stale: **${expired}**. Retained quietly: **${retained}**.`);
    }
    return {
      answer: lines.join(' '),
      evidence: [
        `URL: ${input.pageUrl}`,
        `Outcome: ${input.summary.qualificationOutcome ?? 'EDITORIAL_ROUNDUP_STALE'}`,
        `Extracted ${extracted}, stale ${expired}, retained quietly ${retained}`,
      ].slice(0, 4),
      suggestedActions: [],
      opportunityActions: [],
    };
  }

  if (input.summary.qualificationOutcome === 'SOCIAL_PROFILE_SOURCE') {
    const handle = (input.summary.instagramHandle ?? '').replace(/^@/, '');
    const label = handle ? `@${handle}` : 'this Instagram profile';
    return {
      answer: `I found the **${label}** Instagram profile. I can keep it as a source or inspect supported profile information.`,
      evidence: [
        `URL: ${input.pageUrl}`,
        `Outcome: SOCIAL_PROFILE_SOURCE`,
        handle ? `Handle: @${handle}` : 'Instagram profile',
      ].slice(0, 4),
      suggestedActions: [
        'Keep as source → /watchlist/add',
        'Open Watchlist → /watchlist',
        'Share a post or reel from this profile if you want intake from a specific piece of content',
      ],
      opportunityActions: [],
    };
  }

  if (input.summary.qualificationOutcome === 'LINK_HUB_INTAKE') {
    const owner = input.summary.hubOwner?.trim() || 'this page';
    const dests = input.summary.hubDestinations ?? [];
    const hasIg = dests.some(
      (d) =>
        d.type === 'social_profile' ||
        d.type === 'social_post' ||
        /instagram\.com/i.test(d.url),
    );
    const hasEvent = dests.some((d) =>
      /eventbrite|ticketmaster|seatgeek|\/events?(?:\/|$)|ticket/i.test(d.url),
    );
    const destBits: string[] = [];
    if (hasIg) destBits.push('Instagram');
    if (hasEvent) destBits.push('event/social destinations');
    if (destBits.length === 0 && dests.length > 0) destBits.push('outbound social and web destinations');
    const destPhrase =
      destBits.length > 0 ? ` with links to ${destBits.join(' and ')}` : '';
    return {
      answer: `I found a Linktree for **${owner}**${destPhrase}. I'm treating it as a link hub and inspecting outbound destinations rather than classifying the hub page itself as a restaurant or store.`,
      evidence: [
        `URL: ${input.pageUrl}`,
        `Outcome: LINK_HUB_INTAKE`,
        dests.length > 0
          ? `Outbound destinations: ${dests.length}`
          : 'No outbound destinations extracted yet',
      ].slice(0, 4),
      suggestedActions: [
        'Keep as source → /watchlist/add',
        dests[0] ? `Open a destination → ${dests[0].url}` : 'Paste a destination URL from the hub',
        'Share a specific event or profile link from the hub',
      ].slice(0, 4),
      opportunityActions: [],
    };
  }

  if (input.summary.qualificationOutcome === 'SOCIAL_POST_INTAKE') {
    const handle = (input.summary.instagramHandle ?? '').replace(/^@/, '');
    const lines = [
      "I recognized this as an Instagram post. I'm reading the post rather than treating its ID as a business name.",
    ];
    if (handle) {
      lines.push(`Creator account: **@${handle}**.`);
    }
    if (input.summary.qualifiedCount > 0 && input.summary.savedTitles.length > 0) {
      lines.push(
        `Saved **${input.summary.qualifiedCount}** supported item(s): ${input.summary.savedTitles.slice(0, 4).join('; ')}.`,
      );
    } else if ((input.summary.extractedTitles?.length ?? 0) > 0) {
      lines.push(
        `I could read the post but did not save a business or partnership from the post ID.`,
      );
    }
    return {
      answer: lines.join(' '),
      evidence: [
        `URL: ${input.pageUrl}`,
        `Outcome: SOCIAL_POST_INTAKE`,
        handle ? `Handle: @${handle}` : 'Instagram post (opaque shortcode is not a brand)',
      ].slice(0, 4),
      suggestedActions: [
        input.summary.qualifiedCount > 0
          ? 'View discoveries → /discoveries'
          : 'Keep as source → /watchlist/add',
        'Share a screenshot if the post did not load',
        'Retry this post',
      ],
      opportunityActions: input.summary.opportunityActions ?? [],
    };
  }

  if (input.summary.instagramRoundup) {
    const handle = input.summary.instagramHandle?.replace(/^@/, '') ?? 'creator';
    const titles = input.summary.extractedTitles ?? [];
    const lines: string[] = [
      `I read **@${handle}**'s Instagram roundup and found **${titles.length || input.summary.quarantinedCount + input.summary.qualifiedCount}** event(s).`,
    ];

    if (titles.length > 0) {
      lines.push(`From the carousel: ${titles.slice(0, 6).join('; ')}${titles.length > 6 ? '…' : ''}.`);
    }

    if (input.summary.qualifiedCount > 0) {
      lines.push(
        `Saved **${input.summary.qualifiedCount}** upcoming event(s) to your inventory: ${input.summary.savedTitles.slice(0, 4).join('; ')}.`,
      );
    } else if (input.summary.quarantinedCount > 0) {
      const reason = input.summary.quarantineReasons[0] ?? 'they did not pass qualification';
      lines.push(`None were added to inventory — ${reason}.`);
      if (/past/i.test(reason)) {
        lines.push('Share a newer post if you want upcoming dates from this creator.');
      }
    } else {
      lines.push('I could not extract dated events from the slides — try a clearer carousel or share a screenshot.');
    }

    const suggestedActions = [
      ...(input.summary.qualifiedCount > 0 && input.summary.entityOpportunityId
        ? [`Open saved events → /review/inventory?id=${input.summary.entityOpportunityId}`]
        : []),
      'Share another IG post with upcoming dates',
      `Follow @${handle} on Watchlist for automatic roundup intake`,
    ];

    return {
      answer: lines.join(' '),
      evidence: [
        `Instagram roundup by @${handle}`,
        `Extracted: ${titles.length}, Saved: ${input.summary.qualifiedCount}, Quarantined: ${input.summary.quarantinedCount}`,
        ...(input.summary.diagnostics?.[0]?.summary ? [input.summary.diagnostics[0].summary] : []),
      ].slice(0, 4),
      suggestedActions: suggestedActions.slice(0, 4),
      opportunityActions: input.summary.opportunityActions,
    };
  }

  if (input.summary.directoryListing) {
    const docTitle = input.summary.entityOpportunityTitle ?? input.summary.savedTitles[0] ?? 'directory page';
    const saved = input.summary.savedTitles.filter(Boolean);
    const lines: string[] = [
      `I read this **business directory** and saved **${input.summary.qualifiedCount}** listing${input.summary.qualifiedCount === 1 ? '' : 's'} to inventory.`,
    ];
    if (saved.length > 0) {
      lines.push(`Including: ${saved.slice(0, 6).join('; ')}${saved.length > 6 ? '…' : ''}.`);
    }
    if (input.summary.quarantinedCount > 0) {
      lines.push(
        `${input.summary.quarantinedCount} line(s) were skipped — usually missing location or too vague to save.`,
      );
    }
    lines.push('These are place discoveries, not calendar events — review and mark what you want to feature.');

    return {
      answer: lines.join(' '),
      evidence: [
        `Directory: ${docTitle}`,
        `Saved: ${input.summary.qualifiedCount}, Skipped: ${input.summary.quarantinedCount}`,
        ...(input.summary.diagnostics?.[0]?.summary ? [input.summary.diagnostics[0].summary] : []),
      ].slice(0, 4),
      suggestedActions: [
        'Open inventory → /review/inventory',
        'Mark favorites Interested for a roundup or visit plan',
      ].slice(0, 4),
      opportunityActions: input.summary.opportunityActions,
    };
  }

  const entity = input.summary.entity;
  const lines: string[] = [];

  if (input.summary.userConfirmedSave && input.summary.savedTitles.length > 0) {
    const title = input.summary.savedTitles[0] ?? 'this event';
    lines.push(`Added **${title}** to Opportunities.`);
    if ((input.summary.enrichmentFailures ?? 0) > 0) {
      lines.push(
        `I couldn't verify a few enrichment fields yet, so I saved the confirmed event details and left those fields pending.`,
      );
    } else if (input.summary.entityUpdated) {
      lines.push('Updated your existing opportunity record with the latest details you shared.');
    }
    if (input.summary.savedTitles.length > 1) {
      lines.push(
        `Also saved: ${input.summary.savedTitles.slice(1, 4).join('; ')}${input.summary.savedTitles.length > 4 ? '…' : ''}.`,
      );
    }
    if (input.summary.primaryOpportunityId) {
      lines.push('Review it in Opportunities whenever you are ready.');
    }

    const suggestedActions = [
      input.summary.primaryOpportunityId
        ? `Open opportunity → /review/inventory?id=${input.summary.primaryOpportunityId}`
        : 'Open Opportunities → /opportunities',
      'Plan visit or mark Interested from the opportunity detail',
    ];

    return {
      answer: lines.join(' '),
      evidence: [
        entity ? `Entity: ${entity.businessName} @ ${entity.officialDomain}` : `URL: ${input.pageUrl}`,
        `User-confirmed save: ${input.summary.savedTitles.length} item(s)`,
        `Enrichment follow-up failures: ${input.summary.enrichmentFailures ?? 0}`,
      ].slice(0, 4),
      suggestedActions: suggestedActions.slice(0, 4),
      opportunityActions: input.summary.opportunityActions,
    };
  }

  if (
    input.summary.officialEventOccurrence &&
    (input.summary.qualifiedCount ?? 0) > 0
  ) {
    const title = input.summary.savedTitles[0] ?? entity?.businessName ?? 'this event';
    const lines: string[] = [];
    if (input.summary.operatorCorrectionApplied) {
      lines.push(
        `I corrected **${title}** to an event using the official source — not a restaurant or generic food discovery.`,
      );
    } else {
      lines.push(`I added **${title}** as a dated event from the official page.`);
    }
    lines.push(
      'Food or shopping language on the page is a theme, not the entity type.',
    );
    if ((input.summary.calendarItemsCreated ?? 0) > 0) {
      lines.push(
        'It is eligible as a Benson Calendar suggestion. I did not auto-select it or add it to the Weekend List.',
      );
    }
    if (input.summary.savedTitles.length > 1) {
      lines.push(`Also saved: ${input.summary.savedTitles.slice(1, 4).join('; ')}.`);
    }
    return {
      answer: lines.join(' '),
      evidence: [
        `Event: ${title}`,
        `URL: ${input.pageUrl}`,
        `Outcome: ${input.summary.qualificationOutcome ?? 'LISTING_EVENTS_ACCEPTED'}`,
        input.summary.operatorCorrectionApplied
          ? 'Operator correction applied to the same logical entity'
          : 'Official event-occurrence signals outranked topical food classification',
      ].slice(0, 4),
      suggestedActions: [
        'View discoveries → /discoveries',
        'Add to Things To Do → /calendar',
        'Keep as source',
      ],
      opportunityActions: [],
    };
  }

  const eventListing =
    input.summary.qualificationOutcome === 'LISTING_EVENTS_ACCEPTED' ||
    (Boolean(input.summary.eventListing) && (input.summary.qualifiedCount ?? 0) > 0);

  if (eventListing) {
    const listingName = input.summary.listingLabel?.trim() || entity?.officialDomain || 'this listing';
    const found = Math.max(
      input.summary.qualifiedCount + input.summary.quarantinedCount,
      (input.summary.extractedTitles ?? []).length,
      input.summary.qualifiedCount,
    );
    const saved = input.summary.qualifiedCount;
    const created = input.summary.listingCreated ?? 0;
    const reused = input.summary.listingUpdated ?? Math.max(0, saved - created);
    const quarantined = input.summary.quarantinedCount;
    const lines: string[] = [
      `I found **${found}** upcoming event${found === 1 ? '' : 's'} on **${listingName}**'s events page.`,
    ];
    if (quarantined > 0) {
      lines.push(
        `I saved **${saved}** supported event${saved === 1 ? '' : 's'} and quarantined **${quarantined}** that didn't have enough information.`,
      );
    } else {
      lines.push(`I saved **${saved}** supported event${saved === 1 ? '' : 's'}.`);
    }
    lines.push(`New: **${created}**. Reused: **${reused}**. Quarantined: **${quarantined}**.`);
    if (input.summary.savedTitles.length > 0) {
      lines.push(
        `Including: ${input.summary.savedTitles.slice(0, 6).join('; ')}${input.summary.savedTitles.length > 6 ? '…' : ''}.`,
      );
    }

    return {
      answer: lines.join(' '),
      evidence: [
        `Listing: ${listingName}`,
        `URL: ${input.pageUrl}`,
        `Outcome: ${input.summary.qualificationOutcome ?? 'LISTING_EVENTS_ACCEPTED'}`,
        `New ${created}, reused ${reused}, quarantined ${quarantined}`,
      ].slice(0, 4),
      suggestedActions: [
        'View discoveries → /discoveries',
        'Add to Things To Do → /calendar',
        'Keep as source',
      ],
      opportunityActions: [],
    };
  }

  const noSupportedEntity =
    input.summary.qualificationOutcome === 'NO_SUPPORTED_ENTITY' ||
    input.summary.qualificationOutcome === 'ENTITY_REJECTED';
  const hasEntity =
    Boolean(input.summary.entityOpportunityId) &&
    !noSupportedEntity &&
    input.summary.qualificationOutcome !== 'ENTITY_PENDING_LOCATION';

  const primaryDiag = input.summary.diagnostics?.[0];
  const zeroUsableContent =
    Boolean(primaryDiag?.fetchOk) && (primaryDiag?.textLength ?? 0) === 0;

  if (hasEntity) {
    const typeLabel = formatOpportunityTypeLabel(input.summary.entityOpportunityType ?? 'place_discovery');
    const title = input.summary.entityOpportunityTitle ?? entity?.businessName ?? 'this business';
    lines.push(
      `I added **${title}** as a **${typeLabel.toLowerCase()}** opportunity.`,
    );
    if (input.summary.locationScope) {
      lines.push(`Scope: **${input.summary.locationScope}** only.`);
    }
    if (input.summary.qualifiedCount > 0) {
      lines.push(
        `I also saved **${input.summary.qualifiedCount}** verified dated claim(s): ${input.summary.savedTitles.slice(0, 3).join('; ')}.`,
      );
    } else {
      lines.push(
        'I did not find a verified current event or sale, so nothing was added to the Calendar.',
      );
    }
    if (input.summary.quarantinedCount > 0) {
      lines.push(
        `${input.summary.quarantinedCount} unsupported extraction(s) were quarantined and kept out of inventory.`,
      );
    }
    if (input.summary.watchRuleSaved && input.summary.locationScope) {
      lines.push(`Benson will track the ${input.summary.locationScope} location for material updates.`);
    }
    lines.push(
      'You can mark it Interested, plan a visit, use it in a roundup, or dismiss it.',
    );
  } else if (input.summary.qualificationOutcome === 'ENTITY_PENDING_LOCATION') {
    lines.push(
      entity?.businessName
        ? `I identified **${entity.businessName}** (${entity.officialDomain}).`
        : `I reviewed ${input.pageUrl}.`,
    );
    lines.push(
      `This looks like a multi-location business. Locations I saw: ${input.summary.identifiedLocations.slice(0, 6).join(', ')}.`,
    );
    lines.push('Which location should I track? I will save the place opportunity once you choose a branch.');
  } else if (noSupportedEntity || zeroUsableContent) {
    if (zeroUsableContent) {
      lines.push(
        `I could open the page, but I couldn't extract enough usable information to identify a current event or opportunity.`,
      );
    } else {
      lines.push(`I reviewed ${input.pageUrl}.`);
      if (input.summary.quarantinedCount > 0) {
        lines.push(
          `Unsupported extraction(s) were quarantined — I did **not** save a durable opportunity.`,
        );
      } else {
        lines.push(
          'I could not verify a supported local business or event opportunity from the extracted evidence.',
        );
      }
    }
  } else {
    lines.push(`I reviewed ${input.pageUrl}.`);
    if (input.summary.quarantinedCount > 0) {
      lines.push(
        `I did **not** save an opportunity — ${input.summary.quarantinedCount} extraction(s) failed qualification.`,
      );
    } else {
      lines.push('I could not verify a canonical local business opportunity from this URL.');
    }
  }

  const evidence = [
    hasEntity && entity
      ? `Entity: ${entity.businessName} @ ${entity.officialDomain}`
      : `URL: ${input.pageUrl}`,
    input.summary.locationScope ? `Scope: ${input.summary.locationScope}` : 'Scope: Kansas City metro (default)',
    input.summary.qualificationOutcome
      ? `Outcome: ${input.summary.qualificationOutcome}`
      : `Qualified claims: ${input.summary.qualifiedCount}, Quarantined: ${input.summary.quarantinedCount}`,
    ...(primaryDiag
      ? [`${primaryDiag.domain}: HTTP ${primaryDiag.httpStatus ?? '—'}, ${primaryDiag.textLength} chars`]
      : []),
  ];

  const suggestedActions: string[] = [];
  // Never surface positive opportunity CTAs without a supported durable entity.
  const opportunityActions = hasEntity ? (input.summary.opportunityActions ?? []) : [];

  if (input.summary.needsLocationConfirmation && !input.summary.locationScope) {
    suggestedActions.push('Reply with the branch to track, e.g. "Only track the Lenexa location"');
  }
  if (hasEntity && input.summary.entityOpportunityId) {
    suggestedActions.push(`Open opportunity → /review/inventory?id=${input.summary.entityOpportunityId}`);
    suggestedActions.push(`Interested → /review/inventory?id=${input.summary.entityOpportunityId}&action=interested`);
    suggestedActions.push(`Dismiss → /review/inventory?id=${input.summary.entityOpportunityId}&action=dismiss`);
  } else if (!hasEntity) {
    suggestedActions.push('Retry / research this URL');
    suggestedActions.push('Keep as source');
    suggestedActions.push('Dismiss');
  }
  if (hasEntity && input.summary.watchRuleSaved) {
    suggestedActions.push('Open Watchlist to review saved watch rules');
  }

  return {
    answer: lines.join(' '),
    evidence: evidence.slice(0, 4),
    suggestedActions: suggestedActions.slice(0, 4),
    opportunityActions,
  };
}
