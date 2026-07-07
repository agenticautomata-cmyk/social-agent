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
    category: 'luxury_deal',
    pillar: 'luxury_deals',
  },
  {
    name: 'Zona Rosa Sales & Events',
    listingUrl: 'https://www.zonarosa.com/sales-events',
    category: 'deal',
    pillar: 'luxury_deals',
  },
  {
    name: 'Legends Outlets Deals',
    listingUrl: 'https://www.legendscollectibles.com/sales',
    category: 'deal',
    pillar: 'luxury_deals',
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
    category: 'deal',
    pillar: 'luxury_deals',
  },
  {
    name: 'Saks OFF 5TH Legends',
    listingUrl: 'https://www.saksoff5th.com/stores/us/mo/kansas-city',
    category: 'deal',
    pillar: 'luxury_deals',
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
    listingUrl: 'https://www.shopcorbinpark.com/events',
    category: 'shopping_event',
  },
] as const;
