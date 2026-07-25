import type { InventoryFlags, InventoryItem } from '../inventory/normalize.js';
import { isShoppingRetailContent } from '../inventory/content-framing.js';
import { isWorldCupSeasonActive } from '../inventory/mega-events.js';
import {
  classifyRecordEntity,
  hasLuxuryEvidence,
  isApparelRetailBrand,
  isAthleticBrand,
  isDateNightEligible,
  isLuxuryDateNightEligible,
} from './classify-entity.js';
import type { AngleMatchInput, AngleMatchResult, ContentAngleFamily } from './types.js';

function inputFromItem(item: InventoryItem): AngleMatchInput {
  return {
    title: item.title,
    summary: item.summary,
    category: item.category,
    sourceType: item.sourceType,
    businessName: item.businessName,
    venue: item.venue,
    flags: item.flags,
  };
}

function flagsFromInput(flags?: Partial<InventoryFlags>): InventoryFlags {
  return {
    sponsorFriendly: flags?.sponsorFriendly ?? false,
    luxury: flags?.luxury ?? false,
    dining: flags?.dining ?? false,
    dateNight: flags?.dateNight ?? false,
    estateSale: flags?.estateSale ?? false,
    businessOpening: flags?.businessOpening ?? false,
    freeEvent: flags?.freeEvent ?? false,
    celebrityCharity: flags?.celebrityCharity ?? false,
    sports: flags?.sports ?? false,
    reddit: flags?.reddit ?? false,
    worldCup: flags?.worldCup ?? false,
    shopping: flags?.shopping ?? false,
    retail: flags?.retail ?? false,
    vendorMarket: flags?.vendorMarket ?? false,
    collector: flags?.collector ?? false,
  };
}

function buildResult(partial: Omit<AngleMatchResult, 'valid' | 'luxuryEvidence' | 'dateNightEligible'> & { valid?: boolean }, input: AngleMatchInput): AngleMatchResult {
  return {
    ...partial,
    valid: partial.valid ?? partial.family !== 'no_valid_angle',
    luxuryEvidence: hasLuxuryEvidence(input),
    dateNightEligible: isDateNightEligible(input),
  };
}

