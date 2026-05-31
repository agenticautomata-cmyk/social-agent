import {
  entriesFromDirectory,
  type ShoppingRetailEntry,
  type NormalizedShoppingRetailItem,
} from './shopping-retail-shared.js';

type SourceConfig = { entries?: ShoppingRetailEntry[]; feedUrl?: string; pageUrl?: string };

function parseConfig(raw: unknown): SourceConfig {
  return (raw ?? {}) as SourceConfig;
}

function loadDirectory(
  prefix: string,
  defaults: ShoppingRetailEntry[],
  config: SourceConfig,
): Promise<NormalizedShoppingRetailItem[]> {
  return Promise.resolve(entriesFromDirectory(config.entries ?? defaults, prefix));
}

const PLAZA_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'kendra-scott-plaza',
    businessName: 'Kendra Scott',
    title: 'Kendra Scott — new Country Club Plaza boutique',
    body: 'Named jewelry boutique opening on the Country Club Plaza with personalized gifting and Color Bar experiences.',
    category: 'boutique_opening',
    sourceUrl: 'https://www.countryclubplaza.com/stores/kendra-scott',
    venue: 'Country Club Plaza',
    address: '4706 Broadway Blvd, Kansas City, MO',
    neighborhood: 'country club plaza',
  },
  {
    slug: 'lululemon-plaza',
    businessName: 'lululemon',
    title: 'lululemon — athletic retail opening on the Plaza',
    body: 'Named athleisure retailer opening a storefront on Country Club Plaza with local run club activations.',
    category: 'retail_opening',
    sourceUrl: 'https://www.countryclubplaza.com/stores/lululemon',
    venue: 'Country Club Plaza',
    neighborhood: 'country club plaza',
  },
  {
    slug: 'warby-parker-plaza-popup',
    businessName: 'Warby Parker',
    eventName: 'Warby Parker Plaza pop-up',
    title: 'Warby Parker pop-up shop — Country Club Plaza',
    body: 'Named eyewear brand pop-up on the Plaza with eye exams and frame fittings for KC shoppers.',
    category: 'pop_up_shop',
    sourceUrl: 'https://www.countryclubplaza.com/events',
    venue: 'Country Club Plaza',
    neighborhood: 'country club plaza',
  },
];

export function parseCountryClubPlazaSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadCountryClubPlazaEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('plaza', PLAZA_DEFAULTS, config);
}

const CROWN_CENTER_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'crown-center-holiday-shops',
    businessName: 'Crown Center Holiday Shops',
    eventName: 'Crown Center Holiday Retail Market',
    title: 'Crown Center Holiday Shops — seasonal retail market',
    body: 'Named seasonal shopping village at Crown Center with local artisan vendors and holiday retail activations.',
    category: 'seasonal_market',
    sourceUrl: 'https://www.crowncenter.com/events',
    venue: 'Crown Center',
    address: '2450 Grand Blvd, Kansas City, MO',
    neighborhood: 'crown center',
  },
  {
    slug: 'hallmark-retail-experience',
    businessName: 'Hallmark Visitor Center',
    title: 'Hallmark Visitor Center — Crown Center retail experience',
    body: 'Named Crown Center anchor offering retail experiences, keepsake shopping, and visitor packages.',
    category: 'shopping_event',
    sourceUrl: 'https://www.hallmarkvisitorscenter.com/',
    venue: 'Crown Center',
    neighborhood: 'crown center',
  },
  {
    slug: 'crown-center-maker-market',
    businessName: 'Crown Center Maker Market',
    eventName: 'Crown Center Maker Market',
    title: 'Crown Center Maker Market — local vendor retail event',
    body: 'Named maker and vendor market at Crown Center featuring KC artisans and small retail brands.',
    category: 'maker_market',
    sourceUrl: 'https://www.crowncenter.com/shopping',
    venue: 'Crown Center',
    neighborhood: 'crown center',
  },
];

export function parseCrownCenterRetailSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadCrownCenterRetailEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('crown-center', CROWN_CENTER_DEFAULTS, config);
}

const CORBIN_PARK_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'evereve-corbin-park',
    businessName: 'evereve',
    title: 'evereve — boutique opening at Corbin Park',
    body: 'Named women\'s boutique retailer opening at Corbin Park with contemporary brands and styling events.',
    category: 'boutique_opening',
    sourceUrl: 'https://www.shopcorbin.com/',
    venue: 'Corbin Park',
    address: '6621 West 135th Street, Overland Park, KS',
    neighborhood: 'overland park',
  },
  {
    slug: 'lululemon-corbin-park',
    businessName: 'lululemon',
    title: 'lululemon — Corbin Park retail opening',
    body: 'Named athletic retail tenant at Corbin Park with community fitness events for Johnson County shoppers.',
    category: 'retail_opening',
    sourceUrl: 'https://www.shopcorbin.com/directory',
    venue: 'Corbin Park',
    neighborhood: 'overland park',
  },
];

