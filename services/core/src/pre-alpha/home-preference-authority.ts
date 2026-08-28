/**
 * Home preference display authority — durable negative feedback outranks
 * generated interest commentary; opposing statements cannot both appear.
 */

export type PreferenceDirection = 'favor' | 'avoid' | 'neutral';

export type PreferenceStatement = {
  id: string;
  categoryKey: string;
  direction: PreferenceDirection;
  confidence: 'high' | 'medium' | 'low' | string;
  durability: 'durable' | 'temporary' | string;
  insight: string;
  action: string;
  evidenceCount?: number;
  evidenceDateRange?: string | null;
  materialChangeSinceLastShown?: boolean;
  lessonType?: string;
};

const CATEGORY_KEY_RE =
  /\b(literary(?:\s+events?)?|food(?:\s+and\s+drink)?|drink|dining|shopping|thrift|vintage|concerts?|sports?|nightlife|family|kids?|luxury|hotels?|spa)\b/i;

const AVOID_RE =
  /\b(disinterest|not interested|less like|deprioritize|avoid|don't|do not|against|negative)\b/i;
const FAVOR_RE =
  /\b(interested|more like|focus on|gaining traction|prefer|prioritize|hot interested|still hot)\b/i;

export function normalizePreferenceCategoryKey(text: string): string | null {
  const m = text.match(CATEGORY_KEY_RE);
  if (!m?.[1]) return null;
  const raw = m[1].toLowerCase();
  if (/literary/.test(raw)) return 'literary_event';
  if (/food|drink|dining/.test(raw)) return 'food_drink';
  if (/thrift|vintage|shopping/.test(raw)) return 'shopping_retail';
  if (/concert/.test(raw)) return 'concert';
  if (/sport/.test(raw)) return 'sports';
  if (/nightlife/.test(raw)) return 'nightlife';
  if (/family|kids/.test(raw)) return 'family';
  if (/luxury|hotel|spa/.test(raw)) return 'luxury';
  return raw.replace(/\s+/g, '_');
}

export function inferPreferenceDirection(text: string): PreferenceDirection {
  const avoid = AVOID_RE.test(text);
  const favor = FAVOR_RE.test(text);
  if (avoid && !favor) return 'avoid';
  if (favor && !avoid) return 'favor';
  if (avoid && favor) {
    // Explicit less-like / disinterest wins over awkward “still hot interested”.
    if (/\bless like\b|\bdisinterest\b|\bdeprioritize\b/i.test(text)) return 'avoid';
    return 'neutral';
  }
  return 'neutral';
}

function confidenceRank(c: string): number {
  if (c === 'high') return 3;
  if (c === 'medium') return 2;
  if (c === 'low') return 1;
  return 0;
}

/**
 * Resolve conflicting preference statements for the same category.
 * Explicit avoid / less-like / durable negative outranks inferred favor.
 */
export function resolvePreferenceConflicts(statements: PreferenceStatement[]): PreferenceStatement[] {
  const byCategory = new Map<string, PreferenceStatement[]>();
  for (const s of statements) {
    const key = s.categoryKey || normalizePreferenceCategoryKey(`${s.insight} ${s.action}`) || s.id;
    const list = byCategory.get(key) ?? [];
    list.push({ ...s, categoryKey: key });
    byCategory.set(key, list);
  }

  const resolved: PreferenceStatement[] = [];
  for (const [, group] of byCategory) {
    if (group.length === 1) {
      resolved.push(group[0]!);
      continue;
    }
    const avoids = group.filter((g) => g.direction === 'avoid');
    const favors = group.filter((g) => g.direction === 'favor');
    if (avoids.length && favors.length) {
      const durableAvoid = avoids
        .filter((a) => a.durability === 'durable' || confidenceRank(a.confidence) >= 2)
        .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))[0];
      if (durableAvoid) {
        resolved.push(durableAvoid);
        continue;
      }
    }
    // Highest confidence durable wins; otherwise first.
    group.sort((a, b) => {
      const d = (b.durability === 'durable' ? 1 : 0) - (a.durability === 'durable' ? 1 : 0);
      if (d) return d;
      return confidenceRank(b.confidence) - confidenceRank(a.confidence);
    });
    resolved.push(group[0]!);
  }
  return resolved;
}

