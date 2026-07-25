/**
 * Pure Opportunity Map interaction policy — keeps viewport and Map/List toggle
 * decisions out of Google Maps / React lifecycle side effects so they can be tested.
 */

export type MobileMapView = 'map' | 'list';

export type ViewportFitReason =
  | 'initial_markers'
  | 'filter_change'
  | 'explicit_fit_all'
  | 'marker_select'
  | 'preview_open'
  | 'preview_close'
  | 'venue_switch'
  | 'cluster_click'
  | 'mobile_view_toggle'
  | 'list_highlight'
  | 'url_selection'
  | 'rerender';

export type ViewportPolicyInput = {
  hasCompletedInitialFit: boolean;
  userHasInteracted: boolean;
  reason: ViewportFitReason;
};

/** Auto-fit is allowed only for initial load, filter changes, or explicit Fit all. */
export function shouldAutoFitViewport(input: ViewportPolicyInput): boolean {
  if (input.reason === 'explicit_fit_all') return true;
  if (input.reason === 'filter_change') return true;
  if (input.reason === 'initial_markers' && !input.hasCompletedInitialFit) return true;
  return false;
}

/**
 * After the user has manually zoomed/panned, ignore non-explicit auto-fits.
 * Explicit Fit all always wins. Filter changes may refit once (intentional reset).
 */
export function shouldApplyAutoFit(input: ViewportPolicyInput): boolean {
  if (!shouldAutoFitViewport(input)) return false;
  if (input.reason === 'explicit_fit_all') return true;
  if (input.reason === 'filter_change') return true;
  if (input.userHasInteracted && input.reason === 'initial_markers') return false;
  return true;
}

/** Marker / venue / preview selection must never flip mobile view to list. */
export function mobileViewAfterMarkerSelect(current: MobileMapView): MobileMapView {
  return current === 'list' ? 'list' : 'map';
}

export function mobileViewAfterClusterClick(current: MobileMapView): MobileMapView {
  return 'map';
}

export function mobileViewAfterToggle(next: MobileMapView): MobileMapView {
  return next;
}

/** List-item selection may pan to a marker; it must not force List view permanently. */
export function shouldPanToSelection(source: 'map' | 'list' | 'venue'): boolean {
  return source === 'list';
}

export function shouldRebuildMarkersForSelectionChange(): boolean {
  return false;
}

export function fitReasonsThatMustNotRun(): ViewportFitReason[] {
  return [
    'marker_select',
    'preview_open',
    'preview_close',
    'venue_switch',
    'cluster_click',
    'mobile_view_toggle',
    'list_highlight',
    'url_selection',
    'rerender',
  ];
}

/** Stable fingerprint of filter fields that meaningfully change the visible pin set. */
export function mapFilterFitKey(filters: {
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  coverageFormat: string;
  state: string;
  category: string;
  source: string;
  minScore: string;
  locationStatus: string;
  selectedForFilming: boolean;
}): string {
  return [
    filters.datePreset,
    filters.dateFrom,
    filters.dateTo,
    filters.coverageFormat,
    filters.state,
    filters.category,
    filters.source,
    filters.minScore,
    filters.locationStatus,
    filters.selectedForFilming ? '1' : '0',
  ].join('|');
}

/** Testable viewport/session state for Opportunity Map interaction regressions. */
export type MapSessionState = {
  mobileView: MobileMapView;
  hasCompletedInitialFit: boolean;
  userHasInteracted: boolean;
  zoom: number;
  centerKey: string;
  selectedId: string | null;
  previewOpen: boolean;
  fitCallCount: number;
  lastFitReason: ViewportFitReason | null;
  panCallCount: number;
  filterFitKey: string;
};

export type MapSessionAction =
  | { type: 'markers_loaded'; filterFitKey: string }
  | { type: 'manual_zoom'; zoom: number }
  | { type: 'manual_pan'; centerKey: string }
  | { type: 'select_marker'; id: string }
  | { type: 'select_second_marker'; id: string }
  | { type: 'close_preview' }
  | { type: 'switch_venue_opportunity'; id: string }
  | { type: 'cluster_click' }
  | { type: 'toggle_mobile_view'; next: MobileMapView }
  | { type: 'select_list_item'; id: string }
  | { type: 'return_to_map' }
  | { type: 'explicit_fit_all' }
  | { type: 'filter_change'; filterFitKey: string }
  | { type: 'rerender' }
  | { type: 'url_selection'; id: string };

export function createMapSessionState(overrides?: Partial<MapSessionState>): MapSessionState {
  return {
    mobileView: 'map',
    hasCompletedInitialFit: false,
    userHasInteracted: false,
    zoom: 11,
    centerKey: 'kc',
    selectedId: null,
    previewOpen: false,
    fitCallCount: 0,
    lastFitReason: null,
    panCallCount: 0,
    filterFitKey: '',
    ...overrides,
  };
}

