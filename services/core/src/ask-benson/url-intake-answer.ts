import type { ResolvedUrlEntity } from './qualify-url-opportunity.js';
import type { UrlIntakeDiagnostics } from './url-intake-pipeline.js';
import type { UrlIntakeOutcome } from './url-entity-opportunity.js';
import {
  formatOpportunityTypeLabel,
  buildEntityOpportunityActions,
} from './url-entity-opportunity.js';

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
};

export function buildEvidenceFirstUrlAnswer(input: {
  summary: UrlIntakeSummary;
  pageUrl: string;
  userMessage?: string;
}): { answer: string; evidence: string[]; suggestedActions: string[]; opportunityActions?: UrlIntakeOpportunityAction[] } {
  const entity = input.summary.entity;
  const lines: string[] = [];
  const hasEntity =
    Boolean(input.summary.entityOpportunityId) &&
    input.summary.qualificationOutcome !== 'ENTITY_REJECTED' &&
    input.summary.qualificationOutcome !== 'ENTITY_PENDING_LOCATION';

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
  } else {
    lines.push(
      entity?.businessName
        ? `I identified **${entity.businessName}** (${entity.officialDomain}).`
        : `I reviewed ${input.pageUrl}.`,
    );
    if (input.summary.quarantinedCount > 0) {
      lines.push(
        `I did **not** save an opportunity — ${input.summary.quarantinedCount} extraction(s) failed qualification.`,
      );
    } else {
      lines.push('I could not verify a canonical local business opportunity from this URL.');
    }
  }

  const evidence = [
    entity ? `Entity: ${entity.businessName} @ ${entity.officialDomain}` : `URL: ${input.pageUrl}`,
    input.summary.locationScope ? `Scope: ${input.summary.locationScope}` : 'Scope: Kansas City metro (default)',
    input.summary.qualificationOutcome
      ? `Outcome: ${input.summary.qualificationOutcome}`
      : `Qualified claims: ${input.summary.qualifiedCount}, Quarantined: ${input.summary.quarantinedCount}`,
    ...(input.summary.diagnostics?.[0]
      ? [
          `${input.summary.diagnostics[0].domain}: HTTP ${input.summary.diagnostics[0].httpStatus ?? '—'}, ${input.summary.diagnostics[0].textLength} chars`,
        ]
      : []),
  ];

  const suggestedActions: string[] = [];
  const opportunityActions = input.summary.opportunityActions ?? [];

  if (input.summary.needsLocationConfirmation && !input.summary.locationScope) {
    suggestedActions.push('Reply with the branch to track, e.g. "Only track the Lenexa location"');
  }
  if (hasEntity && input.summary.entityOpportunityId) {
    suggestedActions.push(`Open opportunity → /review/inventory?id=${input.summary.entityOpportunityId}`);
    suggestedActions.push(`Interested → /review/inventory?id=${input.summary.entityOpportunityId}&action=interested`);
    suggestedActions.push(`Dismiss → /review/inventory?id=${input.summary.entityOpportunityId}&action=dismiss`);
  } else if (!hasEntity) {
    suggestedActions.push('Share a direct location page if you have one');
  }
  if (input.summary.watchRuleSaved) {
    suggestedActions.push('Open Watchlist to review saved watch rules');
  }

  return {
    answer: lines.join(' '),
    evidence: evidence.slice(0, 4),
    suggestedActions: suggestedActions.slice(0, 4),
    opportunityActions,
  };
}
