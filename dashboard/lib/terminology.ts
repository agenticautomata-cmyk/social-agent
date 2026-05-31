import 'server-only';

import { featureFlags } from './feature-flags.server';
import {
  type ApprovalCardLabels,
  type TerminologyCopy,
  bensonTerminology,
  displayFilterLabelForMode,
  displayStateForMode,
  getApprovalCardLabelsForMode,
  getTerminologyForMode,
  getTerminologyOverviewGreeting,
  getTerminologyOverviewSubline,
  legacyTerminology,
  useBensonTerminologyMode,
  BENSON_STATE_LABELS,
  LEGACY_STATE_LABELS,
} from './terminology.shared';

export type { ApprovalCardLabels, TerminologyCopy };

export const isBensonTerminology = featureFlags.enableBensonTerminology;

function useBensonMode(): boolean {
  return useBensonTerminologyMode(featureFlags);
}

export function getTerminology(): TerminologyCopy {
  return getTerminologyForMode(useBensonMode());
}

export function displayState(state: string): string {
  return displayStateForMode(state, useBensonMode());
}

export function displayFilterLabel(stateValue: string): string {
  return displayFilterLabelForMode(stateValue, useBensonMode());
}

export function getApprovalCardLabels(): ApprovalCardLabels {
  return getApprovalCardLabelsForMode(useBensonMode());
}

export {
  getTerminologyOverviewGreeting,
  getTerminologyOverviewSubline,
  legacyTerminology,
  bensonTerminology,
  LEGACY_STATE_LABELS,
  BENSON_STATE_LABELS,
};