function tryFit(state: MapSessionState, reason: ViewportFitReason): MapSessionState {
  const apply = shouldApplyAutoFit({
    hasCompletedInitialFit: state.hasCompletedInitialFit,
    userHasInteracted: state.userHasInteracted,
    reason,
  });
  if (!apply) return { ...state, lastFitReason: null };
  return {
    ...state,
    hasCompletedInitialFit: true,
    userHasInteracted: reason === 'explicit_fit_all' ? false : state.userHasInteracted,
    fitCallCount: state.fitCallCount + 1,
    lastFitReason: reason,
    zoom: reason === 'explicit_fit_all' || reason === 'filter_change' || reason === 'initial_markers' ? 10 : state.zoom,
    centerKey: 'fitted',
  };
}

/**
 * Pure reducer encoding the production interaction contract for regression tests.
 * Does not call Google Maps — only records whether fitBounds / pan / view changes would run.
 */
export function reduceMapSession(state: MapSessionState, action: MapSessionAction): MapSessionState {
  switch (action.type) {
    case 'markers_loaded': {
      const next = { ...state, filterFitKey: action.filterFitKey };
      return tryFit(next, 'initial_markers');
    }
    case 'manual_zoom':
      return { ...state, userHasInteracted: true, zoom: action.zoom, lastFitReason: null };
    case 'manual_pan':
      return { ...state, userHasInteracted: true, centerKey: action.centerKey, lastFitReason: null };
    case 'select_marker':
    case 'select_second_marker': {
      // Marker select must not fitBounds, must stay on map (unless already in list).
      const blocked = tryFit(state, 'marker_select');
      return {
        ...blocked,
        selectedId: action.id,
        previewOpen: true,
        mobileView: mobileViewAfterMarkerSelect(state.mobileView),
        zoom: state.zoom,
        centerKey: state.centerKey,
        fitCallCount: state.fitCallCount,
        lastFitReason: null,
      };
    }
    case 'close_preview': {
      const blocked = tryFit(state, 'preview_close');
      return {
        ...blocked,
        selectedId: null,
        previewOpen: false,
        zoom: state.zoom,
        centerKey: state.centerKey,
        fitCallCount: state.fitCallCount,
        lastFitReason: null,
        mobileView: state.mobileView,
      };
    }
    case 'switch_venue_opportunity': {
      const blocked = tryFit(state, 'venue_switch');
      return {
        ...blocked,
        selectedId: action.id,
        previewOpen: true,
        zoom: state.zoom,
        centerKey: state.centerKey,
        fitCallCount: state.fitCallCount,
        lastFitReason: null,
        mobileView: mobileViewAfterMarkerSelect(state.mobileView),
      };
    }
    case 'cluster_click': {
      const blocked = tryFit(state, 'cluster_click');
      return {
        ...blocked,
        userHasInteracted: true,
        mobileView: 'map',
        zoom: state.zoom + 2,
        fitCallCount: state.fitCallCount,
        lastFitReason: null,
        selectedId: state.selectedId,
      };
    }
    case 'toggle_mobile_view':
      return {
        ...state,
        mobileView: mobileViewAfterToggle(action.next),
        lastFitReason: null,
      };
    case 'select_list_item': {
      const nextView = state.mobileView;
      return {
        ...state,
        selectedId: action.id,
        previewOpen: true,
        mobileView: nextView,
        panCallCount: shouldPanToSelection('list') ? state.panCallCount + 1 : state.panCallCount,
        zoom: state.zoom,
        lastFitReason: null,
      };
    }
    case 'return_to_map':
      return {
        ...state,
        mobileView: 'map',
        zoom: state.zoom,
        centerKey: state.centerKey,
        lastFitReason: null,
      };
    case 'explicit_fit_all':
      return tryFit({ ...state, userHasInteracted: false }, 'explicit_fit_all');
    case 'filter_change': {
      if (action.filterFitKey === state.filterFitKey) {
        return { ...state, lastFitReason: null };
      }
      return tryFit(
        { ...state, filterFitKey: action.filterFitKey, userHasInteracted: false },
        'filter_change',
      );
    }
    case 'rerender': {
      const blocked = tryFit(state, 'rerender');
      return {
        ...blocked,
        fitCallCount: state.fitCallCount,
        lastFitReason: null,
        zoom: state.zoom,
        centerKey: state.centerKey,
      };
    }
    case 'url_selection': {
      const blocked = tryFit(state, 'url_selection');
      return {
        ...blocked,
        selectedId: action.id,
        previewOpen: true,
        fitCallCount: state.fitCallCount,
        lastFitReason: null,
        zoom: state.zoom,
        centerKey: state.centerKey,
        mobileView: state.mobileView,
      };
    }
    default:
      return state;
  }
}
