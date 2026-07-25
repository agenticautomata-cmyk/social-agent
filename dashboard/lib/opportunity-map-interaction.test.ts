import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMapSessionState,
  fitReasonsThatMustNotRun,
  mapFilterFitKey,
  mobileViewAfterClusterClick,
  mobileViewAfterMarkerSelect,
  mobileViewAfterToggle,
  reduceMapSession,
  shouldApplyAutoFit,
  shouldAutoFitViewport,
  shouldPanToSelection,
  shouldRebuildMarkersForSelectionChange,
} from './opportunity-map-interaction.js';

describe('opportunity map viewport policy', () => {
  it('allows auto-fit only for initial markers, filter change, and explicit fit all', () => {
    assert.equal(
      shouldAutoFitViewport({
        hasCompletedInitialFit: false,
        userHasInteracted: false,
        reason: 'initial_markers',
      }),
      true,
    );
    assert.equal(
      shouldAutoFitViewport({
        hasCompletedInitialFit: true,
        userHasInteracted: false,
        reason: 'filter_change',
      }),
      true,
    );
    assert.equal(
      shouldAutoFitViewport({
        hasCompletedInitialFit: true,
        userHasInteracted: true,
        reason: 'explicit_fit_all',
      }),
      true,
    );

    for (const reason of fitReasonsThatMustNotRun()) {
      assert.equal(
        shouldAutoFitViewport({
          hasCompletedInitialFit: true,
          userHasInteracted: false,
          reason,
        }),
        false,
        `expected ${reason} to be blocked`,
      );
    }
  });

  it('does not auto-fit initial markers after manual interaction', () => {
    assert.equal(
      shouldApplyAutoFit({
        hasCompletedInitialFit: false,
        userHasInteracted: true,
        reason: 'initial_markers',
      }),
      false,
    );
  });

  it('never rebuilds markers solely because selection changed', () => {
    assert.equal(shouldRebuildMarkersForSelectionChange(), false);
  });
});

describe('opportunity map mobile view policy', () => {
  it('keeps map view after marker select and cluster click', () => {
    assert.equal(mobileViewAfterMarkerSelect('map'), 'map');
    assert.equal(mobileViewAfterClusterClick('list'), 'map');
  });

  it('only the Map/List toggle changes mobile view', () => {
    assert.equal(mobileViewAfterToggle('list'), 'list');
    assert.equal(mobileViewAfterToggle('map'), 'map');
    assert.equal(mobileViewAfterMarkerSelect('map'), 'map');
  });

  it('pans only for list-driven selection', () => {
    assert.equal(shouldPanToSelection('list'), true);
    assert.equal(shouldPanToSelection('map'), false);
    assert.equal(shouldPanToSelection('venue'), false);
  });
});

