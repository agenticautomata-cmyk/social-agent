import type { CreatorRelevanceInput, CreatorValueStatus } from './types.js';

const ESTATE_SALE_RE =
  /\b(estate sale|estate auction|antique auction|household auction|collectible sale|tag sale|moving sale)\b/i;
const LIBRARY_ROUTINE_RE =
  /\b(story ?hour|storytime|library class|library meeting|toddler time|baby bounce)\b/i;
const LIQUOR_RENEWAL_RE =
  /\b(renewal|renew(ed)? license|license renewal|annual license|beer license renewal|wine license renewal)\b/i;
const ARTICLE_HEADLINE_RE =
  /\b(clearance sale:|buy \d+ or more|we had a blast|article:|news:|headline:)\b/i;
const PROMOTION_RE = /\b(clearance sale|buy \d+ or more items?|% off entire store)\b/i;

export type CategoryRuleMatch = {
  ruleKey: string;
  hidden: boolean;
  reason: string;
  allowSignal?: string;
};

function haystack(input: CreatorRelevanceInput): string {
  const meta = input.metadata ?? {};
  const ingest = (meta.ingest as Record<string, unknown> | undefined) ?? {};
  return [
    input.title,
    input.summary,
    input.contentCategory,
    input.sourceType,
    input.signalType,
    input.businessName,
    meta.category,
    ingest.category,
    ingest.sourceLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function matchesEstateSaleDefault(text: string): boolean {
  return ESTATE_SALE_RE.test(text);
}

export function matchesLibraryRoutineDefault(text: string): boolean {
  return LIBRARY_ROUTINE_RE.test(text);
}

export function matchesLiquorRenewalDefault(text: string): boolean {
  return LIQUOR_RENEWAL_RE.test(text) && !/\b(new (bar|cafe|restaurant|brewery|winery|location|concept))\b/i.test(text);
}

export function matchesArticleHeadlineAsCompany(text: string): boolean {
  return ARTICLE_HEADLINE_RE.test(text) || PROMOTION_RE.test(text);
}

export function evaluateCategoryRules(input: CreatorRelevanceInput): CategoryRuleMatch | null {
  const text = haystack(input);

  if (matchesEstateSaleDefault(text)) {
    const luxury =
      /\b(luxury|celebrity|designer|million|estate of|historic mansion|rare collection)\b/i.test(text);
    if (!luxury) {
      return {
        ruleKey: 'estate_sale',
        hidden: true,
        reason: 'category_rule:estate_or_antique_default_hidden',
      };
    }
    return {
      ruleKey: 'estate_sale',
      hidden: false,
      reason: 'category_rule:estate_exception_angle',
      allowSignal: 'luxury_or_viral_estate_angle',
    };
  }

  if (matchesLibraryRoutineDefault(text) || /\bkc library\b/i.test(text)) {
    const major =
      /\b(celebrity|exhibit|festival|concert|author visit|free museum|major event|nationally)\b/i.test(text);
    if (!major) {
      return {
        ruleKey: 'library_routine',
        hidden: true,
        reason: 'category_rule:routine_library_hidden',
      };
    }
    return {
      ruleKey: 'library_routine',
      hidden: false,
      reason: 'category_rule:library_major_event',
      allowSignal: 'major_library_event',
    };
  }

  if (/\b(liquor|beer|wine)\b/i.test(text) && matchesLiquorRenewalDefault(text)) {
    return {
      ruleKey: 'liquor_renewal',
      hidden: true,
      reason: 'category_rule:routine_liquor_renewal_hidden',
    };
  }

  if (/\b(new (bar|restaurant|cafe|brewery|winery|concept|location|ownership))\b/i.test(text)) {
    return {
      ruleKey: 'liquor_renewal',
      hidden: false,
      reason: 'category_rule:liquor_new_business_signal',
      allowSignal: 'new_business',
    };
  }

  if (matchesArticleHeadlineAsCompany(text)) {
    return {
      ruleKey: 'article_headline',
      hidden: true,
      reason: 'category_rule:article_or_promotion_not_company',
    };
  }

  return null;
}

export function defaultHiddenStatusForRule(rule: CategoryRuleMatch): CreatorValueStatus {
  return rule.hidden ? 'hidden_raw_signal' : 'researching';
}
