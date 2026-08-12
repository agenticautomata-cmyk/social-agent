/**
 * Structured employment / jobs / careers intent detection for Home eligibility,
 * creator-facing promotion, and category rules.
 *
 * Prefer category + URL + high-precision hiring-event language over bare words
 * like "career", "opportunity", or lone "interview" (which appear in creator prose).
 *
 * Title patterns may use classic listing headlines. Summary/body requires stronger
 * hiring-event signals so incidental "employment opportunities" prose does not demote
 * restaurant/creator content.
 */

export type EmploymentIntentInput = {
  title?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  whyItMatters?: string | null;
  metadata?: Record<string, unknown> | null;
};

const EMPLOYMENT_CATEGORY_KEYS = new Set([
  'employment',
  'job',
  'jobs',
  'job_opportunity',
  'job_opportunities',
  'job_fair',
  'job_fairs',
  'career',
  'careers',
  'career_opportunity',
  'career_opportunities',
  'career_center',
  'hiring',
  'recruiting',
  'recruitment',
  'applicant',
  'applicants',
]);

/** Path/query segments that strongly indicate employment listings. */
const EMPLOYMENT_URL_RE =
  /\/(jobs?|careers?|career-center|employment|hiring|recruiting|recruitment|applicants?|job-openings?)(\/|$|\?)/i;

/**
 * Title / headline listing forms (high precision).
 * Includes hiring-event language that category may mislabel.
 */
const EMPLOYMENT_TITLE_RE = new RegExp(
  String.raw`\b(?:` +
    [
      String.raw`(?:job|career|employment)\s+opportunities?`,
      String.raw`job\s+fair`,
      String.raw`career\s+(?:fair|center|day)`,
      String.raw`now\s+hiring`,
      String.raw`we'?re\s+hiring`,
      String.raw`currently\s+hiring`,
      String.raw`is\s+hiring`,
      String.raw`hiring\s+for`,
      String.raw`hiring\s+event`,
      String.raw`hiring\s+fair`,
      String.raw`open\s+positions?`,
      String.raw`job\s+openings?`,
      String.raw`help\s+wanted`,
      String.raw`apply\s+(?:now|today|online)`,
      String.raw`open\s+interviews?`,
      String.raw`walk[- ]?in\s+interviews?`,
      String.raw`interviewing\s+for\s+(?:positions?|roles?|associates?|staff)`,
      String.raw`multiple\s+positions?(?:\s+available)?`,
      String.raw`(?:full|part)[- ]?time\s+positions?`,
      String.raw`(?:sales\s+associates?|team\s+members?|key\s+holders?|store\s+associates?).{0,40}(?:hiring|interview|recruit|apply|positions?)`,
      String.raw`(?:hiring|interview|recruit|apply|positions?).{0,40}(?:sales\s+associates?|team\s+members?|key\s+holders?|store\s+associates?)`,
    ].join('|') +
    String.raw`)\b`,
  'i',
);

/**
 * Body/summary hiring signals — stronger than incidental "employment opportunities"
 * mentions in restaurant tips or apartment-hunting threads.
 */
const EMPLOYMENT_SUMMARY_RE = new RegExp(
  String.raw`\b(?:` +
    [
      String.raw`now\s+hiring`,
      String.raw`we'?re\s+hiring`,
      String.raw`currently\s+hiring`,
      String.raw`is\s+hiring`,
      String.raw`hiring\s+for`,
      String.raw`hiring\s+event`,
      String.raw`hiring\s+fair`,
      // Open/walk-in interviews in body only with nearby hiring context (avoids
      // grand-opening articles that briefly mention interviews for staff).
      String.raw`open\s+interviews?[^.!?]{0,100}(?:hiring|apply|positions?|associates?|jobs?|staff|roles?)`,
      String.raw`(?:hiring|apply|positions?|associates?|jobs?)[^.!?]{0,100}open\s+interviews?`,
      String.raw`walk[- ]?in\s+interviews?`,
      String.raw`interviewing\s+for\s+(?:positions?|roles?|associates?|staff)`,
      String.raw`job\s+fair`,
      String.raw`help\s+wanted`,
      String.raw`apply\s+(?:now|today|online)\b.{0,80}(?:position|job|career|hiring)`,
      String.raw`(?:full|part)[- ]?time\s+positions?`,
      String.raw`(?:sales\s+associates?|team\s+members?|key\s+holders?|store\s+associates?).{0,40}(?:hiring|interview|recruit|apply|positions?)`,
      String.raw`(?:hiring|interview|recruit).{0,40}(?:sales\s+associates?|team\s+members?|key\s+holders?|store\s+associates?)`,
    ].join('|') +
    String.raw`)\b`,
  'i',
);

