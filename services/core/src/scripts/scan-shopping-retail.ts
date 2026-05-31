import { db } from '../db.js';
import { sources } from '../schema.js';
import { scanSource } from '../scanner/index.js';
import { inArray } from 'drizzle-orm';

const SHOPPING_TYPES = [
  'country_club_plaza',
  'crown_center_retail',
  'corbin_park',
  'prairiefire_retail',
  'town_center_plaza',
  'zona_rosa',
  'legends_outlets',
  'strawberry_swing',
  'west_bottoms_vintage',
  'river_market_vendors',
  'made_in_kc',
  'cardshows_io',
  'collect_a_con',
  'planet_comicon',
] as const;

async function main() {
  const rows = await db.select().from(sources).where(inArray(sources.type, [...SHOPPING_TYPES]));
  let totalCreated = 0;
  let totalFound = 0;
  let totalSkipped = 0;

  for (const row of rows) {
    const r = await scanSource(row.id);
    console.log(JSON.stringify({ name: row.name, type: row.type, ...r }));
    totalCreated += r.itemsCreated;
    totalFound += r.itemsFound;
    totalSkipped += r.itemsSkipped;
  }

  console.log(
    JSON.stringify({ sources: rows.length, totalFound, totalCreated, totalSkipped }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
