import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../inventory/normalize.js';
import { isDateNightEligible } from './classify-entity.js';
import { matchContentAngle, evaluateAngleForInventory } from './match-angle.js';
import {
  evaluateDraftQuality,
  isNearDuplicateDraft,
  evaluateInventoryDraftGate,
} from './draft-quality.js';
import { recommendedPitchAngle } from '../sponsor-intelligence/scoring.js';

function baseItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: '1',
    title: 'Sample business',
    summary: null,
    sourceName: 'Test',
    sourceType: 'visitkc',
    category: 'business_opening',
    state: 'planned',
    eventDate: null,
    eventEndDate: null,
    discoveredAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    venue: null,
    businessName: 'Sample business',
    neighborhood: null,
    address: null,
    locationName: null,
    locationStatus: null,
    formattedAddress: null,
    locationLat: null,
    locationLng: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    locationWebsiteUrl: null,
    locationConfidence: null,
    locationSource: null,
    locationVerifiedAt: null,
    locationResolutionError: null,
    sourceUrl: 'https://example.com',
    ingest: null,
    flags: {
      sponsorFriendly: true,
      luxury: false,
      dining: false,
      dateNight: false,
      estateSale: false,
      businessOpening: false,
      freeEvent: false,
      celebrityCharity: false,
      sports: false,
      reddit: false,
      worldCup: false,
      shopping: false,
      retail: false,
      vendorMarket: false,
      collector: false,
    },
    badges: [],
    audienceScore: 5,
    whyItMatters: 'Test',
    metadata: {},
    relevanceScore: '0.7',
    urgencyScore: '0.5',
    coverageFormat: null,
    suggestedCoverageFormat: null,
    firsthandVisited: false,
    creatorValueStatus: 'creator_candidate',
    lifecycleStatus: 'active',
    ...overrides,
  };
}

describe('date-night eligibility', () => {
  it('allows hotels with staycation evidence', () => {
    const item = baseItem({
      title: '21c Museum Hotel — art-forward boutique packages & date-night stays',
      businessName: '21c Museum Hotel',
      category: 'hotel_package',
      summary: 'Luxury boutique hotel with on-site dining and couples packages.',
      flags: { ...baseItem().flags, luxury: true, dateNight: true, sponsorFriendly: true },
    });
    assert.equal(isDateNightEligible(item), true);
    const angle = evaluateAngleForInventory(item);
    assert.notEqual(angle.family, 'no_valid_angle');
    assert.match(angle.pitchAngle.toLowerCase(), /staycation|art-hotel|date-night/);
  });

  it('allows restaurants when evidence supports couples experience', () => {
    const item = baseItem({
      title: 'Martin City Tavern and Terrace — patio dining',
      businessName: 'Martin City Tavern and Terrace',
      category: 'luxury_dining',
      summary: 'Upscale tavern with romantic patio and tasting menu.',
      flags: { ...baseItem().flags, dining: true, dateNight: true, luxury: true, sponsorFriendly: true },
    });
    assert.equal(isDateNightEligible(item), true);
  });

  it('blocks Adidas from luxury date night', () => {
    const item = baseItem({
      title: 'Adidas outlet weekend deals',
      businessName: 'Adidas',
      category: 'deal',
      flags: { ...baseItem().flags, shopping: true, retail: true, luxury: true, dateNight: true },
    });
    const angle = evaluateAngleForInventory(item);
    assert.notEqual(angle.family, 'date_night');
    assert.match(recommendedPitchAngle(item).toLowerCase(), /product|walking|outlet|sporty/);
    assert.doesNotMatch(recommendedPitchAngle(item).toLowerCase(), /luxury date night/);
  });

  it('blocks Aerie store promotion from default date night', () => {
    const item = baseItem({
      title: 'Aerie Store Promotion',
      businessName: 'Aerie',
      category: 'retail_sale',
      flags: { ...baseItem().flags, luxury: true, sponsorFriendly: true },
    });
    const angle = evaluateAngleForInventory(item);
    assert.equal(angle.family, 'style_or_outfit_challenge');
    assert.doesNotMatch(angle.pitchAngle.toLowerCase(), /date night/);
  });

  it('blocks Adidas store promotion from product-test misroute', () => {
    const item = baseItem({
      title: 'Adidas Store Promotion',
      businessName: 'Adidas',
      category: 'retail_sale',
      flags: { ...baseItem().flags, luxury: true, sponsorFriendly: true },
    });
    const angle = evaluateAngleForInventory(item);
    assert.equal(angle.family, 'product_test');
  });

  it('routes Martin City Tavern to dining, not shopping', () => {
    const item = baseItem({
      title: 'Martin City Tavern and Terrace',
      businessName: 'Martin City Tavern and Terrace',
      category: 'luxury_deal',
      summary: 'Upscale tavern with romantic patio and tasting menu.',
      flags: { ...baseItem().flags, luxury: true, sponsorFriendly: true },
    });
    const angle = evaluateAngleForInventory(item);
    assert.notEqual(angle.family, 'thrift_or_shopping_discovery');
    assert.match(angle.pitchAngle.toLowerCase(), /dining|local|tavern|date-night|night out/);
  });

  it('classifies production Tori Kelly article as weekend event, not restaurant opening', () => {
    const item = baseItem({
      title: "Singer Tori Kelly on collaboration, faith, and motherhood ahead of Friday's T-Mobile show",
      businessName: "Singer Tori Kelly on collaboration, faith, and motherhood ahead of Friday's T-Mobile show",
      category: 'dining',
      summary: 'Concert performance at the Midland Theatre.',
      flags: { ...baseItem().flags, dining: true, businessOpening: true, sponsorFriendly: true },
    });
    const angle = evaluateAngleForInventory(item);
    assert.equal(angle.entityType, 'article');
    assert.notEqual(angle.family, 'new_opening_first_look');
  });
});