const CREATOR_OPS_EXCEPTION_RE =
  /\b(creator\s+program|influencer\s+program|brand\s+ambassador|ugc|sponsorship|collab(oration)?|media\s+kit|affiliate\s+program)\b/i;

/** Lone "interview" in creator/media contexts must not trip employment. */
const CREATOR_INTERVIEW_ALLOW_RE =
  /\b(?:creator|designer|artist|founder|owner|media|press|podcast|editorial)\s+interview\b|\binterview\s+with\s+(?:a\s+)?(?:designer|creator|artist|founder|owner)\b|\bcareer\s+retrospective\b|\bpartnership\s+opportunity\b/i;

function categoryKey(category: string | null | undefined): string {
  return (category ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
}

function metadataCategory(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  for (const key of ['opportunityCategory', 'category', 'contentCategory']) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function textHasEmploymentUrl(text: string): boolean {
  return (
    EMPLOYMENT_URL_RE.test(text) ||
    /https?:\/\/[^\s)]+\/(?:jobs?|careers?)(?:\/|\?|$)/i.test(text)
  );
}

export function isEmploymentOpportunity(input: EmploymentIntentInput): boolean {
  const title = (input.title ?? '').trim();
  const summary = (input.summary ?? '').trim();
  const why = (input.whyItMatters ?? '').trim();
  const body = [summary, why].filter(Boolean).join('\n');
  const textBlob = [title, body].filter(Boolean).join('\n');

  if (
    CREATOR_OPS_EXCEPTION_RE.test(textBlob) &&
    !EMPLOYMENT_URL_RE.test(input.sourceUrl ?? '') &&
    !textHasEmploymentUrl(textBlob)
  ) {
    const cat = categoryKey(input.category ?? metadataCategory(input.metadata));
    if (!EMPLOYMENT_CATEGORY_KEYS.has(cat) && !EMPLOYMENT_TITLE_RE.test(title) && !EMPLOYMENT_SUMMARY_RE.test(body)) {
      return false;
    }
  }

  // Creator/media interview prose without hiring context stays allowed.
  if (
    CREATOR_INTERVIEW_ALLOW_RE.test(textBlob) &&
    !EMPLOYMENT_TITLE_RE.test(title) &&
    !EMPLOYMENT_SUMMARY_RE.test(body)
  ) {
    const cat = categoryKey(input.category ?? metadataCategory(input.metadata));
    if (
      !EMPLOYMENT_CATEGORY_KEYS.has(cat) &&
      !EMPLOYMENT_URL_RE.test(input.sourceUrl ?? '') &&
      !textHasEmploymentUrl(textBlob)
    ) {
      return false;
    }
  }

  const cat = categoryKey(input.category ?? metadataCategory(input.metadata));
  if (cat && EMPLOYMENT_CATEGORY_KEYS.has(cat)) return true;

  const tags = input.metadata?.tags;
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === 'string' && EMPLOYMENT_CATEGORY_KEYS.has(categoryKey(tag))) return true;
    }
  }

  if (input.sourceUrl && EMPLOYMENT_URL_RE.test(input.sourceUrl)) return true;
  if (textBlob && textHasEmploymentUrl(textBlob)) return true;

  if (title && EMPLOYMENT_TITLE_RE.test(title)) return true;
  if (body && EMPLOYMENT_SUMMARY_RE.test(body)) return true;

  return false;
}