export function statementsFromLearningInsights(
  insights: Array<{
    id: string;
    insight: string;
    action?: string;
    confidence?: string;
    durability?: string;
    lessonType?: string;
    evidenceDateRange?: string | null;
    materialChangeSinceLastShown?: boolean;
  }>,
): PreferenceStatement[] {
  return insights.map((i) => {
    const blob = `${i.insight} ${i.action ?? ''}`;
    return {
      id: i.id,
      categoryKey: normalizePreferenceCategoryKey(blob) ?? i.id,
      direction: inferPreferenceDirection(blob),
      confidence: i.confidence ?? 'medium',
      durability: i.durability ?? 'temporary',
      insight: i.insight,
      action: i.action ?? '',
      evidenceDateRange: i.evidenceDateRange,
      materialChangeSinceLastShown: i.materialChangeSinceLastShown,
      lessonType: i.lessonType,
    };
  });
}

/**
 * Rewrite summary so it cannot contradict resolved durable preferences.
 * Drops awkward “still hot interested” and opposing literary messaging.
 */
export function reconcileLearningSummary(input: {
  summary: string;
  statements: PreferenceStatement[];
}): { summary: string; corrected: boolean } {
  let summary = (input.summary ?? '').trim();
  let corrected = false;

  // Awkward generated phrasing.
  if (/\bstill hot interested\b/i.test(summary)) {
    summary = summary.replace(/\bstill hot interested\b/gi, 'still interested');
    corrected = true;
  }

  const literary = input.statements.find((s) => s.categoryKey === 'literary_event');
  if (literary?.direction === 'avoid') {
    // Remove any positive literary clauses from the summary.
    const before = summary;
    summary = summary
      .replace(/[^.!?]*\bliterary\b[^.!?]*\b(interested|interest|hot)\b[^.!?]*[.!?]/gi, ' ')
      .replace(/[^.!?]*\b(interested|interest)\b[^.!?]*\bliterary\b[^.!?]*[.!?]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (summary !== before) corrected = true;
    // Ensure avoid direction is reflected once when summary still claims interest elsewhere.
    if (/\bliterary\b/i.test(summary) && FAVOR_RE.test(summary) && !AVOID_RE.test(summary)) {
      summary = summary.replace(/[^.!?]*\bliterary\b[^.!?]*[.!?]/gi, ' ').replace(/\s+/g, ' ').trim();
      corrected = true;
    }
  }

  // “Nothing new emerged” must not preface restated old preference records.
  const hasOnlyStale =
    input.statements.length > 0 &&
    input.statements.every((s) => s.materialChangeSinceLastShown === false);
  if (/^nothing new (emerged|to report)/i.test(summary) && hasOnlyStale) {
    summary = '';
    corrected = true;
  }

  return { summary, corrected };
}

/**
 * Home-facing learning block: only show when there is new non-contradictory evidence.
 * Otherwise omit (empty is better than restating old prefs as news).
 */
export function selectHomeLearningBrief(input: {
  summary: string;
  insights: Array<{
    id: string;
    insight: string;
    action?: string;
    confidence?: string;
    durability?: string;
    lessonType?: string;
    evidenceDateRange?: string | null;
    materialChangeSinceLastShown?: boolean;
  }>;
}): {
  show: boolean;
  statement: string | null;
  insights: PreferenceStatement[];
  corrected: boolean;
} {
  const statements = resolvePreferenceConflicts(statementsFromLearningInsights(input.insights));
  const { summary, corrected } = reconcileLearningSummary({
    summary: input.summary,
    statements,
  });

  const material = statements.filter(
    (s) => s.materialChangeSinceLastShown === true || s.durability === 'durable',
  );
  // Home default: one short statement only when something material/new exists.
  const fresh = statements.filter((s) => s.materialChangeSinceLastShown === true);
  if (fresh.length === 0) {
    // No new evidence — hide the learning block on Home (durable prefs stay in expander/API detail).
    return { show: false, statement: null, insights: statements, corrected: corrected || true };
  }

  const primary = fresh.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))[0]!;
  const statement =
    summary && !/^nothing new/i.test(summary)
      ? summary.slice(0, 220)
      : primary.insight.slice(0, 220);

  return {
    show: Boolean(statement),
    statement,
    insights: material.slice(0, 3),
    corrected,
  };
}
