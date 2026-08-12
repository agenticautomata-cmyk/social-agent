/**
 * Controlled fixture: simulate a ~30-source scrape refresh wave without OpenAI calls.
 * Counts how many web_search reservations would be allowed under guardrails.
 *
 *   pnpm exec tsx src/scripts/smoke-scrape-websearch-guardrails.ts
 */
import {
  SCRAPE_WEB_SEARCH_PER_REFRESH_CAP,
  beginScrapeRefreshWave,
  confirmScrapeWebSearchReserved,
  endScrapeRefreshWave,
  getScrapeRefreshWaveSearchCount,
  reserveScrapeWebSearch,
  resetScrapeWebSearchGuardrailsForTests,
} from '../ask-benson/scrape-websearch-guardrails.js';

/** Sample URLs from the Aug 11 audit window (representative scrape sources). */
const FIXTURE_LISTING_URLS = [
  'https://www.kingscollective.com/',
  'https://www.kcmo.gov/Home/Components/News',
  'https://www.axios.com/local/kansas-city',
  'https://www.raphaelhotels.com/specials',
  'https://do816.com/events/food-drink',
  'https://www.fifa.com/en/tournaments/mens/worldcup/canada',
  'https://www.unation.com/event/fifa-fan-festival',
  'https://www.thefarmhousekc.com/menus',
  'https://www.savers.com/weekly-specials',
  'https://do816.com/events',
  'https://do816.com/venues/ameristar/events',
  'https://www.axs.com/events/1185094/hadestown',
  'https://www.nordstromrack.com/stores/location',
  'https://www.ubereats.com/store/toastique',
  'https://www.anthropologie.com/en-ca/stores',
  'https://www.fifa.com/en/tournaments/mens/worldcup/canada',
  'https://www.corner.inc/place/1485694',
  'https://wanderlog.com/place/details/1485694',
  'https://www.loewshotels.com/kansas-city',
  'https://www.pricechopper.com/weekly-ad',
  'https://www.do816.com/venues/hollywood-casino',
  'https://www.crossroadshotel.com/offers',
  'https://www.visitkc.com/events',
  'https://www.metrokc.org/events',
  'https://www.planetcomicon.com/',
  'https://www.kauffman.org/events',
  'https://www.sportingkc.com/events',
  'https://www.unionstation.org/events',
  'https://www.estatesales.net/Kansas-City-MO',
  'https://www.liquidation.com/location/kansas-city',
];

function main() {
  resetScrapeWebSearchGuardrailsForTests();
  beginScrapeRefreshWave('smoke-fixture');

  let allowed = 0;
  let dedupeBlocked = 0;
  let capBlocked = 0;
  const allowedUrls: string[] = [];

  for (const url of FIXTURE_LISTING_URLS) {
    const reservation = reserveScrapeWebSearch({ listingUrl: url, kind: 'page_fallback' });
    if (reservation.allowed) {
      allowed += 1;
      allowedUrls.push(url);
      confirmScrapeWebSearchReserved(reservation.dedupeKey, reservation.refreshWaveId);
    } else if (reservation.reason === 'listing_url_dedupe') {
      dedupeBlocked += 1;
    } else if (reservation.reason === 'refresh_cap_exceeded') {
      capBlocked += 1;
    }
  }

  const summary = {
    fixtureSources: FIXTURE_LISTING_URLS.length,
    cap: SCRAPE_WEB_SEARCH_PER_REFRESH_CAP,
    allowed,
    dedupeBlocked,
    capBlocked,
    waveSearchCount: getScrapeRefreshWaveSearchCount(),
    auditWindowUnmitigated: 31,
    expectedAfterFix: allowed,
    paidOpenAiCalls: 0,
    allowedSample: allowedUrls.slice(0, 5),
  };

  console.log(JSON.stringify(summary, null, 2));
  endScrapeRefreshWave();
}

main();
