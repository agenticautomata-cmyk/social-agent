/** Rotating KC web search themes — thrift/discounts through major events. */
export const BENSON_DISCOVERY_QUERIES = [
  'Kansas City events this weekend concerts festivals',
  'Kansas City new restaurant bar opening',
  'Kansas City free community events',
  'Kansas City live music tonight this week',
  'Kansas City farmers market pop-up artisan',
  'Overland Park Johnson County events this week',
  'Kansas City thrift vintage pop-up shop discount sale',
  'Kansas City Goodwill Savers thrift half price day',
  'Kansas City estate sale liquidation warehouse sale this week',
  'Kansas City family kid friendly events',
  'Kansas City art gallery museum exhibition opening',
  'Kansas City sports watch party community event',
  'Kansas City food truck festival street fair',
  'Kansas City brewery winery tasting event',
  'Kansas City book signing author appearance Rainy Day',
  'Kansas City casino concert celebrity appearance',
  'Kansas City convention comic con collector show',
  'Kansas City parade festival Boulevardia Plaza Art Fair',
  'Kansas City zoo Powell Gardens Nelson-Atkins events',
  'Kansas City Chiefs Royals Sporting KC fan event',
  'Kansas City store closing liquidation discount sale',
  'Kansas City mall Plaza Zona Rosa outlet sale event',
  'Kansas City date night rooftop jazz free admission',
  'Kansas City summer festival outdoor concert this week',
  'Kansas City Kemper Nelson Science City museum events',
  'Kansas City Starlight theatre concerts',
  'Johnson County Overland Park library community events',
  'Kansas City INKC local business openings events',
  'Kansas City grand opening ribbon cutting this month',
  'Johnson County Post new restaurant store opening',
  'Kansas City Star openings closings new business',
  'Flatland KC new restaurant business opening',
  'Kansas City new store opening Country Club Plaza Zona Rosa Oak Park Mall',
  'Lee\'s Summit Independence Shawnee new business opening event',
  'Kansas City Black Friday holiday sale mall outlet deals',
  'Kansas City Memorial Day Labor Day weekend sales events',
  'Johnson County thrift half price day Savers Goodwill sale',
  'Kansas City grocery weekly deals Hy-Vee Price Chopper',
  'Legends Outlets Tanger Kansas City clearance sale',
] as const;

export function pickDiscoveryQueries(count = 3, bucketIndex?: number): string[] {
  const bucket =
    bucketIndex ??
    Math.floor(Date.now() / (12 * 60 * 60 * 1000));
  const start = bucket % BENSON_DISCOVERY_QUERIES.length;
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(BENSON_DISCOVERY_QUERIES[(start + i) % BENSON_DISCOVERY_QUERIES.length]!);
  }
  return picked;
}
