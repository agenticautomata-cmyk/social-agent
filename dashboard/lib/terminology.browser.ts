import { featureFlags } from './feature-flags.browser';
import {
  displayFilterLabelForMode,
  displayStateForMode,
  useBensonTerminologyMode,
} from './terminology.shared';

/** Client-safe state/filter labels — uses browser feature flags only. */

function useBensonMode(): boolean {
  return useBensonTerminologyMode(featureFlags);
}

export function displayState(state: string): string {
  return displayStateForMode(state, useBensonMode());
}

export function displayFilterLabel(stateValue: string): string {
  return displayFilterLabelForMode(stateValue, useBensonMode());
}
