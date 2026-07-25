'use client';

import { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { MapLocationGroup, MapOpportunityPin } from '../lib/opportunity-map-types';
import { getGoogleMapsBrowserKey, isGoogleMapsConfigured } from '../lib/opportunity-map-types';
import { shouldApplyAutoFit } from '../lib/opportunity-map-interaction';

const KC_CENTER = { lat: 39.0997, lng: -94.5786 };

/** Survives React remounts (e.g. Next.js search-param Suspense) so manual zoom is not lost. */
const viewportSession = {
  userHasInteracted: false,
  hasCompletedInitialFit: false,
  lastFilterFitKey: null as string | null,
  center: null as { lat: number; lng: number } | null,
  zoom: null as number | null,
};

function groupsFingerprint(groups: MapLocationGroup[]): string {
  return groups
    .map(
      (group) =>
        `${group.groupKey}:${group.latitude.toFixed(5)}:${group.longitude.toFixed(5)}:${group.opportunities.map((pin) => pin.id).join(',')}`,
    )
    .join('|');
}

type OpportunityMapViewProps = {
  groups: MapLocationGroup[];
  selectedId: string | null;
  /** Changes when filters meaningfully change the visible pin set — triggers one refit. */
  filterFitKey: string;
  /** Increment to request an explicit Fit all (ignores user interaction lock). */
  fitAllToken: number;
  onSelectPin: (pin: MapOpportunityPin) => void;
  onMapCenterChange?: (center: { latitude: number; longitude: number }) => void;
  /** When true, pan to the selected pin without changing zoom (list-driven selection). */
  panToSelectedToken?: number;
};

export function OpportunityMapView({
  groups,
  selectedId,
  filterFitKey,
  fitAllToken,
  onSelectPin,
  onMapCenterChange,
  panToSelectedToken = 0,
}: OpportunityMapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const groupsRef = useRef(groups);
  const selectedIdRef = useRef(selectedId);
  const onSelectPinRef = useRef(onSelectPin);
  const onMapCenterChangeRef = useRef(onMapCenterChange);
  const suppressProgrammaticViewportRef = useRef(false);
  const lastGroupsFingerprintRef = useRef<string | null>(null);
  const lastFitAllTokenRef = useRef(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error' | 'unconfigured'>(
    isGoogleMapsConfigured() ? 'loading' : 'unconfigured',
  );
  const [retryToken, setRetryToken] = useState(0);

  groupsRef.current = groups;
  selectedIdRef.current = selectedId;
  onSelectPinRef.current = onSelectPin;
  onMapCenterChangeRef.current = onMapCenterChange;

  function markUserInteraction() {
    viewportSession.userHasInteracted = true;
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (center) {
      viewportSession.center = { lat: center.lat(), lng: center.lng() };
    }
    const zoom = map.getZoom();
    if (zoom != null) viewportSession.zoom = zoom;
  }

  function rememberViewport() {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (center) {
      viewportSession.center = { lat: center.lat(), lng: center.lng() };
    }
    const zoom = map.getZoom();
    if (zoom != null) viewportSession.zoom = zoom;
  }

  function fitVisibleMarkers(reason: 'initial_markers' | 'filter_change' | 'explicit_fit_all') {
    const map = mapRef.current;
    if (!map) return;
    const apply = shouldApplyAutoFit({
      hasCompletedInitialFit: viewportSession.hasCompletedInitialFit,
      userHasInteracted: viewportSession.userHasInteracted,
      reason,
    });
    if (!apply) return;

    const currentGroups = groupsRef.current;
    // Wait for the first non-empty marker set before completing initial fit.
    if (currentGroups.length === 0 && reason === 'initial_markers') return;

    suppressProgrammaticViewportRef.current = true;

    if (currentGroups.length === 0) {
      map.setCenter(KC_CENTER);
      map.setZoom(11);
      if (reason === 'explicit_fit_all') viewportSession.userHasInteracted = false;
      rememberViewport();
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const group of currentGroups) {
      bounds.extend({ lat: group.latitude, lng: group.longitude });
    }
    map.fitBounds(bounds, 48);
    if (currentGroups.length === 1) {
      map.setZoom(Math.min(map.getZoom() ?? 14, 14));
    }
    viewportSession.hasCompletedInitialFit = true;
    if (reason === 'explicit_fit_all') {
      viewportSession.userHasInteracted = false;
    }
    rememberViewport();
  }

  function disposeClusterer() {
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }
    for (const marker of markersRef.current) {
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
    }
    markersRef.current = [];
  }

  useEffect(() => {
    if (!isGoogleMapsConfigured()) {
      setLoadState('unconfigured');
      return;
    }

    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];

    async function initMap() {
      setLoadState('loading');
      try {
        setOptions({
          key: getGoogleMapsBrowserKey(),
          v: 'weekly',
        });
        const mapsLibrary = await importLibrary('maps');
        if (cancelled || !containerRef.current) return;

        const restoredCenter = viewportSession.center ?? KC_CENTER;
        const restoredZoom = viewportSession.zoom ?? 11;

        const map = new mapsLibrary.Map(containerRef.current, {
          center: restoredCenter,
          zoom: restoredZoom,
          mapId: 'opportunity-map',
          fullscreenControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: 'greedy',
          // Uncontrolled viewport — React must not push center/zoom every render.
        });
        mapRef.current = map;

        listeners.push(
          map.addListener('dragstart', markUserInteraction),
          map.addListener('dblclick', markUserInteraction),
          map.addListener('zoom_changed', () => {
            // Programmatic fitBounds/setZoom also fire zoom_changed; ignore while suppressing.
            if (!suppressProgrammaticViewportRef.current) markUserInteraction();
          }),
          map.addListener('idle', () => {
            suppressProgrammaticViewportRef.current = false;
            rememberViewport();
            const center = map.getCenter();
            if (center && onMapCenterChangeRef.current) {
              onMapCenterChangeRef.current({ latitude: center.lat(), longitude: center.lng() });
            }
          }),
        );

        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    }

    void initMap();
    return () => {
      cancelled = true;
      for (const listener of listeners) listener.remove();
      disposeClusterer();
      mapRef.current = null;
    };
  }, [retryToken]);

  // Rebuild markers only when the visible pin set identity changes — never on selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadState !== 'ready') return;

    const fingerprint = groupsFingerprint(groups);
    const groupsChanged = lastGroupsFingerprintRef.current !== fingerprint;
    if (groupsChanged) {
      lastGroupsFingerprintRef.current = fingerprint;
      disposeClusterer();

      const groupKeyToPins = new Map<string, MapOpportunityPin[]>();
      for (const group of groups) {
        groupKeyToPins.set(group.groupKey, group.opportunities);
      }

      for (const group of groups) {
        const marker = new google.maps.Marker({
          map,
          position: { lat: group.latitude, lng: group.longitude },
          title: group.locationName ?? group.opportunities[0]?.title ?? 'Opportunity',
          label: group.opportunities.length > 1 ? String(group.opportunities.length) : undefined,
        });

        marker.addListener('click', (event: google.maps.MapMouseEvent) => {
          event.domEvent?.stopPropagation?.();
          const pins = groupKeyToPins.get(group.groupKey) ?? group.opportunities;
          const primary = pins.find((pin) => pin.id === selectedIdRef.current) ?? pins[0];
          if (primary) onSelectPinRef.current(primary);
        });

        markersRef.current.push(marker);
      }

      clustererRef.current = new MarkerClusterer({
        map,
        markers: markersRef.current,
        onClusterClick: (_event, cluster, mapInstance) => {
          markUserInteraction();
          const bounds = cluster.bounds;
          if (bounds) {
            suppressProgrammaticViewportRef.current = true;
            mapInstance.fitBounds(bounds, 48);
          }
        },
      });
    }

    // Auto-fit policy — independent of selection / preview / mobile view.
    if (!filterFitKey) return;

    if (!viewportSession.hasCompletedInitialFit) {
      if (groups.length > 0) {
        fitVisibleMarkers('initial_markers');
        viewportSession.lastFilterFitKey = filterFitKey;
      }
      return;
    }

    if (viewportSession.lastFilterFitKey !== filterFitKey) {
      viewportSession.lastFilterFitKey = filterFitKey;
      viewportSession.userHasInteracted = false;
      fitVisibleMarkers('filter_change');
    }
    // Intentionally omit selectedId from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, loadState, filterFitKey]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    if (fitAllToken === lastFitAllTokenRef.current) return;
    lastFitAllTokenRef.current = fitAllToken;
    if (fitAllToken > 0) {
      fitVisibleMarkers('explicit_fit_all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAllToken, loadState]);

  // List-driven pan only — does not change zoom and does not fitBounds.
  useEffect(() => {
    if (loadState !== 'ready' || panToSelectedToken <= 0) return;
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const pin = groupsRef.current
      .flatMap((group) => group.opportunities)
      .find((item) => item.id === selectedId);
    if (!pin) return;
    suppressProgrammaticViewportRef.current = true;
    map.panTo({ lat: pin.latitude, lng: pin.longitude });
  }, [panToSelectedToken, selectedId, loadState]);

  if (loadState === 'unconfigured') {
    return (
      <div className="border-2 border-dashed border-paper-edge bg-paper-muted/10 p-8 text-center space-y-3 min-h-[320px] flex flex-col items-center justify-center">
        <p className="font-bold lowercase">map not configured</p>
        <p className="text-sm text-paper-muted max-w-md">
          Set <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> with a website-restricted
          Google Maps JavaScript API key to enable the interactive map.
        </p>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="border-2 border-paper-edge bg-paper p-8 text-center space-y-4 min-h-[320px] flex flex-col items-center justify-center">
        <p className="font-bold lowercase">google maps failed to load</p>
        <p className="text-sm text-paper-muted max-w-md">
          Benson could not initialize the map. Your opportunities list is still available below.
        </p>
        <button
          type="button"
          onClick={() => setRetryToken((value) => value + 1)}
          className="border border-paper-ink px-4 py-2 text-sm hover:bg-paper-muted/10"
        >
          Retry map
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[320px] md:min-h-[480px]">
      {loadState === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/80 text-sm text-paper-muted italic">
          // loading map…
        </div>
      )}
      <div
        ref={containerRef}
        className="h-[320px] md:h-[480px] w-full border-2 border-paper-ink"
        role="application"
        aria-label="Opportunity map"
      />
    </div>
  );
}
