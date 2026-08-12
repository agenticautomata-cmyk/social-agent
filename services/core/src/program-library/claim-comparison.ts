/** Range-aware and compound benefit comparison for operator vs researched claims. */

export type ParsedPercentRange = {
  min: number;
  max: number;
  raw: string;
};

export type ParsedCompoundBenefit = {
  percent: ParsedPercentRange | null;
  fixedAmount: string | null;
  raw: string;
};

export type ClaimConsistencyResult =
  | { consistent: true; reason: 'exact_match' | 'inside_operator_range' | 'partial_percent_match' }
  | { consistent: false; reason: 'outside_operator_range' | 'incompatible_values' };

const RANGE_SEP = /\s*(?:–|-|to)\s*/i;

export function parsePercentToken(value: string): number | null {
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  return Number.parseFloat(match[1]!);
}

export function parsePercentRange(value: string | null | undefined): ParsedPercentRange | null {
  const raw = value?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\baverage\b/gi, '').trim();
  const normalized = cleaned.replace(/[\u2013\u2014\u2212–—]/g, '-');

  const bothPercent = normalized.match(/(\d+(?:\.\d+)?)\s*%\s*-\s*(\d+(?:\.\d+)?)\s*%/i);
  if (bothPercent) {
    const min = Number.parseFloat(bothPercent[1]!);
    const max = Number.parseFloat(bothPercent[2]!);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max), raw };
    }
  }

  const trailingPercent = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%/i);
  if (trailingPercent) {
    const min = Number.parseFloat(trailingPercent[1]!);
    const max = Number.parseFloat(trailingPercent[2]!);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max), raw };
    }
  }

  const toMatch = normalized.match(/(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)\s*%/i);
  if (toMatch) {
    const min = Number.parseFloat(toMatch[1]!);
    const max = Number.parseFloat(toMatch[2]!);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { min: Math.min(min, max), max: Math.max(min, max), raw };
    }
  }

  const single = parsePercentToken(normalized);
  if (single == null) return null;
  return { min: single, max: single, raw };
}

export function parseCompoundBenefit(value: string | null | undefined): ParsedCompoundBenefit | null {
  const raw = value?.trim();
  if (!raw) return null;
  const percent = parsePercentRange(raw);
  const fixedMatch = raw.match(/(?:\+|and)\s*(\$\s*\d+(?:\.\d+)?)/i);
  const fixedAmount = fixedMatch?.[1]?.replace(/\s+/g, '') ?? null;
  if (!percent && !fixedAmount) return null;
  return { percent, fixedAmount, raw };
}

export function isPercentInsideOperatorRange(
  operatorValue: string | null | undefined,
  researchedValue: string | null | undefined,
): boolean {
  const operatorRange = parsePercentRange(operatorValue);
  const researchedRange = parsePercentRange(researchedValue);
  if (!operatorRange || !researchedRange) return false;
  return researchedRange.min >= operatorRange.min && researchedRange.max <= operatorRange.max;
}

export function evaluateOperatorResearchConsistency(
  operatorValue: string | null | undefined,
  researchedValue: string | null | undefined,
): ClaimConsistencyResult {
  const operator = operatorValue?.trim();
  const researched = researchedValue?.trim();
  if (!operator || !researched) return { consistent: false, reason: 'incompatible_values' };
  if (operator === researched) return { consistent: true, reason: 'exact_match' };

  const operatorCompound = parseCompoundBenefit(operator);
  const researchedCompound = parseCompoundBenefit(researched);

  if (operatorCompound?.percent && researchedCompound?.percent && !researchedCompound.fixedAmount) {
    if (isPercentInsideOperatorRange(operatorCompound.percent.raw, researchedCompound.percent.raw)) {
      return { consistent: true, reason: 'partial_percent_match' };
    }
  }

  if (isPercentInsideOperatorRange(operator, researched)) {
    return { consistent: true, reason: 'inside_operator_range' };
  }

  const operatorSingle = parsePercentRange(operator);
  const researchedSingle = parsePercentRange(researched);
  if (
    operatorSingle &&
    researchedSingle &&
    operatorSingle.min === operatorSingle.max &&
    researchedSingle.min === researchedSingle.max &&
    operatorSingle.min === researchedSingle.min
  ) {
    return { consistent: true, reason: 'exact_match' };
  }

  return { consistent: false, reason: 'outside_operator_range' };
}

export function unresolvedCompoundComponents(
  operatorValue: string | null | undefined,
  researchedValue: string | null | undefined,
): string[] {
  const operatorCompound = parseCompoundBenefit(operatorValue);
  const researchedCompound = parseCompoundBenefit(researchedValue);
  if (!operatorCompound?.fixedAmount) return [];
  if (researchedCompound?.fixedAmount) return [];
  const percentConsistent = evaluateOperatorResearchConsistency(operatorValue, researchedValue);
  if (!percentConsistent.consistent) return [];
  return [operatorCompound.fixedAmount];
}