export function parseCorbinParkSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadCorbinParkEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('corbin-park', CORBIN_PARK_DEFAULTS, config);
}

const PRAIRIEFIRE_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'michael-kors-prairiefire',
    businessName: 'Michael Kors',
    title: 'Michael Kors — Prairiefire retail opening',
    body: 'Named luxury fashion retailer opening at Prairiefire with accessories and ready-to-wear collections.',
    category: 'retail_opening',
    sourceUrl: 'https://www.prairiefire.org/shopping',
    venue: 'Prairie Fire',
    address: '5661 West 135th Street, Overland Park, KS',
    neighborhood: 'overland park',
  },
  {
    slug: 'prairiefire-artisan-market',
    businessName: 'Prairiefire Artisan Market',
    eventName: 'Prairiefire Artisan Market',
    title: 'Prairiefire Artisan Market — vendor retail event',
    body: 'Named artisan vendor market at Prairiefire with local makers, boutiques, and seasonal shopping.',
    category: 'artisan_market',
    sourceUrl: 'https://www.prairiefire.org/events',
    venue: 'Prairie Fire',
    neighborhood: 'overland park',
  },
];

export function parsePrairiefireRetailSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadPrairiefireRetailEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('prairiefire', PRAIRIEFIRE_DEFAULTS, config);
}

const TOWN_CENTER_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'lululemon-town-center',
    businessName: 'lululemon',
    title: 'lululemon — Town Center Plaza retail opening',
    body: 'Named athletic retailer opening at Town Center Plaza in Leawood with local studio partnerships.',
    category: 'retail_opening',
    sourceUrl: 'https://www.towncenterplaza.com/stores',
    venue: 'Town Center Plaza',
    address: '4706 W 119th St, Leawood, KS',
    neighborhood: 'leawood',
  },
  {
    slug: 'rally-house-town-center',
    businessName: 'Rally House',
    title: 'Rally House — Town Center Plaza sports retail',
    body: 'Named KC sports retail tenant at Town Center Plaza with Chiefs, Royals, and Sporting KC merchandise.',
    category: 'retail_opening',
    sourceUrl: 'https://www.towncenterplaza.com/',
    venue: 'Town Center Plaza',
    neighborhood: 'leawood',
  },
];

export function parseTownCenterPlazaSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadTownCenterPlazaEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('town-center', TOWN_CENTER_DEFAULTS, config);
}

const ZONA_ROSA_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'zona-rosa-sidewalk-sale',
    businessName: 'Zona Rosa Retailers',
    eventName: 'Zona Rosa Sidewalk Sale',
    title: 'Zona Rosa Sidewalk Sale — Northland retail event',
    body: 'Named sidewalk sale event with participating Zona Rosa retailers offering seasonal deals for Northland shoppers.',
    category: 'sidewalk_sale',
    sourceUrl: 'https://www.zonarosa.com/events',
    venue: 'Zona Rosa',
    address: '8640 North Dixson Avenue, Kansas City, MO',
    neighborhood: 'northland',
  },
  {
    slug: 'altard-state-zona-rosa',
    businessName: 'Altar\'d State',
    title: 'Altar\'d State — Zona Rosa boutique opening',
    body: 'Named boutique retailer opening at Zona Rosa with women\'s fashion and give-back mission events.',
    category: 'boutique_opening',
    sourceUrl: 'https://www.zonarosa.com/stores',
    venue: 'Zona Rosa',
    neighborhood: 'northland',
  },
];

export function parseZonaRosaSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadZonaRosaEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('zona-rosa', ZONA_ROSA_DEFAULTS, config);
}

