import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarCategoryFromStored } from './calendar-category.js';

describe('calendarCategoryFromStored — estate_sale authority', () => {
  it('uses estateSaleFlag, not the title', () => {
    assert.equal(
      calendarCategoryFromStored({
        flags: { estateSale: true },
        metadata: {},
      }),
      'estate_sale',
    );
    assert.equal(
      calendarCategoryFromStored({
        metadata: { estateSaleFlag: true },
      }),
      'estate_sale',
    );
  });

  it('uses structured category estate_sale', () => {
    assert.equal(calendarCategoryFromStored({ category: 'estate_sale' }), 'estate_sale');
    assert.equal(
      calendarCategoryFromStored({ metadata: { opportunityCategory: 'estate_sale' } }),
      'estate_sale',
    );
  });

  it('treats luxury_deal + estateSaleFlag as estate sale', () => {
    assert.equal(
      calendarCategoryFromStored({
        category: 'luxury_deal',
        metadata: { estateSaleFlag: true, alsoCategories: ['estate_sale', 'luxury_deal'] },
      }),
      'estate_sale',
    );
  });

  it('uses estate-sales ingest / source type', () => {
    assert.equal(calendarCategoryFromStored({ ingest: 'estate_sales_net_scrape' }), 'estate_sale');
    assert.equal(calendarCategoryFromStored({ sourceType: 'estate_sales_org' }), 'estate_sale');
    assert.equal(calendarCategoryFromStored({ populationSource: 'estate_sales_net' }), 'estate_sale');
  });

  it('groups tag sale / estate auction only when classified', () => {
    assert.equal(
      calendarCategoryFromStored({
        category: 'estate_sale',
        metadata: { title: 'Overland Park tag sale' },
      }),
      'estate_sale',
    );
    assert.equal(
      calendarCategoryFromStored({
        metadata: { opportunityCategory: 'estate_sale' },
      }),
      'estate_sale',
    );
  });
});

describe('calendarCategoryFromStored — does not over-match', () => {
  it('does not classify from title substring alone', () => {
    assert.equal(
      calendarCategoryFromStored({
        metadata: {},
      }),
      null,
    );
    assert.equal(
      calendarCategoryFromStored({
        category: 'community_event',
        metadata: { title: 'Weekend estate sale in Overland Park' },
      }),
      null,
    );
    assert.equal(
      calendarCategoryFromStored({
        category: 'community_event',
        metadata: { title: 'Estate auction and tag sale' },
      }),
      null,
    );
  });

  it('does not sleep vintage / flea / antique / thrift unless classified estate sale', () => {
    assert.equal(calendarCategoryFromStored({ category: 'vintage_market' }), null);
    assert.equal(calendarCategoryFromStored({ category: 'antique_market' }), null);
    assert.equal(calendarCategoryFromStored({ category: 'flea_market' }), null);
    assert.equal(calendarCategoryFromStored({ category: 'thrift_store' }), null);
    assert.equal(
      calendarCategoryFromStored({
        category: 'vintage_market',
        metadata: { title: 'Vintage market with estate finds' },
      }),
      null,
    );
    assert.equal(
      calendarCategoryFromStored({
        category: 'antique_market',
        ingest: 'visitkc',
      }),
      null,
    );
  });

  it('does not treat wine / music events as estate sales', () => {
    assert.equal(
      calendarCategoryFromStored({
        category: 'community_event',
        ingest: 'gmail_discoveries',
      }),
      null,
    );
  });
});
