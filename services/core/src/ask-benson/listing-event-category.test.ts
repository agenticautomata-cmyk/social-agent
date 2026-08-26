import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTING_EVENT_CATEGORIES,
  resolveListingEventCategory,
} from './listing-event-category.js';

describe('listing-event-category authority', () => {
  it('OSC: The Reunion Hosted By DJ DOT WAV is Nightlife / Music, not Cooking', () => {
    const result = resolveListingEventCategory({
      title: 'The Reunion Hosted By DJ DOT WAV',
      description:
        'A family reunion-inspired day party celebrating community, culture, and connection through the sounds of Motown, Soul, Funk, Disco, R&B, and New Jack Swing.',
      sourceCategory: 'Cooking',
      tags: ['cooking', 'food'],
      venueName: 'Outsiders Social Club',
      listingCategory: 'Food & Drink',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.nightlifeMusic);
    assert.equal(result.source, 'title');
    assert.notEqual(result.category, LISTING_EVENT_CATEGORIES.cooking);
  });

  it('OSC: Rob Tribb Live Music is Music / Live Music', () => {
    const result = resolveListingEventCategory({
      title: 'Rob Tribb Live Music',
      description:
        'Come experience the best of live R&B at Rob Tribb R&B Wednesday w/ Live Band.',
      sourceCategory: 'Cooking',
      venueName: 'Outsiders Social Club',
      listingCategory: 'Cooking',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.liveMusic);
  });

  it('OSC: Fusion Fest is Festival unless stronger event-type evidence exists', () => {
    const result = resolveListingEventCategory({
      title: 'Fusion Fest',
      description: 'A From Africa With Love Production. Third Friday of every month.',
      sourceCategory: 'local_event',
      venueName: 'Outsiders Social Club',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.festival);
  });

  it('real cooking-class fixture is Cooking', () => {
    const result = resolveListingEventCategory({
      title: 'KC Cookbook Club',
      description:
        'A community cookbook club where food lovers gather to cook, share dishes, discover new recipes, and connect over great food and conversation.',
      sourceCategory: 'event',
      venueName: 'Outsiders Social Club',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.cooking);
  });

  it('ambiguous event stays Event, not invented specificity', () => {
    const result = resolveListingEventCategory({
      title: 'Connected',
      description: 'Our most open and social night — every second Friday of the month.',
      sourceCategory: 'Cooking',
      tags: ['cooking'],
      venueName: 'Outsiders Social Club',
      listingCategory: 'Food & Drink',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.event);
    assert.equal(result.confidence, 'low');
  });

  it('The Perfect Date Night is Date Night from title evidence', () => {
    const result = resolveListingEventCategory({
      title: 'The Perfect Date Night',
      description: 'A relaxed, connection-forward night for solos, couples, and first dates.',
      listingCategory: 'Cooking',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.dateNight);
  });

  it('food tasting is Food & Drink, not Cooking', () => {
    const result = resolveListingEventCategory({
      title: 'Summer Menu Tasting',
      description: 'A food tasting with the chef’s new dinner menu.',
      venueName: 'Outsiders Social Club',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.foodDrink);
  });

  it('sibling cooking event does not bleed onto DJ/music events from the same listing', () => {
    const listingCategory = 'Cooking';
    const venueName = 'Outsiders Social Club';
    const reunion = resolveListingEventCategory({
      title: 'The Reunion Hosted By DJ DOT WAV',
      description: 'Day party with DJ DOT WAV.',
      sourceCategory: 'Cooking',
      listingCategory,
      venueName,
    });
    const cookbook = resolveListingEventCategory({
      title: 'Weeknight Cooking Class',
      description: 'Hands-on cooking class and chef demo with a recipe workshop.',
      sourceCategory: 'Cooking',
      listingCategory,
      venueName,
    });
    const trib = resolveListingEventCategory({
      title: 'Rob Tribb Live Music',
      sourceCategory: 'Cooking',
      listingCategory,
      venueName,
    });
    assert.equal(reunion.category, LISTING_EVENT_CATEGORIES.nightlifeMusic);
    assert.equal(cookbook.category, LISTING_EVENT_CATEGORIES.cooking);
    assert.equal(trib.category, LISTING_EVENT_CATEGORIES.liveMusic);
  });

  it('does not guess Cooking merely because the venue serves food or drinks', () => {
    const result = resolveListingEventCategory({
      title: 'Office Hours: Ft Shaan Domo',
      description: 'A live-session experience. Grab a drink, settle in, and enjoy the music up close.',
      venueName: 'Outsiders Social Club Kitchen & Bar',
      listingCategory: 'Food & Drink',
      sourceCategory: 'dining',
    });
    assert.equal(result.category, LISTING_EVENT_CATEGORIES.event);
    assert.notEqual(result.category, LISTING_EVENT_CATEGORIES.cooking);
    assert.notEqual(result.category, LISTING_EVENT_CATEGORIES.foodDrink);
  });
});