describe('article and malformed records', () => {
  it('does not turn Tori Kelly article into restaurant pitch', () => {
    const item = baseItem({
      title: 'Tori Kelly Live on Tour 2026 — Kansas City',
      businessName: 'Tori Kelly Live on Tour 2026',
      category: 'date_night',
      summary: 'Concert performance at the Midland Theatre.',
      flags: { ...baseItem().flags, dateNight: true, luxury: true, freeEvent: true },
    });
    const angle = evaluateAngleForInventory(item);
    assert.equal(angle.entityType, 'article');
    assert.notEqual(angle.family, 'new_opening_first_look');
    assert.doesNotMatch(angle.pitchAngle.toLowerCase(), /grand opening/);
  });

  it('blocks malformed article headline sponsor business', () => {
    const item = baseItem({
      title: 'Clearance sale: buy 5 or more items this weekend',
      businessName: 'Clearance sale: buy 5 or more items',
    });
    const gate = evaluateInventoryDraftGate(item);
    assert.equal(gate.allowed, false);
    assert.equal(gate.skipReason, 'no_valid_angle');
  });
});

describe('draft quality gate', () => {
  it('blocks pitch-ready when angle is invalid', () => {
    const angle = matchContentAngle({
      title: 'Adidas outlet',
      businessName: 'Adidas',
      flags: { shopping: true, retail: true, luxury: true, dateNight: true },
    });
    const quality = evaluateDraftQuality({
      subject: 'Luxury Date Night with Adidas',
      body: 'I would love a luxury date night partnership with Adidas for couples in KC.',
      angle,
      contactEmail: 'partnerships@adidas.com',
      contactName: 'Alex',
      businessName: 'Adidas',
    });
    assert.equal(quality.showToKellie, false);
    assert.equal(quality.pitchReadinessStatus, 'needs_angle');
    assert.ok(
      quality.blockedReasons.includes('luxury_date_night_not_eligible') ||
        quality.blockedReasons.includes('date_night_not_eligible'),
    );
  });

  it('detects duplicate 21c drafts with identical subjects', () => {
    const a = {
      businessName: '21c Museum Hotels',
      subject: 'Date Night Collaboration with 21c Museum Hotels',
      body: 'Your gallery-forward hotel would be perfect for a KC staycation feature.',
      angleFamily: 'hotel_staycation',
    };
    const b = {
      ...a,
      body: 'Different body text that should still count as duplicate when the subject matches.',
    };
    assert.equal(isNearDuplicateDraft(a, b), true);
  });

  it('requires traceable angle explanations', () => {
    const angle = evaluateAngleForInventory(
      baseItem({
        title: 'Corvino — chef tasting menus & supper club date nights',
        category: 'luxury_dining',
        summary: 'Chef tasting menu with premium dining room.',
        flags: { ...baseItem().flags, dining: true, luxury: true, dateNight: true },
      }),
    );
    assert.ok(angle.explanation.length > 0);
    assert.notEqual(angle.pitchAngle, 'NO VALID ANGLE');
  });
});

describe('no valid angle blocks draft creation', () => {
  it('returns no_valid_angle for promotion records', () => {
    const item = baseItem({
      title: 'Clearance sale: buy 5 or more items',
      businessName: 'Clearance sale: buy 5 or more items',
    });
    const angle = evaluateAngleForInventory(item);
    assert.equal(angle.family, 'no_valid_angle');
    assert.equal(angle.valid, false);
  });
});
