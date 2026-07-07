import {
  DEFAULT_TRACK_ID,
  getStudioTrack,
  pickRandomTrack,
  type StudioTrack,
} from './benson-studio-tracks';

const FADE_MS = 200;

export type SampleAudioEngine = {
  playing: boolean;
  shuffle: boolean;
  trackId: string;
  play: (opts?: { shuffle?: boolean; trackId?: string }) => Promise<void>;
  stop: () => void;
  skipNext: () => Promise<void>;
  setShuffle: (shuffle: boolean) => void;
  setTrack: (trackId: string) => void;
  setVolume: (v: number) => void;
  onTrackChange: (cb: (track: StudioTrack) => void) => () => void;
};

export function createSampleAudioEngine(): SampleAudioEngine {
  let audio: HTMLAudioElement | null = null;
  let playing = false;
  let shuffle = true;
  let trackId = DEFAULT_TRACK_ID;
  let targetVolume = 0.7;
  let fadeTimer: ReturnType<typeof setInterval> | null = null;
  let trackListeners: Array<(track: StudioTrack) => void> = [];

  function notifyTrackChange() {
    const track = getStudioTrack(trackId);
    if (track) trackListeners.forEach((cb) => cb(track));
  }

  function ensureAudio(): HTMLAudioElement {
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('ended', () => {
        if (playing && shuffle) {
          void advanceRandom();
        }
      });
    }
    return audio;
  }

  function clearFade() {
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function rampVolume(el: HTMLAudioElement, to: number, ms: number): Promise<void> {
    clearFade();
    const from = el.volume;
    const steps = Math.max(4, Math.round(ms / 25));
    const delta = (to - from) / steps;
    let step = 0;
    return new Promise((resolve) => {
      fadeTimer = setInterval(() => {
        step += 1;
        el.volume = Math.max(0, Math.min(1, from + delta * step));
        if (step >= steps) {
          clearFade();
          el.volume = to;
          resolve();
        }
      }, ms / steps);
    });
  }

  async function loadAndPlay(id: string, loop: boolean) {
    const track = getStudioTrack(id);
    if (!track) throw new Error(`Unknown track: ${id}`);

    const el = ensureAudio();
    if (el.src !== new URL(track.src, window.location.origin).href) {
      el.src = track.src;
    }
    el.loop = loop;
    el.volume = 0;
    trackId = id;
    notifyTrackChange();
    await el.play();
    await rampVolume(el, targetVolume, FADE_MS);
  }

  async function advanceRandom() {
    if (!playing) return;
    const el = ensureAudio();
    await rampVolume(el, 0, FADE_MS);
    el.pause();
    const next = pickRandomTrack(trackId);
    await loadAndPlay(next.id, false);
  }

  return {
    get playing() {
      return playing;
    },
    get shuffle() {
      return shuffle;
    },
    get trackId() {
      return trackId;
    },
    onTrackChange(cb) {
      trackListeners.push(cb);
      return () => {
        trackListeners = trackListeners.filter((l) => l !== cb);
      };
    },
    async play(opts) {
      if (opts?.shuffle !== undefined) shuffle = opts.shuffle;
      if (opts?.trackId) trackId = opts.trackId;

      playing = true;
      const id = shuffle ? pickRandomTrack().id : trackId;
      await loadAndPlay(id, !shuffle);
    },
    stop() {
      playing = false;
      clearFade();
      if (audio) {
        const el = audio;
        void rampVolume(el, 0, FADE_MS).then(() => {
          el.pause();
          el.currentTime = 0;
        });
      }
    },
    async skipNext() {
      if (!playing) return;
      if (shuffle) {
        await advanceRandom();
      } else {
        const el = ensureAudio();
        el.currentTime = 0;
        await el.play();
      }
    },
    setShuffle(next) {
      shuffle = next;
      if (playing && audio) {
        audio.loop = !shuffle;
      }
    },
    setTrack(id) {
      trackId = id;
      notifyTrackChange();
    },
    setVolume(v) {
      targetVolume = Math.max(0, Math.min(1, v));
      if (audio && playing) audio.volume = targetVolume;
    },
  };
}
