import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOpeningDateLanguage } from './dates.js';
import {
  businessKeysLikelySame,
  buildLocationKey,
  normalizeOpeningBusinessKey,
} from './identity.js';
import { mergeLifecycleStatus } from './lifecycle.js';
import { isOpeningRoundupDocument, parseOpeningRoundup } from './parse-roundup.js';
import { decideEventPromotion, decideOpportunityPromotion } from './promote.js';
import {
  BIG_LIST_EXPECTED_NAMES,
  BIG_LIST_FIXTURE_TEXT,
  BIG_LIST_SUBJECT,
} from './fixtures/big-list.js';
import type { ParsedOpeningEntry } from './types.js';

describe('openings radar roundup parser', () => {
  it('extracts ten distinct establishments from BIG LIST fixture', () => {
    const entries = parseOpeningRoundup({
      subject: BIG_LIST_SUBJECT,
      text: BIG_LIST_FIXTURE_TEXT,
      publicationYear: 2026,
    });
    assert.equal(entries.length, 10, `expected 10 got ${entries.length}: ${entries.map((e) => e.businessName).join('; ')}`);
    for (const expected of BIG_LIST_EXPECTED_NAMES) {
      const hit = entries.find((e) =>
        normalizeOpeningBusinessKey(e.businessName).includes(
          normalizeOpeningBusinessKey(expected).split(' ').slice(0, 2).join(' '),
        ),
      );
      assert.ok(hit, `missing ${expected}`);
    }
  });

  it('keeps approximate dates honest', () => {
    const entries = parseOpeningRoundup({
      subject: BIG_LIST_SUBJECT,
      text: BIG_LIST_FIXTURE_TEXT,
      publicationYear: 2026,
    });
    const alice = entries.find((e) => /alice scooper/i.test(e.businessName));
    assert.ok(alice);
    assert.equal(alice!.estimatedOpening.label, 'opening soon');
    assert.equal(alice!.estimatedOpening.exactDate, null);

    const charlie = entries.find((e) => /charlie/i.test(e.businessName));
    assert.ok(charlie);
    assert.match(charlie!.estimatedOpening.label ?? '', /mid-October/i);
    assert.equal(charlie!.estimatedOpening.exactDate, null);

    const fleet = entries.find((e) => /fleet feet/i.test(e.businessName));
    assert.ok(fleet);
    assert.match(fleet!.estimatedOpening.label ?? '', /early November/i);
    assert.equal(fleet!.estimatedOpening.exactDate, null);

    const blurred = entries.find((e) => /blurred/i.test(e.businessName));
    assert.ok(blurred);
    assert.match(blurred!.estimatedOpening.label ?? '', /Halloween/i);
    assert.equal(blurred!.estimatedOpening.exactDate, null);
  });

  it('captures exact dates, soft+grand, relocation, former tenant, expansion', () => {
    const entries = parseOpeningRoundup({
      subject: BIG_LIST_SUBJECT,
      text: BIG_LIST_FIXTURE_TEXT,
      publicationYear: 2026,
    });
    const badCat = entries.find((e) => /bad cat/i.test(e.businessName));
    assert.equal(badCat!.estimatedOpening.exactDate, '2026-09-25');

    const bam = entries.find((e) => /bam bird/i.test(e.businessName));
    assert.equal(bam!.status, 'grand_opening_scheduled');
    assert.equal(bam!.grandOpening.exactDate, '2026-10-03');
    assert.ok(bam!.isLocalIndependent);

    const donut = entries.find((e) => /donutology/i.test(e.businessName));
    assert.ok(donut!.relocationStatus);
    assert.match(donut!.formerLocation ?? donut!.relocationStatus ?? '', /Westport/i);

    const boutique = entries.find((e) => /boutique/i.test(e.businessName));
    assert.match(boutique!.formerTenant ?? '', /Rock/i);

    const angry = entries.find((e) => /angry chickz/i.test(e.businessName));
    assert.ok(angry!.expansionStatus || angry!.additionalLocationsPlanned);
  });

  it('parses addresses with suites and cities', () => {
    const entries = parseOpeningRoundup({
      subject: BIG_LIST_SUBJECT,
      text: BIG_LIST_FIXTURE_TEXT,
      publicationYear: 2026,
    });
    const bam = entries.find((e) => /bam bird/i.test(e.businessName))!;
    assert.match(bam.streetAddress ?? '', /1512/i);
    assert.equal(bam.suite, 'C');
    assert.match(bam.city ?? '', /Blue Springs/i);

    const fleet = entries.find((e) => /fleet feet/i.test(e.businessName))!;
    assert.equal(fleet.suite, 'B');
    assert.match(fleet.neighborhood ?? '', /Brookside/i);
  });

  it('does not invent contacts or exact dates from vague language', () => {
    const vague = parseOpeningDateLanguage('opening soon', 2026);
    assert.equal(vague.exactDate, null);
    assert.equal(vague.precision, 'vague');

    const mid = parseOpeningDateLanguage('planned mid-October opening', 2026);
    assert.equal(mid.exactDate, null);
    assert.equal(mid.precision, 'approximate');

    const monthYear = parseOpeningDateLanguage('November 2026', 2026);
    assert.equal(monthYear.exactDate, null);
    assert.equal(monthYear.precision, 'approximate');
    assert.match(monthYear.label ?? '', /November 2026/i);
  });

  it('rejects non-opening editorial prose', () => {
    const entries = parseOpeningRoundup({
      subject: 'Chef Spotlight: Panino Divino',
      text: 'Q&A with the owner of the new operation on 39th Street. He loves pasta.',
    });
    assert.equal(entries.length, 0);
  });

  it('handles malformed list entries without crashing', () => {
    const entries = parseOpeningRoundup({
      subject: 'Openings list',
      text: '1. \n2. ???\n3. Real Place\n   - 100 Main St.\n   - opening soon',
      publicationYear: 2026,
    });
    assert.ok(entries.length >= 1);
    assert.ok(entries.every((e) => e.businessName.length >= 2));
  });

  it('detects opening roundup documents', () => {
    assert.equal(isOpeningRoundupDocument(BIG_LIST_SUBJECT, BIG_LIST_FIXTURE_TEXT), true);
    assert.equal(isOpeningRoundupDocument('Weather alert', 'Heat advisory for KC'), false);
  });
});

