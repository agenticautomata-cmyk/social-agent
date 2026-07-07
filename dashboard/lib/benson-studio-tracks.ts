export type StudioTrack = {
  id: string;
  label: string;
  src: string;
};

export const STORAGE_KEY_TRACK = 'benson-studio-track';
export const STORAGE_KEY_SHUFFLE = 'benson-studio-shuffle';
export const STORAGE_KEY_VOLUME = 'benson-studio-volume';
export const DEFAULT_TRACK_ID = 'top-of-the-feed';

/** Retired Voicy clips — clear if still in localStorage. */
export const RETIRED_TRACK_IDS = new Set([
  'dance-for-you',
  'big-ego',
  'king-of-nasty',
  'diva-hey',
  'what-the-helly',
  'oh-no',
  'tiktok-sounds',
]);

export const STUDIO_TRACKS: StudioTrack[] = [
  { id: 'top-of-the-feed', label: 'Top of the feed', src: '/audio/voicy/top-of-the-feed.mp3' },
  { id: 'raw-data-to-concrete', label: 'Raw data to concrete', src: '/audio/voicy/raw-data-to-concrete.mp3' },
  { id: 'kellies-private-sunset', label: "Kellie's private sunset", src: '/audio/voicy/kellies-private-sunset.mp3' },
  { id: 'admit-it-benson', label: 'Admit it Benson', src: '/audio/voicy/admit-it-benson.mp3' },
  { id: 'listen-good', label: 'Listen good', src: '/audio/voicy/listen-good.mp3' },
  { id: 'everything-golden', label: "Everything's golden", src: '/audio/voicy/everything-golden.mp3' },
  { id: 'painting-the-sky', label: 'Painting the sky', src: '/audio/voicy/painting-the-sky.mp3' },
  { id: 'views-go-crazy', label: 'Views go crazy', src: '/audio/voicy/views-go-crazy.mp3' },
];

export const ALL_TRACK_IDS = STUDIO_TRACKS.map((t) => t.id);

const trackById = new Map(STUDIO_TRACKS.map((t) => [t.id, t]));

export function getStudioTrack(id: string): StudioTrack | undefined {
  return trackById.get(id);
}

export function pickRandomTrack(excludeId?: string): StudioTrack {
  const pool =
    excludeId && STUDIO_TRACKS.length > 1
      ? STUDIO_TRACKS.filter((t) => t.id !== excludeId)
      : STUDIO_TRACKS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
