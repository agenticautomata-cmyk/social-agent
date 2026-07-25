import type { SourceType } from '../schema.js';

export type SourceMeta = {
  category: string;
  pillar: string;
};

/** Static metadata for existing configured source types (no new sources). */
export const SOURCE_TYPE_META: Record<SourceType, SourceMeta> = {
  reddit: { category: 'community', pillar: 'local_discussion' },
  visitkc: { category: 'tourism', pillar: 'events' },
  crossroads: { category: 'arts', pillar: 'events' },
  union_station: { category: 'venue', pillar: 'events' },
  kauffman: { category: 'performing_arts', pillar: 'events' },
  sporting_kc: { category: 'sports', pillar: 'events' },
  restaurant_week: { category: 'dining', pillar: 'restaurants' },
  pitch_dining: { category: 'dining', pillar: 'restaurants' },
  kc_parks: { category: 'free_events', pillar: 'outdoors' },
  kc_library: { category: 'free_events', pillar: 'community' },
  first_fridays: { category: 'free_events', pillar: 'arts' },
  estate_sales_net: { category: 'shopping', pillar: 'estate_sales' },
  estate_sales_org: { category: 'shopping', pillar: 'estate_sales' },
  brown_button_estates: { category: 'shopping', pillar: 'estate_sales' },
  pitch_openings: { category: 'business', pillar: 'openings' },
  inkc_openings: { category: 'business', pillar: 'openings' },
  visitkc_openings: { category: 'business', pillar: 'openings' },
  metro_openings: { category: 'business', pillar: 'openings' },
  metro_deals: { category: 'shopping', pillar: 'deals' },
  pitch_closings: { category: 'business', pillar: 'closings' },
  inkc_closings: { category: 'business', pillar: 'closings' },
  liquidation_sales_net: { category: 'shopping', pillar: 'deals' },
  consignment_kc: { category: 'shopping', pillar: 'retail' },
  visitkc_luxury: { category: 'luxury', pillar: 'experiences' },
  visitkc_romantic_weekends: { category: 'luxury', pillar: 'date_night' },
  visitkc_luxury_experiences: { category: 'luxury', pillar: 'experiences' },
  kc_hotel_packages: { category: 'luxury', pillar: 'travel' },
  casino_hotel_packages: { category: 'luxury', pillar: 'travel' },
  spa_packages_kc: { category: 'luxury', pillar: 'wellness' },
  rooftop_bars_kc: { category: 'dining', pillar: 'nightlife' },
  wine_tasting_kc: { category: 'dining', pillar: 'experiences' },
  chef_tasting_menus: { category: 'dining', pillar: 'restaurants' },
  kauffman_date_nights: { category: 'luxury', pillar: 'date_night' },
  romantic_restaurant_events: { category: 'dining', pillar: 'date_night' },
  big_slick_kc: { category: 'charity', pillar: 'celebrity' },
  childrens_mercy_events: { category: 'charity', pillar: 'nonprofit' },
  chiefs_charity_events: { category: 'charity', pillar: 'celebrity' },
  royals_charity_events: { category: 'charity', pillar: 'celebrity' },
  sporting_kc_charity: { category: 'charity', pillar: 'sports' },
  kc_current_charity: { category: 'charity', pillar: 'nonprofit' },
  kauffman_charity_galas: { category: 'charity', pillar: 'galas' },
  visitkc_charity_events: { category: 'charity', pillar: 'nonprofit' },
  kc_nonprofit_galas: { category: 'charity', pillar: 'galas' },
  kc_entertainment_charity: { category: 'charity', pillar: 'events' },
  country_club_plaza: { category: 'retail', pillar: 'shopping' },
  crown_center_retail: { category: 'retail', pillar: 'shopping' },
  corbin_park: { category: 'retail', pillar: 'shopping' },
  prairiefire_retail: { category: 'retail', pillar: 'shopping' },
  town_center_plaza: { category: 'retail', pillar: 'shopping' },
  zona_rosa: { category: 'retail', pillar: 'shopping' },
  legends_outlets: { category: 'retail', pillar: 'shopping' },
  strawberry_swing: { category: 'retail', pillar: 'pop_ups' },
  west_bottoms_vintage: { category: 'retail', pillar: 'shopping' },
  river_market_vendors: { category: 'retail', pillar: 'markets' },
  made_in_kc: { category: 'retail', pillar: 'local_makers' },
  cardshows_io: { category: 'events', pillar: 'pop_ups' },
  collect_a_con: { category: 'events', pillar: 'pop_ups' },
  planet_comicon: { category: 'events', pillar: 'pop_ups' },
  rss: { category: 'feed', pillar: 'general' },
  ics: { category: 'calendar', pillar: 'events' },
  event_api: { category: 'api', pillar: 'events' },
  google_maps: { category: 'places', pillar: 'local' },
  manual: { category: 'manual', pillar: 'general' },
  scrape: { category: 'scrape', pillar: 'general' },
};

export function resolveFeedUrl(config: Record<string, unknown>, type: SourceType): string | null {
  if (typeof config.listingUrl === 'string') return config.listingUrl;
  if (typeof config.feedUrl === 'string') return config.feedUrl;
  if (typeof config.url === 'string') return config.url;
  if (typeof config.directoryUrl === 'string') return config.directoryUrl;
  if (type === 'reddit' && typeof config.subreddit === 'string') {
    return `https://www.reddit.com/r/${config.subreddit}/.rss`;
  }
  return null;
}
