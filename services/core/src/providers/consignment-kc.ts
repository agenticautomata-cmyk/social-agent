import { buildAudienceDeal, type NormalizedAudienceDeal } from './closings-deals-shared.js';

export type ConsignmentKcSourceConfig = {
  shops?: ConsignmentShopEntry[];
};

type ConsignmentShopEntry = {
  slug: string;
  businessName: string;
  title: string;
  address: string;
  neighborhood: string | null;
  website: string;
  description: string;
};

const DEFAULT_SHOPS: ConsignmentShopEntry[] = [
  {
    slug: 'do-good-co',
    businessName: 'Do Good Co.',
    title: 'Do Good Co. — luxury consignment & designer resale',
    address: '413 E 18th Street, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.dogoodkc.org/',
    description: 'Crossroads boutique with Faire du Bien luxury consignment collection; proceeds support local kids and pets.',
  },
  {
    slug: 'the-curated-closet',
    businessName: 'The Curated Closet',
    title: 'The Curated Closet — boutique consignment & vintage',
    address: '1717 Oak Street, Suite 200, Kansas City, MO 64108',
    neighborhood: 'crossroads',
    website: 'https://www.thecuratedclosetkc.com/',
    description: 'Curated new and vintage apparel and accessories in the Crossroads Arts District.',
  },
  {
    slug: 'my-best-friends-closet-barry',
    businessName: "My Best Friend's Closet — Barry Road",
    title: "My Best Friend's Closet — designer consignment Northland",
    address: '347 NW Barry Road, Kansas City, MO 64155',
    neighborhood: 'northland',
    website: 'https://www.mybfclosetkc.com/',
    description: 'Designer consignment accepting in-season luxury brands; Northland location.',
  },
  {
    slug: 'my-best-friends-closet-shawnee',
    businessName: "My Best Friend's Closet — Shawnee",
    title: "My Best Friend's Closet — designer consignment Shawnee",
    address: '12152 Shawnee Mission Parkway, Shawnee, KS 66216',
    neighborhood: 'shawnee',
    website: 'https://www.mybfclosetkc.com/',
    description: 'Designer consignment with daily arrivals of authenticated luxury items.',
  },
  {
    slug: 'style-encore-overland-park',
    businessName: 'Style Encore Overland Park',
    title: 'Style Encore — luxury resale & consignment Overland Park',
    address: 'Overland Park, KS',
    neighborhood: 'overland park',
    website: 'https://style-encore.com/locations/overland-park-ks/',
    description: 'Women\'s designer resale; buys and sells luxury handbags including Louis Vuitton, Chanel, Gucci.',
  },
  {
    slug: 'clothes-mentor-overland-park',
    businessName: 'Clothes Mentor Overland Park',
    title: 'Clothes Mentor — upscale resale Overland Park',
    address: 'Overland Park, KS',
    neighborhood: 'overland park',
    website: 'https://clothesmentor.com/stores/overland-park-ks/',
    description: "Upscale women's resale boutique buying and selling name-brand clothing and accessories.",
  },
  {
    slug: 'luxury-buyer-kc',
    businessName: 'Luxury Buyer KC',
    title: 'Luxury Buyer KC — designer handbag & jewelry resale',
    address: 'Kansas City metro',
    neighborhood: 'kansas city',
    website: 'https://luxurybuyerkc.com/',
    description: 'Buys and sells authenticated luxury handbags, jewelry, and designer accessories in KC metro.',
  },
  {
    slug: 'buffalo-exchange-kc',
    businessName: 'Buffalo Exchange Kansas City',
    title: 'Buffalo Exchange — vintage & designer resale Westport',
    address: 'Westport, Kansas City, MO',
    neighborhood: 'westport',
    website: 'https://www.buffaloexchange.com/location/kansas-city/',
    description: 'Vintage and designer resale with buy-sell-trade model in Westport.',
  },
  {
    slug: 'annedore-fine-consignment',
    businessName: 'Annedore Fine Consignment',
    title: 'Annedore Fine Consignment — luxury home & fashion',
    address: 'Mission, KS',
    neighborhood: 'mission',
    website: 'https://www.annedores.com/',
    description: 'Fine consignment for luxury fashion, jewelry, and home furnishings on the Kansas side.',
  },
  {
    slug: 'second-chance-resale',
    businessName: 'Second Chance Resale',
    title: 'Second Chance Resale — upscale thrift Brookside',
    address: 'Brookside, Kansas City, MO',
    neighborhood: 'brookside',
    website: 'https://www.secondchanceresalekc.com/',
    description: 'Upscale thrift and consignment supporting local charities in Brookside.',
  },
];

export function parseConsignmentKcSourceConfig(raw: unknown): ConsignmentKcSourceConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.shops)) {
    return { shops: c.shops as ConsignmentShopEntry[] };
  }
  return { shops: DEFAULT_SHOPS };
}

export async function loadConsignmentKcShops(
  config: ConsignmentKcSourceConfig,
): Promise<NormalizedAudienceDeal[]> {
  const parsed = parseConsignmentKcSourceConfig(config);
  const now = new Date();

  return (parsed.shops ?? DEFAULT_SHOPS).map((shop) =>
    buildAudienceDeal({
      externalId: `consignment-${shop.slug}`,
      title: shop.title,
      body: shop.description,
      businessName: shop.businessName,
      category: 'consignment_shop',
      sourceUrl: `${shop.website.replace(/\/$/, '')}#${shop.slug}`,
      website: shop.website,
      publishedAt: now,
      startDate: now,
      endDate: null,
      address: shop.address,
      neighborhood: shop.neighborhood,
    }),
  );
}
