import type { CapturedSocialPost } from './types.js';

/** Representative OCR text for acceptance / fixture seeding when Instagram session is unavailable. */
export const BLACK_SPACES_FIXTURE_SLIDES: string[] = [
  `Kansas City Events in Black Spaces\nSaturday\nJazz at the Gem — 7pm — 18th & Vine — Free\nBlack Business Market — City Market — 10am-3pm`,
  `Saturday\nStorytellers Open Mic — Black Archives — 2pm — Free\nSoul Food Sunday Preview — Vine Street — 5pm`,
  `Sunday\nGospel Brunch — Blue Room — 11am — $25\nArt Walk — 18th & Vine — 12pm-4pm — Free`,
  `Sunday\nCommunity Yoga — Bruce R Watkins — 9am — Donation\nVendor Pop-up — 31st & Troost — 1pm`,
  `Friday\nLive Jazz — Green Lady Lounge — 8pm — $10\nNetworking Hour — Plexpod West — 6pm — Free RSVP`,
  `Friday\nFilm Screening — Screenland — 7pm — $12\nPoetry Night — Lucile Bluford Library — 6:30pm — Free`,
  `Weekend note: times subject to change — verify with official venues.\nFollow @jasfoodjourney for updates`,
];

export function buildBlackSpacesFixturePost(profileHandle = 'jasfoodjourney'): CapturedSocialPost {
  const postUrl = 'https://www.instagram.com/p/BLACKSPACES_FIXTURE/';
  return {
    postUrl,
    profileHandle,
    publishedAt: new Date().toISOString(),
    caption: 'Kansas City Events in Black Spaces — weekend roundup',
    postType: 'carousel',
    sourceFingerprint: 'fixture-black-spaces-v1',
    outboundLinks: [],
    ephemeralSource: false,
    slideImageUrls: BLACK_SPACES_FIXTURE_SLIDES.map(
      (_, i) => `https://fixture.local/black-spaces-slide-${i + 1}.png`,
    ),
  };
}

export function fixtureSlideOcrText(slideNumber: number): string {
  return BLACK_SPACES_FIXTURE_SLIDES[slideNumber - 1] ?? '';
}
