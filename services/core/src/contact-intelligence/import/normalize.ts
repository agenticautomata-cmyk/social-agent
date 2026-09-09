import {
  WORKBOOK_CHECKED_DATE,
  WORKBOOK_ID,
  type ContactChannelConcept,
  type OutreachWorkbookRow,
  type ProgramIntelligenceKind,
  type ProgramWorkbookRow,
  type ProposedContactEvidenceState,
  type WorkbookBundle,
  type WorkbookConfidence,
} from './types.js';
import { resolveOrgAlias } from './org-aliases.js';
import { createHash } from 'node:crypto';

export function normalizeConfidence(raw: string | null | undefined): WorkbookConfidence {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'high') return 'High';
  if (v === 'medium') return 'Medium';
  if (v === 'low') return 'Low';
  return 'unknown';
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v || !v.includes('@')) return null;
  return v;
}

export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

export function slugToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/**
 * Stable per-contact import key for idempotent re-import.
 * Format: kc-pr-dir:{checkedDate}:{orgKey}:{contactKey}
 */
export function buildOutreachImportKey(row: OutreachWorkbookRow): string {
  const org = resolveOrgAlias({
    businessName: row.establishment,
    email: row.email,
    websiteOrSourceUrl: row.sourceUrl,
  });
  const email = normalizeEmail(row.email);
  const phone = normalizePhoneDigits(row.phone);
  let contactKey: string;
  if (email) contactKey = `email:${email}`;
  else if (row.sourceUrl && /form|application|contact/i.test(row.routeType ?? '')) {
    contactKey = `form:${shortHash(row.sourceUrl.trim().toLowerCase())}`;
  } else if (phone) contactKey = `phone:${phone}`;
  else if (row.titleDesk) contactKey = `role:${slugToken(row.titleDesk)}`;
  else if (row.contact) contactKey = `person:${slugToken(row.contact)}`;
  else contactKey = `row:${row.sheetRow}`;

  return `kc-pr-dir:${WORKBOOK_CHECKED_DATE}:${org.orgKey}:${contactKey}`;
}

export function buildProgramImportKey(row: ProgramWorkbookRow): string {
  const url = (row.sourceUrl ?? '').trim().toLowerCase();
  const idPart = url ? `url:${shortHash(url)}` : `name:${slugToken(row.program)}`;
  return `kc-pr-dir-program:${WORKBOOK_CHECKED_DATE}:${idPart}`;
}

export function mapRouteToChannel(row: OutreachWorkbookRow): {
  channelConcept: ContactChannelConcept;
  proposedEvidenceState: ProposedContactEvidenceState;
  nextContactPath: string | null;
} {
  const route = (row.routeType ?? '').toLowerCase();
  const email = normalizeEmail(row.email);
  const hasName = Boolean(row.contact?.trim());
  const local = email?.split('@')[0] ?? '';

  const isForm =
    /\bform\b/.test(route) ||
    /\bapplication\b/.test(route) ||
    /affiliate application/.test(route) ||
    /partner page/.test(route) ||
    /official contact page/.test(route);

  if (isForm && !email) {
    return {
      channelConcept: /affiliate/.test(route) ? 'affiliate_application' : 'official_form',
      proposedEvidenceState: 'official_contact_form',
      nextContactPath: 'official_contact_form',
    };
  }

  if (!email) {
    if (/phone/.test(route) || normalizePhoneDigits(row.phone)) {
      return {
        channelConcept: 'phone',
        proposedEvidenceState: 'unknown',
        nextContactPath: 'phone',
      };
    }
    if (/leadership|staff page/.test(route) && hasName) {
      return {
        channelConcept: 'named_person_needs_research',
        proposedEvidenceState: 'unknown',
        nextContactPath: 'named_person_needs_research',
      };
    }
    return {
      channelConcept: 'unknown',
      proposedEvidenceState: 'unknown',
      nextContactPath: null,
    };
  }

  const roleLocal =
    /^(media|press|pr|publicity|marketing|partnerships?|partner|collab|collabs|collaborations?|influencer|creators?|social|socialmedia|social\.media|communications?|comms)$/.test(
      local,
    );

  const generalLocal = /^(info|hello|contact|office|admin|support|help)$/.test(local);
  const looksGeneralRoute = /general public|management email|association email|general business/.test(
    route,
  );

  if (hasName && !roleLocal && !generalLocal && !looksGeneralRoute) {
    return {
      channelConcept: 'named_decision_maker',
      proposedEvidenceState: 'verified_named_decision_maker',
      nextContactPath: null,
    };
  }

  if (roleLocal || /media|press|pr|publicity|marketing|communications|content email/.test(route)) {
    return {
      channelConcept: hasName ? 'named_decision_maker' : 'role_inbox',
      proposedEvidenceState: hasName ? 'verified_named_decision_maker' : 'verified_role_inbox',
      nextContactPath: null,
    };
  }

  return {
    channelConcept: 'general_inbox',
    proposedEvidenceState: 'official_general_inbox',
    nextContactPath: 'official_general_inbox',
  };
}

