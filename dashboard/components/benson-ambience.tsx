'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSampleAudioEngine } from '../lib/benson-sample-audio';
import {
  DEFAULT_TRACK_ID,
  getStudioTrack,
  RETIRED_TRACK_IDS,
  STUDIO_TRACKS,
  STORAGE_KEY_SHUFFLE,
  STORAGE_KEY_TRACK,
  STORAGE_KEY_VOLUME,
} from '../lib/benson-studio-tracks';
import { defaultStudioBeatAnchor } from '../lib/use-long-press-drag';
import { useBensonStudio } from '../lib/benson-studio-context';
import { BensonDancer } from './benson-dancer';
import { FloatingDragShell } from './floating-drag-shell';

const STORAGE_KEY_PLAYING = 'benson-ambience-enabled';
const STORAGE_KEY_WIDGET_HIDDEN = 'benson-ambience-widget-hidden';
const DEFAULT_VOLUME = 0.7;

export function BensonAmbience() {
  const engineRef = useRef<ReturnType<typeof createSampleAudioEngine> | null>(null);
  const {
    musicPlaying,
    setMusicPlaying,
    shuffleEnabled,
    setShuffleEnabled,
    activeTrackLabel,
    setActiveTrackId,
    setActiveTrackLabel,
  } = useBensonStudio();
  const [mounted, setMounted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [lockedTrackId, setLockedTrackId] = useState(DEFAULT_TRACK_ID);
  const [hint, setHint] = useState<string | null>(null);
  const [widgetHidden, setWidgetHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedShuffle = localStorage.getItem(STORAGE_KEY_SHUFFLE);
      if (savedShuffle === '0') setShuffleEnabled(false);
      const savedTrack = localStorage.getItem(STORAGE_KEY_TRACK);
      if (savedTrack && RETIRED_TRACK_IDS.has(savedTrack)) {
        localStorage.removeItem(STORAGE_KEY_TRACK);
      } else if (savedTrack && getStudioTrack(savedTrack)) {
        setLockedTrackId(savedTrack);
        const t = getStudioTrack(savedTrack)!;
        setActiveTrackId(savedTrack);
        setActiveTrackLabel(t.label);
      }
      const savedVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (savedVol) setVolume(Number(savedVol));
      if (localStorage.getItem(STORAGE_KEY_PLAYING) === '1') {
        setHint('Tap for the beat');
      }
      if (localStorage.getItem(STORAGE_KEY_WIDGET_HIDDEN) === '1') {
        setWidgetHidden(true);
      }
    } catch {
      /* ignore */
    }
  }, [setActiveTrackId, setActiveTrackLabel, setShuffleEnabled]);

  useEffect(() => {
    engineRef.current ??= createSampleAudioEngine();
    const off = engineRef.current.onTrackChange((track) => {
      setActiveTrackId(track.id);
      setActiveTrackLabel(track.label);
    });
    return () => {
      off();
      engineRef.current?.stop();
    };
  }, [setActiveTrackId, setActiveTrackLabel]);

  useEffect(() => {
    if (musicPlaying) {
      document.documentElement.dataset.bensonBeat = 'on';
    } else {
      delete document.documentElement.dataset.bensonBeat;
    }
  }, [musicPlaying]);

  const startMusic = useCallback(async () => {
    engineRef.current ??= createSampleAudioEngine();
    try {
      engineRef.current.setVolume(volume);
      engineRef.current.setShuffle(shuffleEnabled);
      await engineRef.current.play({
        shuffle: shuffleEnabled,
        trackId: lockedTrackId,
      });
      setMusicPlaying(true);
      setHint(null);
      try {
        localStorage.setItem(STORAGE_KEY_PLAYING, '1');
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.warn('[benson-ambience] audio start failed:', err);
      setHint('Could not start audio — try again');
    }
  }, [lockedTrackId, setMusicPlaying, shuffleEnabled, volume]);

  const stopMusic = useCallback(() => {
    engineRef.current?.stop();
    setMusicPlaying(false);
    try {
      localStorage.setItem(STORAGE_KEY_PLAYING, '0');
    } catch {
      /* ignore */
    }
  }, [setMusicPlaying]);

  const togglePlay = useCallback(() => {
    if (musicPlaying) stopMusic();
    else void startMusic();
  }, [musicPlaying, startMusic, stopMusic]);

  const toggleShuffle = useCallback(() => {
    const next = !shuffleEnabled;
    setShuffleEnabled(next);
    engineRef.current?.setShuffle(next);
    try {
      localStorage.setItem(STORAGE_KEY_SHUFFLE, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (musicPlaying && engineRef.current) {
      void engineRef.current.play({ shuffle: next, trackId: lockedTrackId });
    }
  }, [lockedTrackId, musicPlaying, setShuffleEnabled, shuffleEnabled]);

  const selectTrack = useCallback(
    (id: string) => {
      setLockedTrackId(id);
      engineRef.current?.setTrack(id);
      const track = getStudioTrack(id);
      if (track) {
        setActiveTrackId(id);
        setActiveTrackLabel(track.label);
      }
      try {
        localStorage.setItem(STORAGE_KEY_TRACK, id);
      } catch {
        /* ignore */
      }
      if (musicPlaying && !shuffleEnabled && engineRef.current) {
        void engineRef.current.play({ shuffle: false, trackId: id });
      }
    },
    [musicPlaying, setActiveTrackId, setActiveTrackLabel, shuffleEnabled],
  );

  const onVolumeChange = useCallback((v: number) => {
    setVolume(v);
    engineRef.current?.setVolume(v);
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(v));
    } catch {
      /* ignore */
    }
  }, []);

  const skipNext = useCallback(() => {
    void engineRef.current?.skipNext();
  }, []);

  const hideWidget = useCallback(() => {
    setWidgetHidden(true);
    setPanelOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY_WIDGET_HIDDEN, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const showWidget = useCallback(() => {
    setWidgetHidden(false);
    try {
      localStorage.setItem(STORAGE_KEY_WIDGET_HIDDEN, '0');
    } catch {
      /* ignore */
    }
  }, []);

  if (!mounted) return null;

  return (
    <>
      <div className="studio-backdrop" aria-hidden />
      <div
        className="studio-orb w-[420px] h-[420px] -top-32 -right-32 bg-glow-violet/30"
        aria-hidden
      />
      <div
        className="studio-orb w-[320px] h-[320px] bottom-0 -left-24 bg-glow-pink/20"
        style={{ animationDelay: '2s' }}
        aria-hidden
      />

      <FloatingDragShell
        storageKey="benson-floating-studio-anchor"
        defaultAnchor={defaultStudioBeatAnchor}
        label="Studio beat controls"
        fallbackClassName="fixed bottom-24 right-4 md:bottom-28 md:right-6"
        zIndex={10000}
        swipeToDismiss
        onSwipeDismiss={hideWidget}
        hidden={widgetHidden}
      >
        {panelOpen && (
          <div className="w-[min(100vw-2rem,18rem)] rounded-2xl border border-white/15 bg-black/70 p-3 backdrop-blur-xl shadow-glow space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-paper-ink">Studio beat</span>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="text-paper-muted hover:text-paper-ink text-sm px-2"
                aria-label="Close studio panel"
              >
                ×
              </button>
            </div>

            <label className="flex items-center justify-between gap-2 text-xs">
              <span className="text-paper-muted">Random</span>
              <button
                type="button"
                role="switch"
                aria-checked={shuffleEnabled}
                onClick={toggleShuffle}
                className={`relative h-6 w-11 rounded-full transition ${shuffleEnabled ? 'bg-accent' : 'bg-white/20'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${shuffleEnabled ? 'left-[22px]' : 'left-0.5'}`}
                />
              </button>
            </label>

            {!shuffleEnabled && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {STUDIO_TRACKS.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => selectTrack(track.id)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition ${
                      lockedTrackId === track.id
                        ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                        : 'hover:bg-white/10 text-paper-muted'
                    }`}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-paper-muted">
              <span className="shrink-0">Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="flex-1 accent-accent"
              />
            </label>

            {musicPlaying && shuffleEnabled && (
              <button
                type="button"
                onClick={skipNext}
                className="w-full text-xs py-1.5 rounded-lg border border-white/15 hover:bg-white/10"
              >
                Next clip ↻
              </button>
            )}
          </div>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            className="absolute -left-1 -top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-[11px] text-paper-muted backdrop-blur-md hover:bg-black/85"
            aria-expanded={panelOpen}
            aria-label="Studio beat settings"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={musicPlaying ? 'Turn off studio beat' : 'Turn on studio beat'}
            aria-pressed={musicPlaying}
            title={activeTrackLabel}
            className="flex h-[76px] w-[76px] items-end justify-center overflow-visible rounded-full bg-gradient-to-br from-glow-violet/90 to-glow-pink/90 pb-1 shadow-glow ring-2 ring-white/20 transition hover:scale-105"
          >
            <BensonDancer size={52} variant="full" forceDance={musicPlaying} />
          </button>
          {hint && !musicPlaying ? (
            <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-accent">
              {hint}
            </span>
          ) : null}
        </div>
      </FloatingDragShell>

      {widgetHidden && (
        <button
          type="button"
          onClick={showWidget}
          aria-label="Show studio beat player"
          title={musicPlaying ? `Beat playing — ${activeTrackLabel}` : 'Show studio beat'}
          className="fixed right-0 z-[10000] flex min-h-[44px] items-center gap-1.5 rounded-l-full border border-white/15 border-r-0 bg-black/75 py-2 pl-2.5 pr-3 text-xs font-semibold text-paper-soft shadow-glow backdrop-blur-md transition hover:bg-black/90"
          style={{ bottom: 'calc(var(--studio-tab-bar-height, 4rem) + 5.5rem)' }}
        >
          <span className="text-base leading-none" aria-hidden>
            ♪
          </span>
          <span className="hidden sm:inline">Beat</span>
          {musicPlaying ? (
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden />
          ) : null}
        </button>
      )}
    </>
  );
}
