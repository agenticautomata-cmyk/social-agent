import type { ResolvedUrlEntity } from './qualify-url-opportunity.js';
import type { UrlIntakeDiagnostics } from './url-intake-pipeline.js';

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
};

export function buildEvidenceFirstUrlAnswer(input: {
  summary: UrlIntakeSummary;
  pageUrl: string;
  userMessage?: string;
}): { answer: string; evidence: string[]; suggestedActions: string[] } {
  const entity = input.summary.entity;
  const lines: string[] = [];

  lines.push(
    entity?.businessName
      ? `I identified **${entity.businessName}** (${entity.officialDomain}).`
      : `I reviewed ${input.pageUrl}.`,
  );

  if (input.summary.locationScope) {
    lines.push(`Active watch scope: **${input.summary.locationScope}** only.`);
  } else if (input.summary.needsLocationConfirmation && input.summary.identifiedLocations.length > 0) {
    lines.push(
      `This looks like a multi-location business. Locations I saw: ${input.summary.identifiedLocations.slice(0, 6).join(', ')}.`,
    );
    lines.push('Which location should I track?');
  }

  if (input.summary.qualifiedCount > 0) {
    lines.push(
      `I saved **${input.summary.qualifiedCount}** qualified item(s): ${input.summary.savedTitles.slice(0, 3).join('; ')}.`,
    );
  } else if (input.summary.quarantinedCount > 0) {
    lines.push(
      `I did **not** add anything to inventory — ${input.summary.quarantinedCount} extraction(s) failed qualification.`,
    );
    if (input.summary.quarantineReasons[0]) {
      lines.push(input.summary.quarantineReasons[0]!);
    }
  } else {
    lines.push('No current actionable events or updates passed qualification for your scope.');
  }

  if (input.summary.watchRuleSaved && input.summary.locationScope) {
    lines.push(
      `A persistent ${input.summary.locationScope}-only watch rule is saved for this domain.`,
    );
  } else if (input.summary.watchRuleSaved) {
    lines.push('A persistent watch rule is saved for this domain.');
  }

  lines.push('Unverified web snippets were not promoted to inventory.');

  const evidence = [
    entity ? `Entity: ${entity.businessName} @ ${entity.officialDomain}` : `URL: ${input.pageUrl}`,
    input.summary.locationScope ? `Scope: ${input.summary.locationScope}` : 'Scope: Kansas City metro (default)',
    `Qualified: ${input.summary.qualifiedCount}, Quarantined: ${input.summary.quarantinedCount}`,
    ...(input.summary.diagnostics?.[0]
      ? [
          `${input.summary.diagnostics[0].domain}: HTTP ${input.summary.diagnostics[0].httpStatus ?? '—'}, ${input.summary.diagnostics[0].textLength} chars`,
        ]
      : []),
  ];

  const suggestedActions: string[] = [];
  if (input.summary.needsLocationConfirmation && !input.summary.locationScope) {
    suggestedActions.push('Reply with the branch to track, e.g. "Only track the Lenexa location"');
  }
  if (input.summary.qualifiedCount === 0) {
    suggestedActions.push('Share a direct event page or location-specific URL if you have one');
  }
  suggestedActions.push('Open Watchlist to review saved watch rules');

  return {
    answer: lines.join(' '),
    evidence: evidence.slice(0, 4),
    suggestedActions: suggestedActions.slice(0, 3),
  };
}