export function matchContentAngle(input: AngleMatchInput): AngleMatchResult {
  const entity = classifyRecordEntity(input);
  const text = [input.title, input.summary, input.businessName].filter(Boolean).join(' ').toLowerCase();
  const coreText = [input.title, input.summary, input.businessName, input.venue].filter(Boolean).join(' ').toLowerCase();

  if (entity === 'malformed' || entity === 'promotion') {
    return buildResult(
      {
        family: 'no_valid_angle',
        pitchAngle: 'NO VALID ANGLE',
        contentAngle: 'NO VALID ANGLE',
        sponsorshipAsk: 'NO VALID ANGLE',
        templateType: 'introduction',
        explanation: [`entity:${entity}`, 'malformed_or_promotion_not_pitchable'],
        entityType: entity,
        valid: false,
      },
      input,
    );
  }

  if (entity === 'article') {
    if (/\btori kelly\b/i.test(text) || CONCERT_ARTICLE.test(text)) {
      return buildResult(
        {
          family: 'weekend_plans',
          pitchAngle: 'Weekend event feature — celebrity appearance with ticket, parking, and Before You Go KC breakdown.',
          contentAngle: 'Concert/event recap with practical viewer tips (parking, timing, what to wear).',
          sponsorshipAsk: 'Ticket trade, VIP access, or official event media partnership — not a restaurant pitch.',
          templateType: 'introduction',
          explanation: ['entity:article', 'angle:weekend_plans_for_concert'],
          entityType: 'article',
        },
        input,
      );
    }
    return buildResult(
      {
        family: 'before_you_go_kc',
        pitchAngle: 'Before You Go KC — explain the actual event with verified source details.',
        contentAngle: 'Event guide short with date, venue, and who it is for.',
        sponsorshipAsk: 'Ticket/media access or official event partnership when available.',
        templateType: 'introduction',
        explanation: ['entity:article', 'angle:before_you_go_kc'],
        entityType: 'article',
      },
      input,
    );
  }

  if (isApparelRetailBrand(input)) {
    return buildResult(
      {
        family: 'style_or_outfit_challenge',
        pitchAngle: 'Comfort-fashion try-on — body-positive styling and seasonal outfit ideas for real women.',
        contentAngle: 'Try-on haul or “what I’d actually wear” reel focused on comfort and value.',
        sponsorshipAsk: 'Shopping credit, exclusive discount code, or try-on partnership.',
        templateType: 'shopping_retail',
        explanation: ['business:apparel_retail', 'angle:style_or_outfit_challenge'],
        entityType: entity,
      },
      input,
    );
  }

  if (isAthleticBrand(input)) {
    return buildResult(
      {
        family: 'product_test',
        pitchAngle: 'Walking shoe or travel-outfit test — sporty lifestyle content tied to KC errands and events.',
        contentAngle: 'Honest product test or outlet deal comparison — not a couples date pitch.',
        sponsorshipAsk: 'Product seeding, outlet promo code, or athletic lifestyle partnership.',
        templateType: 'shopping_retail',
        explanation: ['business:athletic_brand', 'angle:product_test', 'blocked:luxury_date_night'],
        entityType: entity,
      },
      input,
    );
  }

  if (
    !RESTAURANT.test(coreText) &&
    isShoppingRetailContent(flagsFromInput(input.flags), input.category ?? null, input.title)
  ) {
    if (/\baerie\b/i.test(text)) {
      return buildResult(
        {
          family: 'style_or_outfit_challenge',
          pitchAngle: 'Comfort-fashion try-on — body-positive styling and seasonal outfit ideas for real women.',
          contentAngle: 'Try-on haul or “what I’d actually wear” reel focused on comfort and value.',
          sponsorshipAsk: 'Shopping credit, exclusive discount code, or try-on partnership.',
          templateType: 'shopping_retail',
          explanation: ['business:apparel_retail', 'angle:style_or_outfit_challenge_for_aerie'],
          entityType: entity,
        },
        input,
      );
    }
    if (/\badidas\b/i.test(text)) {
      return buildResult(
        {
          family: 'product_test',
          pitchAngle: 'Walking shoe or travel-outfit test — sporty lifestyle content tied to KC errands and events.',
          contentAngle: 'Honest product test or outlet deal comparison — not a couples date pitch.',
          sponsorshipAsk: 'Product seeding, outlet promo code, or athletic lifestyle partnership.',
          templateType: 'shopping_retail',
          explanation: ['business:athletic_brand', 'angle:product_test_for_adidas', 'blocked:luxury_date_night'],
          entityType: entity,
        },
        input,
      );
    }
    return buildResult(
      {
        family: 'thrift_or_shopping_discovery',
        pitchAngle: 'Shopping discovery — deal find, new store opening, or local haul with clear business tag.',
        contentAngle: 'Shop local haul, rack-run finds, or market-day recap.',
        sponsorshipAsk: 'Gift card, shopping credit, or exclusive discount for Kellie\'s audience.',
        templateType: 'shopping_retail',
        explanation: ['framing:shopping_retail'],
        entityType: entity,
      },
      input,
    );
  }

  if (/\b21c museum hotels?\b/i.test(text) || /\b21c museum hotels?\b/i.test(coreText)) {
    const family: ContentAngleFamily = isDateNightEligible(input)
      ? 'hotel_staycation'
      : 'hidden_gem';
    return buildResult(
      {
        family,
        pitchAngle:
          family === 'hotel_staycation'
            ? 'Art-hotel staycation — KC visitor guide with gallery, restaurant, and overnight experience.'
            : 'Art-hotel hidden gem — why 21c is a KC staycation worth the splurge.',
        contentAngle:
          family === 'hotel_staycation'
            ? 'Staycation vlog covering art installations, on-site dining, and couples or girls-weekend angle when evidence supports it.'
            : 'Art-hotel walkthrough with specific installations and on-property dining.',
        sponsorshipAsk: 'Hosted stay, dining credit, or art-hotel experience package.',
        templateType: isLuxuryDateNightEligible(input) ? 'luxury_date_night' : 'introduction',
        explanation: ['business:21c_museum_hotel', `angle:${family}`],
        entityType: 'business',
      },
      input,
    );
  }

  if (input.flags?.worldCup && isWorldCupSeasonActive()) {
    return buildResult(
      {
        family: 'weekend_plans',
        pitchAngle: 'World Cup visitor economy — KC soccer traffic and watch-party tie-in when evidence exists.',
        contentAngle: 'Watch party guide or visitor itinerary.',
        sponsorshipAsk: 'Watch-party host package or soccer-themed promo.',
        templateType: 'world_cup',
        explanation: ['signal:world_cup_season'],
        entityType: entity,
      },
      input,
    );
  }

  if (input.flags?.businessOpening || input.category === 'restaurant_opening') {
    return buildResult(
      {
        family: 'new_opening_first_look',
        pitchAngle: 'Grand opening first look — first-week visibility while local food/lifestyle audiences are watching.',
        contentAngle: 'Opening-day walkthrough or first-bite review with specific menu hook.',
        sponsorshipAsk: 'Opening-week sponsored coverage + grand opening invite.',
        templateType: 'restaurant_opening',
        explanation: ['signal:business_opening'],
        entityType: 'business',
      },
      input,
    );
  }

  if (/\bclosing\b|\bliquidation\b|\bgoing out of business\b/i.test(text)) {
    return buildResult(
      {
        family: 'closing_or_liquidation_update',
        pitchAngle: 'Closing or liquidation update — timely value breakdown for KC shoppers.',
        contentAngle: 'What is actually discounted, when it ends, and who should go.',
        sponsorshipAsk: 'Exclusive discount code or early access for Kellie\'s audience.',
        templateType: 'shopping_retail',
        explanation: ['signal:closing_or_liquidation'],
        entityType: entity,
      },
      input,
    );
  }

  if (isDateNightEligible(input)) {
    const luxury = isLuxuryDateNightEligible(input);
    return buildResult(
      {
        family: luxury ? 'date_night' : 'grown_woman_experience',
        pitchAngle: luxury
          ? 'Premium date-night experience — specific couples offering with verified premium details.'
          : 'Grown-woman night out — dinner, show, or lounge experience with a specific reason this fits Kellie\'s audience.',
        contentAngle: luxury
          ? 'Luxury date-night reel with concrete venue details and why it is worth the splurge.'
          : 'Night-out plan carousel with practical details (reservations, parking, vibe).',
        sponsorshipAsk: luxury
          ? 'Hosted date-night package or premium room/menu trade.'
          : 'Comped experience, reservation support, or ticket trade.',
        templateType: luxury ? 'luxury_date_night' : 'introduction',
        explanation: [
          'date_night:eligible',
          luxury ? 'luxury:evidence_present' : 'luxury:not_inferred',
        ],
        entityType: entity,
      },
      input,
    );
  }

  if (input.flags?.dining || RESTAURANT.test(text)) {
    return buildResult(
      {
        family: 'local_business_discovery',
        pitchAngle: 'Local dining feature — menu highlight with repeat-visit CTA.',
        contentAngle: 'Must-try dish reel or chef intro — not generic date-night filler.',
        sponsorshipAsk: 'Comped meal, chef\'s table, or restaurant week sponsored table.',
        templateType: 'introduction',
        explanation: ['category:dining_without_date_night_evidence'],
        entityType: 'business',
      },
      input,
    );
  }

  if (input.flags?.freeEvent) {
    return buildResult(
      {
        family: 'free_or_low_cost_kc',
        pitchAngle: 'Free or low-cost KC plan — community event with clear viewer benefit.',
        contentAngle: 'Free things to do short with date, location, and who it is for.',
        sponsorshipAsk: 'Ticket/media access or community partnership when appropriate.',
        templateType: 'introduction',
        explanation: ['signal:free_event'],
        entityType: entity,
      },
      input,
    );
  }

  if (input.flags?.sponsorFriendly && input.businessName) {
    return buildResult(
      {
        family: 'local_business_discovery',
        pitchAngle: `Local business spotlight — named partner content for ${input.businessName}.`,
        contentAngle: 'Specific KC business feature with cross-promo on their channels.',
        sponsorshipAsk: 'Introductory sponsored post or event ticket trade.',
        templateType: 'introduction',
        explanation: ['fallback:local_business_discovery'],
        entityType: entity,
      },
      input,
    );
  }

  return buildResult(
    {
      family: 'no_valid_angle',
      pitchAngle: 'NO VALID ANGLE',
      contentAngle: 'NO VALID ANGLE',
      sponsorshipAsk: 'NO VALID ANGLE',
      templateType: 'introduction',
      explanation: ['no_natural_creator_angle'],
      entityType: entity,
      valid: false,
    },
    input,
  );
}

const CONCERT_ARTICLE = /\b(presents|symphony|concert|tour 20\d{2}|live on tour|performs)\b/i;
const RESTAURANT = /\b(restaurant|cafe|coffee|bistro|tavern|grill|dining|kitchen|bar & grill|supper club)\b/i;

export function evaluateAngleForInventory(item: InventoryItem): AngleMatchResult {
  return matchContentAngle(inputFromItem(item));
}

export function pickTemplateTypeFromAngle(result: AngleMatchResult): string {
  return result.templateType;
}

export function recommendedPitchAngleFromMatch(result: AngleMatchResult): string {
  return result.pitchAngle;
}

export function suggestedContentAngleFromMatch(result: AngleMatchResult): string {
  return result.contentAngle;
}

export function suggestedSponsorshipAngleFromMatch(result: AngleMatchResult): string {
  return result.sponsorshipAsk;
}