describe('opportunity map interaction regressions', () => {
  it('manual zoom remains after selecting a marker', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 15 });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'select_marker', id: 'opp-1' });
    assert.equal(state.zoom, 15);
    assert.equal(state.fitCallCount, before);
    assert.equal(state.mobileView, 'map');
    assert.equal(state.previewOpen, true);
  });

  it('manual zoom remains after closing the preview', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 16 });
    state = reduceMapSession(state, { type: 'select_marker', id: 'opp-1' });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'close_preview' });
    assert.equal(state.zoom, 16);
    assert.equal(state.previewOpen, false);
    assert.equal(state.fitCallCount, before);
  });

  it('selecting a second marker does not reset zoom or switch to List view', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 14 });
    state = reduceMapSession(state, { type: 'select_marker', id: 'opp-1' });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'select_second_marker', id: 'opp-2' });
    assert.equal(state.zoom, 14);
    assert.equal(state.selectedId, 'opp-2');
    assert.equal(state.mobileView, 'map');
    assert.equal(state.fitCallCount, before);
  });

  it('switching opportunities at one venue does not reset the viewport', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 13 });
    state = reduceMapSession(state, { type: 'manual_pan', centerKey: 'venue-a' });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'switch_venue_opportunity', id: 'opp-b' });
    assert.equal(state.zoom, 13);
    assert.equal(state.centerKey, 'venue-a');
    assert.equal(state.fitCallCount, before);
    assert.equal(state.mobileView, 'map');
  });

  it('cluster clicks remain in Map view and do not invoke fit-all', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'cluster_click' });
    assert.equal(state.mobileView, 'map');
    assert.equal(state.fitCallCount, before);
    assert.equal(state.lastFitReason, null);
  });

  it('marker selection and preview open/close do not invoke fitBounds', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    const afterInitial = state.fitCallCount;
    state = reduceMapSession(state, { type: 'select_marker', id: 'opp-1' });
    state = reduceMapSession(state, { type: 'close_preview' });
    state = reduceMapSession(state, { type: 'select_marker', id: 'opp-2' });
    assert.equal(state.fitCallCount, afterInitial);
  });

  it('only the Map/List toggle changes the mobile view', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'select_marker', id: 'opp-1' });
    assert.equal(state.mobileView, 'map');
    state = reduceMapSession(state, { type: 'cluster_click' });
    assert.equal(state.mobileView, 'map');
    state = reduceMapSession(state, { type: 'toggle_mobile_view', next: 'list' });
    assert.equal(state.mobileView, 'list');
    state = reduceMapSession(state, { type: 'select_list_item', id: 'opp-9' });
    assert.equal(state.mobileView, 'list');
    state = reduceMapSession(state, { type: 'toggle_mobile_view', next: 'map' });
    assert.equal(state.mobileView, 'map');
  });

  it('explicit Fit all correctly refits visible markers', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 17 });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'explicit_fit_all' });
    assert.equal(state.fitCallCount, before + 1);
    assert.equal(state.lastFitReason, 'explicit_fit_all');
    assert.equal(state.centerKey, 'fitted');
  });

  it('a meaningful filter change can refit once without creating an update loop', () => {
    let state = createMapSessionState();
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'next_30_days|...' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 15 });
    const before = state.fitCallCount;
    state = reduceMapSession(state, { type: 'filter_change', filterFitKey: 'this_weekend|...' });
    assert.equal(state.fitCallCount, before + 1);
    assert.equal(state.lastFitReason, 'filter_change');
    // Same key again must not refit (no loop).
    state = reduceMapSession(state, { type: 'filter_change', filterFitKey: 'this_weekend|...' });
    assert.equal(state.fitCallCount, before + 1);
    state = reduceMapSession(state, { type: 'rerender' });
    assert.equal(state.fitCallCount, before + 1);
  });

  it('desktop map/list synchronization still works', () => {
    let state = createMapSessionState({ mobileView: 'map' });
    state = reduceMapSession(state, { type: 'markers_loaded', filterFitKey: 'a' });
    state = reduceMapSession(state, { type: 'manual_zoom', zoom: 12 });
    state = reduceMapSession(state, { type: 'select_list_item', id: 'opp-list' });
    assert.equal(state.selectedId, 'opp-list');
    assert.equal(state.panCallCount, 1);
    assert.equal(state.zoom, 12);
    // Returning to map preserves viewport.
    state = reduceMapSession(state, { type: 'toggle_mobile_view', next: 'list' });
    state = reduceMapSession(state, { type: 'return_to_map' });
    assert.equal(state.mobileView, 'map');
    assert.equal(state.zoom, 12);
  });

  it('builds a stable filter fit key that ignores sort-only changes when omitted', () => {
    const keyA = mapFilterFitKey({
      datePreset: 'next_30_days',
      dateFrom: '',
      dateTo: '',
      coverageFormat: '',
      state: '',
      category: '',
      source: '',
      minScore: '',
      locationStatus: 'resolved_verified',
      selectedForFilming: false,
    });
    const keyB = mapFilterFitKey({
      datePreset: 'this_weekend',
      dateFrom: '',
      dateTo: '',
      coverageFormat: '',
      state: '',
      category: '',
      source: '',
      minScore: '',
      locationStatus: 'resolved_verified',
      selectedForFilming: false,
    });
    assert.notEqual(keyA, keyB);
  });
});
