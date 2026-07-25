/** NowInStock-style deal pages — polled every 6h; new rows = newly spotted offers. */
export const KC_DISCOUNT_WATCH_SOURCES = [
  {
    name: 'Loews KC Special Offers',
    listingUrl: 'https://www.loewshotels.com/kansas-city-hotel/offers',
    category: 'hotel_package',
    pillar: 'luxury_deals',
  },
  {
    name: 'The Raphael Hotel Offers',
    listingUrl: 'https://www.raphaelhotels.com/special-offers',
    category: 'hotel_package',
    pillar: 'luxury_deals',
  },
  {
    name: 'Hotel Kansas City Offers',
    listingUrl: 'https://www.hotelkansascity.com/offers',
    category: 'hotel_package',
    pillar: 'luxury_deals',
  },
  {
    name: 'Crossroads Hotel Offers',
    listingUrl: 'https://www.crossroadshotelkc.com/offers',
    category: 'hotel_package',
    pillar: 'luxury_deals',
  },
  {
    name: '21c Museum Hotel KC Offers',
    listingUrl: 'https://www.21cmuseumhotels.com/kansas-city/offers',
    category: 'hotel_package',
    pillar: 'luxury_deals',
  },
  {
    name: 'The Elms Spa Specials',
    listingUrl: 'https://www.elmsresort.com/spa/specials',
    category: 'spa_package',
    pillar: 'luxury_deals',
  },
  {
    name: 'Country Club Plaza Sales',
    listingUrl: 'https://www.countryclubplaza.com/sales',
    category: 'retail_sale',
    pillar: 'holiday_deals',
  },
  {
    name: 'Zona Rosa Sales & Events',
    listingUrl: 'https://www.zonarosa.com/events',
    category: 'retail_sale',
    pillar: 'holiday_deals',
  },
  {
    name: 'Tanger Kansas City at Legends Deals',
    listingUrl: 'https://www.tanger.com/kansascity/deals',
    category: 'retail_sale',
    pillar: 'holiday_deals',
  },
  {
    name: 'Legends Hot Deals',
    listingUrl: 'https://legendsshopping.com/hot_deals_category/specialty/',
    category: 'holiday_sale',
    pillar: 'holiday_deals',
  },
  {
    name: 'Crown Center Events & Shopping',
    listingUrl: 'https://www.crowncenter.com/events',
    category: 'seasonal_sale',
    pillar: 'holiday_deals',
  },
  {
    name: 'Savers Weekly Specials',
    listingUrl: 'https://www.savers.com/weekly-specials',
    category: 'thrift_sale',
    pillar: 'major_discounts',
  },
  {
    name: 'Hy-Vee Weekly Deals',
    listingUrl: 'https://www.hy-vee.com/deals/',
    category: 'grocery_deal',
    pillar: 'major_discounts',
  },
  {
    name: 'Price Chopper Savings',
    listingUrl: 'https://www.pricechopper.com/savings/',
    category: 'grocery_deal',
    pillar: 'major_discounts',
  },
  {
    name: 'Target Clearance',
    listingUrl: 'https://www.target.com/c/clearance/-/N-5q0ga',
    category: 'retail_sale',
    pillar: 'major_discounts',
  },
  {
    name: "My Best Friend's Closet Events",
    listingUrl: 'https://www.mybfclosetkc.com/events',
    category: 'consignment_event',
    pillar: 'luxury_deals',
  },
  {
    name: 'Style Encore Overland Park',
    listingUrl: 'https://style-encore.com/locations/overland-park-ks/',
    category: 'luxury_resale',
    pillar: 'luxury_deals',
  },
  {
    name: 'Do Good Co. Events',
    listingUrl: 'https://www.dogoodkc.org/events',
    category: 'consignment_event',
    pillar: 'luxury_deals',
  },
  {
    name: 'Nordstrom Rack Legends',
    listingUrl: 'https://www.nordstromrack.com/stores/legends-outlets-kansas-city',
    category: 'retail_sale',
    pillar: 'holiday_deals',
  },
  {
    name: 'Saks OFF 5TH Legends',
    listingUrl: 'https://www.saksoff5th.com/stores/us/mo/kansas-city',
    category: 'retail_sale',
    pillar: 'holiday_deals',
  },
] as const;

export const LUXURY_RESALE_EVENT_SCRAPES = [
  {
    name: 'West Bottoms Warehouse Sale',
    listingUrl: 'https://www.westbottoms.com/events',
    category: 'warehouse_sale',
  },
  {
    name: 'Corbin Park Retail Events',
    listingUrl: 'https://www.shopcorbin.com/events',
    category: 'shopping_event',
  },
] as const;

/** RSS feeds for local sale/deal journalism — scanned as metro_deals sources. */
export const KC_METRO_DEALS_RSS_SOURCES = [
  {
    name: 'Pitch KC Deals RSS',
    feedUrl: 'https://www.thepitchkc.com/tag/deals/feed/',
    strictDealFilter: false,
    maxAgeDays: 90,
  },
  {
    name: 'Pitch KC Sales RSS',
    feedUrl: 'https://www.thepitchkc.com/tag/sales/feed/',
    strictDealFilter: false,
    maxAgeDays: 90,
  },
  {
    name: 'Johnson County Post Deals',
    feedUrl: 'https://johnsoncountypost.com/feed/',
    strictDealFilter: false,
    maxAgeDays: 60,
    excludeTitlePattern: 'candidate|election|school board|housing affordability|newsletter|paywall',
  },
  {
    name: 'FOX4 KC Sale Stories',
    feedUrl: 'https://www.fox4kc.com/news/local-news/feed/',
    strictDealFilter: true,
    maxAgeDays: 45,
  },
  {
    name: 'KSHB Local Sale Stories',
    feedUrl: 'https://www.kshb.com/news/local-news.rss',
    strictDealFilter: true,
    maxAgeDays: 45,
  },
] as const;