describe('openings radar identity', () => {
  it('dedupes Charlie D name variants', () => {
    assert.ok(businessKeysLikelySame("Charlie D's", "Charlie Ds"));
    assert.ok(businessKeysLikelySame("Charlie D's", "Charlie D's Seafood and Chicken"));
  });

  it('keeps separate branches for same brand', () => {
    const a = buildLocationKey({
      businessName: 'Angry Chickz',
      streetAddress: '14995 W. 119th St.',
      city: 'Olathe',
    });
    const b = buildLocationKey({
      businessName: 'Angry Chickz',
      streetAddress: '100 Main St.',
      city: 'Kansas City',
    });
    assert.notEqual(a, b);
  });
});

describe('openings radar promotion', () => {
  function entry(partial: Partial<ParsedOpeningEntry>): ParsedOpeningEntry {
    return {
      businessName: 'Test Biz',
      parentBrand: null,
      isLocalIndependent: null,
      isChain: null,
      category: 'restaurants',
      description: null,
      streetAddress: '100 Main St.',
      suite: null,
      city: 'Kansas City',
      state: 'MO',
      zip: null,
      neighborhood: null,
      status: 'announced',
      estimatedOpening: { label: 'opening soon', exactDate: null, precision: 'vague' },
      grandOpening: { label: null, exactDate: null, precision: 'unknown' },
      softOpening: { label: null, exactDate: null, precision: 'unknown' },
      relocationStatus: null,
      expansionStatus: null,
      formerLocation: null,
      formerTenant: null,
      additionalLocationsPlanned: null,
      evidenceText: 'Test Biz opening soon at 100 Main St.',
      confidence: 0.8,
      fieldConfidence: {},
      ...partial,
    };
  }

  it('promotes distinctive local openings to opportunities', () => {
    const d = decideOpportunityPromotion(
      entry({
        businessName: 'Bam Bird Social',
        isLocalIndependent: true,
        category: 'entertainment',
        status: 'grand_opening_scheduled',
        grandOpening: { label: 'October 3, 2026', exactDate: '2026-10-03', precision: 'exact' },
        evidenceText: 'locally owned Mahjong grand opening October 3, 2026',
      }),
    );
    assert.equal(d.shouldCreate, true);
  });

  it('retains thin undated chain openings on radar without auto-opportunity', () => {
    const d = decideOpportunityPromotion(
      entry({
        businessName: 'Generic Chain',
        isChain: true,
        category: null,
        streetAddress: null,
        city: null,
        estimatedOpening: { label: null, exactDate: null, precision: 'unknown' },
        evidenceText: 'Generic Chain is expanding',
      }),
    );
    assert.equal(d.shouldCreate, false);
    assert.match(d.reason, /chain_insufficient_creator_value|insufficient_signals/);
  });

  it('allows dated chain expansions when creator-value signals are present', () => {
    const d = decideOpportunityPromotion(
      entry({
        businessName: 'Bojangles',
        isChain: true,
        category: 'restaurants',
        estimatedOpening: { label: 'November 10, 2026', exactDate: '2026-11-10', precision: 'exact' },
        evidenceText: 'Bojangles Nov. 10th opening at 12005 Metcalf Ave., Overland Park',
      }),
    );
    assert.equal(d.shouldCreate, true);
    assert.match(d.reason, /dated_chain_expansion|local_location/);
  });

  it('creates Event only for dated public occasions', () => {
    const grand = decideEventPromotion(
      entry({
        businessName: 'Bam Bird Social',
        grandOpening: { label: 'October 3, 2026', exactDate: '2026-10-03', precision: 'exact' },
        evidenceText: 'grand opening October 3, 2026',
      }),
    );
    assert.equal(grand.shouldCreate, true);
    assert.equal(grand.eventDate, '2026-10-03');

    const mid = decideEventPromotion(
      entry({
        businessName: 'Donutology',
        grandOpening: { label: 'mid-October 2026', exactDate: null, precision: 'approximate' },
        evidenceText: 'planned mid-October grand opening',
      }),
    );
    assert.equal(mid.shouldCreate, false);

    const projected = decideEventPromotion(
      entry({
        businessName: 'Bojangles',
        estimatedOpening: { label: 'November 10, 2026', exactDate: '2026-11-10', precision: 'exact' },
        evidenceText: 'planned opening November 10, 2026',
      }),
    );
    assert.equal(projected.shouldCreate, false);

    const badCat = decideEventPromotion(
      entry({
        businessName: 'The Bad Cat',
        category: 'bars/nightlife',
        estimatedOpening: { label: 'September 25, 2026', exactDate: '2026-09-25', precision: 'exact' },
        evidenceText: 'The Bad Cat, jazz bar, plans to open on Sept. 25',
      }),
    );
    assert.equal(badCat.shouldCreate, false);
    assert.match(badCat.reason, /projected_open_date_not_public_event/);
  });

  it('merges lifecycle without destroying history semantics', () => {
    assert.equal(mergeLifecycleStatus('announced', 'soft_open'), 'soft_open');
    assert.equal(mergeLifecycleStatus('soft_open', 'grand_opening_scheduled'), 'grand_opening_scheduled');
    assert.equal(mergeLifecycleStatus('opening_soon', 'delayed'), 'delayed');
  });
});

