export const BENSON_VOICE_OPERATIONS = [
  'weekend_calendar',
  'weekend_list',
  'what_should_kellie_post',
] as const;
export type BensonVoiceOperation = (typeof BENSON_VOICE_OPERATIONS)[number];

export const BENSON_VOICE_ROUTES = {
  weekendCalendar: '/weekend-calendar',
  weekendList: '/weekend-list',
  whatShouldKelliePost: '/what-should-kellie-post',
} as const;

export type VoiceCalendarItem = {
  title: string;
  day: string;
  time: string | null;
  venue: string | null;
  verification: string;
};

export type VoiceWeekendCalendarResponse = {
  operation: 'weekend_calendar';
  count: number;
  ready: boolean;
  items: VoiceCalendarItem[];
  speech: string;
};

export type VoiceWeekendListItem = {
  title: string;
  day: string;
  time: string | null;
  venue: string | null;
};

export type VoiceWeekendListResponse = {
  operation: 'weekend_list';
  count: number;
  items: VoiceWeekendListItem[];
  speech: string;
};

/** Content post recommendations — Command Center `postToday` authority. */
export type VoiceWhatShouldKelliePostItem = {
  contentItemId: string;
  title: string;
  reason: string;
  when: string | null;
  area: string | null;
  homeFilmable: boolean;
  /** Alexa/APL aliases — same shape as weekend visual items. */
  day: string;
  time: string | null;
  venue: string | null;
};

export type VoiceWhatShouldKelliePostResponse = {
  operation: 'what_should_kellie_post';
  count: number;
  items: VoiceWhatShouldKelliePostItem[];
  speech: string;
};

export const WEEKEND_CALENDAR_EMPTY_SPEECH =
  "Benson doesn't have this weekend's calendar ready yet.";

export const WEEKEND_LIST_EMPTY_SPEECH = 'Nothing is on the weekend list yet.';

export const WHAT_SHOULD_KELLIE_POST_EMPTY_SPEECH =
  "I don't have a strong content post for Kellie right now.";

export const VOICE_SPEECH_MAX_CHARS = 480;
export const VOICE_SPOKEN_ITEM_LIMIT = 3;
