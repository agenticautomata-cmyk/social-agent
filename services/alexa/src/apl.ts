import type { RequestEnvelope, interfaces } from 'ask-sdk-model';

/**
 * Official Echo Show hero: Kellie portrait + cartoon Benson composite.
 * Served from existing dashboard public icons (same path as benson-logo.png).
 * Public HTTPS, no Access token, no bearer auth.
 */
export const KCKELLIE_HERO_IMAGE_URL =
  'https://benson.kckellie.com/icons/benson-kellie-alexa-hero.png';

export const APL_DOCUMENT_TOKEN = 'kckellie-benson';
export const APL_MAX_ITEMS = 5;

export type BensonDisplayItem = {
  title: string;
  day?: string;
  time?: string | null;
  venue?: string | null;
};

export type AplListItem = {
  title: string;
  detail: string;
};

export type AplScreenData = {
  brand: string;
  title: string;
  tagline: string;
  items: AplListItem[];
};

const APL_DOCUMENT = {
  type: 'APL',
  version: '1.2',
  theme: 'dark',
  mainTemplate: {
    parameters: ['payload'],
    items: [
      {
        type: 'Container',
        width: '100vw',
        height: '100vh',
        direction: 'row',
        backgroundColor: '#1A1224',
        paddingLeft: '36dp',
        paddingRight: '36dp',
        paddingTop: '28dp',
        paddingBottom: '28dp',
        items: [
          {
            type: 'Frame',
            width: '32vw',
            height: '100%',
            borderRadius: '16dp',
            background: {
              type: 'linear',
              colorRange: ['#3B1D3A', '#C45C26'],
              inputRange: [0, 1],
              angle: 155,
            },
            item: {
              type: 'Container',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              items: [
                {
                  type: 'Image',
                  when: '${payload.bensonData.hasHero}',
                  source: '${payload.bensonData.heroImageUrl}',
                  width: '100%',
                  height: '100%',
                  scale: 'best-fit',
                  align: 'center',
                },
                {
                  type: 'Text',
                  when: '${payload.bensonData.hasHero == false}',
                  text: '${payload.bensonData.brand}',
                  color: '#FFFFFF',
                  fontSize: '48dp',
                  fontWeight: 'bold',
                  maxLines: 1,
                },
                {
                  type: 'Text',
                  when: '${payload.bensonData.hasHero == false}',
                  text: '${payload.bensonData.tagline}',
                  color: '#F4E6D8',
                  fontSize: '28dp',
                  maxLines: 2,
                  paddingTop: '8dp',
                },
              ],
            },
          },
          {
            type: 'Container',
            width: '68vw',
            height: '100%',
            paddingLeft: '36dp',
            paddingTop: '8dp',
            grow: 1,
            items: [
              {
                type: 'Text',
                text: '${payload.bensonData.brand}',
                color: '#E8C9A8',
                fontSize: '24dp',
                maxLines: 1,
              },
              {
                type: 'Text',
                text: '${payload.bensonData.title}',
                color: '#FFFFFF',
                fontSize: '44dp',
                fontWeight: 'bold',
                maxLines: 2,
                paddingTop: '6dp',
                paddingBottom: '20dp',
              },
              {
                type: 'Sequence',
                width: '100%',
                grow: 1,
                scrollDirection: 'vertical',
                data: '${payload.bensonData.items}',
                items: [
                  {
                    type: 'Container',
                    paddingBottom: '18dp',
                    items: [
                      {
                        type: 'Text',
                        text: '${data.title}',
                        color: '#FFFFFF',
                        fontSize: '32dp',
                        fontWeight: 'bold',
                        maxLines: 2,
                      },
                      {
                        type: 'Text',
                        when: "${data.detail != ''}",
                        text: '${data.detail}',
                        color: '#DCC4B0',
                        fontSize: '24dp',
                        maxLines: 1,
                        paddingTop: '4dp',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

export function deviceSupportsApl(envelope: RequestEnvelope): boolean {
  const interfaces = envelope.context?.System?.device?.supportedInterfaces;
  if (!interfaces || typeof interfaces !== 'object') return false;
  return Boolean(interfaces['Alexa.Presentation.APL']);
}

export function formatItemDetail(item: BensonDisplayItem): string {
  const parts: string[] = [];
  if (item.day?.trim()) parts.push(item.day.trim());
  if (item.time?.trim()) parts.push(item.time.trim());
  if (item.venue?.trim()) parts.push(item.venue.trim());
  return parts.join('  ·  ');
}

export function toAplItems(items: BensonDisplayItem[] | undefined): AplListItem[] {
  if (!items?.length) return [];
  const out: AplListItem[] = [];
  for (const item of items) {
    if (out.length >= APL_MAX_ITEMS) break;
    const title = item.title?.trim();
    if (!title) continue;
    out.push({ title, detail: formatItemDetail(item) });
  }
  return out;
}

export function launchScreen(): AplScreenData {
  return {
    brand: 'KCKellie',
    title: 'Benson',
    tagline: 'Kansas City',
    items: [],
  };
}

export function calendarScreen(items: BensonDisplayItem[] | undefined): AplScreenData {
  return {
    brand: 'KCKellie',
    title: "What's Happening This Weekend",
    tagline: 'Benson',
    items: toAplItems(items),
  };
}

export function weekendListScreen(items: BensonDisplayItem[] | undefined): AplScreenData {
  return {
    brand: 'KCKellie',
    title: 'Weekend List',
    tagline: 'Benson',
    items: toAplItems(items),
  };
}

export function postRecommendationsScreen(items: BensonDisplayItem[] | undefined): AplScreenData {
  return {
    brand: 'KCKellie',
    title: 'What Kellie Should Post',
    tagline: 'Benson',
    items: toAplItems(items),
  };
}

export function renderDocumentDirective(
  screen: AplScreenData,
): interfaces.alexa.presentation.apl.RenderDocumentDirective {
  const heroImageUrl = KCKELLIE_HERO_IMAGE_URL.trim();
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: APL_DOCUMENT_TOKEN,
    document: APL_DOCUMENT,
    datasources: {
      bensonData: {
        brand: screen.brand,
        title: screen.title,
        tagline: screen.tagline,
        heroImageUrl,
        hasHero: Boolean(heroImageUrl),
        items: screen.items,
      },
    },
  };
}