export function mapProgramKind(typeRaw: string | null | undefined): ProgramIntelligenceKind {
  const t = (typeRaw ?? '').toLowerCase();
  if (/affiliate/.test(t) && /creator|collaboration/.test(t)) return 'creator_program';
  if (/^affiliate$/.test(t.trim()) || t === 'affiliate') return 'affiliate';
  if (t.includes('affiliate') && !t.includes('collaboration')) return 'affiliate';
  if (/influencer/.test(t)) return 'influencer_network';
  if (/hosted/.test(t)) return 'hosted_visit';
  if (/media access/.test(t)) return 'media_access';
  if (/consumer rewards|content hook/.test(t)) return 'consumer_rewards';
  return 'other';
}

/** Program-library enum currently supported in schema — hosted/media map to other + tag. */
export function programTypeForLibrary(kind: ProgramIntelligenceKind): string {
  switch (kind) {
    case 'affiliate':
      return 'affiliate';
    case 'creator_program':
      return 'creator';
    case 'influencer_network':
      return 'influencer';
    default:
      return 'other';
  }
}

export function brandNameFromProgram(row: ProgramWorkbookRow): string {
  const p = row.program;
  const known: Array<[RegExp, string]> = [
    [/^visit kc\b/i, 'Visit KC'],
    [/^kansas tourism\b/i, 'Kansas Tourism'],
    [/^missouri restaurant association\b/i, 'Missouri Restaurant Association'],
    [/^kc cattle company\b/i, 'KC Cattle Company'],
    [/^kc dresses\b/i, 'KC Dresses'],
    [/^kuna foodservice\b/i, 'Kuna Foodservice'],
    [/^worlds of fun\b/i, 'Worlds of Fun / Oceans of Fun'],
    [/^national wwi\b/i, 'National WWI Museum and Memorial'],
    [/^starlight\b/i, 'Starlight Theatre'],
    [/^kc bbq experience\b/i, 'Visit KC'],
  ];
  for (const [re, name] of known) {
    if (re.test(p)) return name;
  }
  return p.replace(/\s+via\s+Awin$/i, '').trim() || p;
}

type RawFixture = {
  meta?: {
    workbookFileName?: string;
    checkedDate?: string;
    sheets?: string[];
    sourceNote?: string;
  };
  outreach: Array<Record<string, string | null>>;
  programs: Array<Record<string, string | null>>;
  checked?: string;
};

/**
 * Accepts either the normalized fixture shape (camel keys after loadWorkbookFixture)
 * or the raw column-name shape produced from the xlsx dump.
 */
export function loadWorkbookFixture(raw: unknown): WorkbookBundle {
  const data = raw as RawFixture;
  const checked = data.meta?.checkedDate ?? data.checked ?? WORKBOOK_CHECKED_DATE;

  const outreach: OutreachWorkbookRow[] = (data.outreach ?? []).map((r, i) => {
    // Support both raw workbook headers and camelCase.
    const establishment = String(r.establishment ?? r.Establishment ?? '').trim();
    return {
      establishment,
      category: nullIfEmpty(r.category ?? r.Category),
      area: nullIfEmpty(r.area ?? r.Area),
      contact: nullIfEmpty(r.contact ?? r.Contact),
      titleDesk: nullIfEmpty(r.titleDesk ?? r['Title / Desk']),
      email: normalizeEmail(r.email ?? r.Email),
      phone: nullIfEmpty(r.phone ?? r.Phone),
      routeType: nullIfEmpty(r.routeType ?? r['Route Type']),
      bestUse: nullIfEmpty(r.bestUse ?? r['Best Use']),
      confidence: normalizeConfidence(r.confidence ?? r.Confidence),
      sourceUrl: nullIfEmpty(r.sourceUrl ?? r['Source URL']),
      notes: nullIfEmpty(r.notes ?? r.Notes),
      sheetRow: typeof r.sheetRow === 'number' ? (r.sheetRow as unknown as number) : i + 1,
    };
  });

  const programs: ProgramWorkbookRow[] = (data.programs ?? []).map((r, i) => ({
    program: String(r.program ?? r.Program ?? '').trim(),
    type: nullIfEmpty(r.type ?? r.Type),
    benefitPay: nullIfEmpty(r.benefitPay ?? r['Benefit / Pay']),
    requirements: nullIfEmpty(r.requirements ?? r.Requirements),
    sourceUrl: nullIfEmpty(r.sourceUrl ?? r['Source URL']),
    howToUse: nullIfEmpty(r.howToUse ?? r['How to Use']),
    sheetRow: typeof r.sheetRow === 'number' ? (r.sheetRow as unknown as number) : i + 1,
  }));

  return {
    meta: {
      workbookFileName: data.meta?.workbookFileName ?? 'Kansas_City_PR_Affiliate_Directory.xlsx',
      checkedDate: checked,
      sheets: data.meta?.sheets ?? ['Outreach Directory', 'Programs', 'Read Me'],
      sourceNote: data.meta?.sourceNote,
    },
    outreach: outreach.filter((r) => r.establishment),
    programs: programs.filter((r) => r.program),
  };
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

export { WORKBOOK_ID, WORKBOOK_CHECKED_DATE };