describe('openings radar facebook-style caption', () => {
  it('splits inline numbered Facebook BIG LIST caption into ten businesses', () => {
    const caption = `The BIG LIST: Who's Opening, Where & When Reporter note: I'm building my list. I will keep a running list on my KCinsiders Substack. 1. Alice Scooper's Ice Cream Co., 906 W. 39th St., opening soon. 2. Angry Chickz, 14995 W. 119th St., Olathe. November opening. Other area locations are pending. 3. The Bad Cat, jazz bar, 1220 W. 103rd St., plans to open on Sept. 25. 4. Bam Bird Social, locally-owned Mah Jongg event center, 1512 N.W. Mock Ave., Suite C, Blue Springs. It has softly opened but the grand opening is Oct. 3. 5. Blurred Bar, Westport, 4149 Pennsylvania Ave., izakaya-style bar. Halloween weekend opening. 6. Bojangles, 12005 Metcalf Ave., Overland Park. Nov. 10th opening. 7. Boutique Collective - The Vine, Prairiefire, 5701 W. 135th St., Overland Park. Opening soon. 8. Charlie D's Seafood and Chicken, 1124 Oak St. Mid-October. 9. Donutology, Crown Center, 2450 Grand Blvd., Suite 121. Mid-October grand opening. 10. Fleet Feet, Brookside, 314 W. 63rd St., Suite B. Look for an early November opening.`;
    assert.equal(isOpeningRoundupDocument("The BIG LIST: Who's Opening, Where & When", caption), true);
    const entries = parseOpeningRoundup({
      subject: "The BIG LIST: Who's Opening, Where & When",
      text: caption,
      publicationYear: 2026,
    });
    assert.equal(entries.length, 10, entries.map((e) => e.businessName).join('; '));
    const donut = entries.find((e) => /donutology/i.test(e.businessName));
    assert.ok(donut);
    assert.equal(donut!.grandOpening.exactDate, null);
    assert.match(donut!.grandOpening.label ?? '', /mid-October/i);
  });
});