const LEGENDS_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'legends-outlet-vip-sale',
    businessName: 'Legends Outlets KC',
    eventName: 'Legends Outlets VIP Warehouse Sale',
    title: 'Legends Outlets VIP warehouse sale — designer outlet event',
    body: 'Named outlet center warehouse sale event with participating brand tenants and visitor-deal shopping.',
    category: 'warehouse_sale',
    sourceUrl: 'https://www.legendoutletskc.com/events/',
    venue: 'Legends Outlets Kansas City',
    address: '1843 Village West Parkway, Kansas City, KS',
    neighborhood: 'legends',
  },
  {
    slug: 'coach-legends-outlet',
    businessName: 'Coach Outlet',
    title: 'Coach Outlet — Legends Outlets retail opening',
    body: 'Named designer outlet tenant at Legends with handbag and accessories retail for KC visitors.',
    category: 'retail_opening',
    sourceUrl: 'https://www.legendoutletskc.com/stores/',
    venue: 'Legends Outlets Kansas City',
    neighborhood: 'legends',
  },
];

export function parseLegendsOutletsSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadLegendsOutletsEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('legends', LEGENDS_DEFAULTS, config);
}

const STRAWBERRY_SWING_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'strawberry-swing-spring',
    businessName: 'Strawberry Swing',
    eventName: 'Strawberry Swing Artisan Market',
    title: 'Strawberry Swing — KC artisan market',
    body: 'Named KC artisan market featuring 200+ local makers, vintage vendors, and indie retail booths.',
    category: 'artisan_market',
    sourceUrl: 'https://www.strawberryswingkc.com/',
    venue: 'Strawberry Swing',
    neighborhood: 'kansas city',
    eventStartsAt: '2026-05-31T10:00:00.000Z',
    eventEndsAt: '2026-05-31T18:00:00.000Z',
  },
  {
    slug: 'strawberry-swing-holiday',
    businessName: 'Strawberry Swing',
    eventName: 'Strawberry Swing Holiday Market',
    title: 'Strawberry Swing Holiday Market — seasonal artisan retail',
    body: 'Named holiday artisan market with curated local vendors and gift-focused retail shopping.',
    category: 'seasonal_market',
    sourceUrl: 'https://www.strawberryswingkc.com/events',
    venue: 'Strawberry Swing',
    neighborhood: 'kansas city',
  },
];

export function parseStrawberrySwingSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadStrawberrySwingEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('strawberry-swing', STRAWBERRY_SWING_DEFAULTS, config);
}

const WEST_BOTTOMS_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'west-bottoms-first-friday-vintage',
    businessName: 'West Bottoms Vintage Collective',
    eventName: 'West Bottoms First Friday Vintage Market',
    title: 'West Bottoms First Friday — vintage market',
    body: 'Named vintage market in the West Bottoms warehouse district with antique dealers and retro retail vendors.',
    category: 'vintage_market',
    sourceUrl: 'https://www.westbottoms.com/',
    venue: 'West Bottoms',
    neighborhood: 'west bottoms',
  },
  {
    slug: 'good-ju-ju-west-bottoms',
    businessName: 'Good Ju Ju',
    title: 'Good Ju Ju — West Bottoms vintage and antique retail',
    body: 'Named West Bottoms vintage retailer with mid-century furniture, decor, and collector shopping.',
    category: 'antique_market',
    sourceUrl: 'https://www.goodjuju.us/',
    venue: 'West Bottoms',
    address: '1300 W 13th St, Kansas City, MO',
    neighborhood: 'west bottoms',
  },
  {
    slug: 'bottoms-up-west-bottoms',
    businessName: 'Bottoms Up Antiques',
    title: 'Bottoms Up Antiques — West Bottoms warehouse retail',
    body: 'Named antique warehouse retailer in the West Bottoms with vintage furniture and collector finds.',
    category: 'antique_market',
    sourceUrl: 'https://www.westbottoms.com/shops',
    venue: 'West Bottoms',
    neighborhood: 'west bottoms',
  },
];

export function parseWestBottomsVintageSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadWestBottomsVintageEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('west-bottoms', WEST_BOTTOMS_DEFAULTS, config);
}

const RIVER_MARKET_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'city-market-vendors',
    businessName: 'City Market Farmers Market',
    eventName: 'City Market Vendor Row',
    title: 'City Market — River Market vendor retail',
    body: 'Named River Market vendor market with produce, artisan food, and local maker retail booths.',
    category: 'vendor_market',
    sourceUrl: 'https://www.thecitymarket.org/',
    venue: 'City Market',
    address: '20 E 5th St, Kansas City, MO',
    neighborhood: 'river market',
  },
  {
    slug: 'river-market-weekend-vendors',
    businessName: 'River Market Weekend Vendors',
    eventName: 'River Market Weekend Vendor Market',
    title: 'River Market weekend vendor market',
    body: 'Named weekend vendor market with local artisans, specialty retail, and seasonal shopping in the River Market.',
    category: 'vendor_market',
    sourceUrl: 'https://www.thecitymarket.org/events',
    venue: 'River Market',
    neighborhood: 'river market',
  },
];

export function parseRiverMarketVendorsSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadRiverMarketVendorsEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('river-market', RIVER_MARKET_DEFAULTS, config);
}

const MADE_IN_KC_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'made-in-kc-market',
    businessName: 'Made in KC',
    eventName: 'Made in KC Market',
    title: 'Made in KC Market — local maker retail event',
    body: 'Named KC maker market showcasing local brands, artisan goods, and indie retail vendors.',
    category: 'maker_market',
    sourceUrl: 'https://madeinkc.com/',
    venue: 'Made in KC',
    neighborhood: 'crossroads',
  },
  {
    slug: 'made-in-kc-crossroads',
    businessName: 'Made in KC Crossroads',
    title: 'Made in KC Crossroads — local retail shop',
    body: 'Named Crossroads retail shop featuring KC-made goods, gifts, and local brand pop-ups.',
    category: 'shopping_event',
    sourceUrl: 'https://madeinkc.com/locations',
    venue: 'Crossroads',
    neighborhood: 'crossroads',
  },
];

export function parseMadeInKcSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadMadeInKcEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('made-in-kc', MADE_IN_KC_DEFAULTS, config);
}

const CARDSHOWS_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'kc-sports-collectibles-show',
    businessName: 'KC Sports Collectibles Show',
    eventName: 'KC Sports Collectibles Show',
    title: 'KC Sports Collectibles Show — CardShows.io listing',
    body: 'Named trading card and sports memorabilia collector show in the KC metro with vendor booths.',
    category: 'collector_show',
    sourceUrl: 'https://cardshows.io/shows/kansas-city',
    venue: 'Overland Park Convention Center',
    neighborhood: 'overland park',
  },
  {
    slug: 'kc-comic-card-show',
    businessName: 'KC Comic & Card Show',
    eventName: 'KC Comic & Card Show',
    title: 'KC Comic & Card Show — collector retail event',
    body: 'Named comic and trading card collector show with exhibitor vendors and vintage card retail.',
    category: 'collector_show',
    sourceUrl: 'https://cardshows.io/',
    venue: 'Kansas City metro',
    neighborhood: 'kansas city',
  },
];

export function parseCardshowsIoSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadCardshowsIoEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('cardshows', CARDSHOWS_DEFAULTS, config);
}

const COLLECT_A_CON_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'collect-a-con-kc',
    businessName: 'Collect-A-Con Kansas City',
    eventName: 'Collect-A-Con Kansas City',
    title: 'Collect-A-Con Kansas City — pop culture collector show',
    body: 'Named Collect-A-Con event with celebrity guests, exhibitor vendors, and collector retail in KC.',
    category: 'collector_show',
    sourceUrl: 'https://collectacon.com/events/kansas-city/',
    venue: 'Kansas City Convention Center',
    neighborhood: 'downtown',
  },
];

export function parseCollectAConSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadCollectAConEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('collect-a-con', COLLECT_A_CON_DEFAULTS, config);
}

const PLANET_COMICON_DEFAULTS: ShoppingRetailEntry[] = [
  {
    slug: 'planet-comicon-vendors',
    businessName: 'Planet Comicon Kansas City',
    eventName: 'Planet Comicon Vendor Hall',
    title: 'Planet Comicon — vendor and exhibitor retail',
    body: 'Named Planet Comicon vendor hall with indie artists, comic retailers, and pop culture exhibitor booths.',
    category: 'collector_show',
    sourceUrl: 'https://www.planetcomicon.com/',
    venue: 'Kansas City Convention Center',
    neighborhood: 'downtown',
  },
  {
    slug: 'planet-comicon-artist-alley',
    businessName: 'Planet Comicon Artist Alley',
    eventName: 'Planet Comicon Artist Alley',
    title: 'Planet Comicon Artist Alley — indie vendor retail',
    body: 'Named Artist Alley vendor section at Planet Comicon featuring indie creators and specialty retail.',
    category: 'shopping_event',
    sourceUrl: 'https://www.planetcomicon.com/artist-alley/',
    venue: 'Kansas City Convention Center',
    neighborhood: 'downtown',
  },
];

export function parsePlanetComiconSourceConfig(raw: unknown): SourceConfig {
  return parseConfig(raw);
}
export async function loadPlanetComiconEvents(config: SourceConfig): Promise<NormalizedShoppingRetailItem[]> {
  return loadDirectory('planet-comicon', PLANET_COMICON_DEFAULTS, config);
}
