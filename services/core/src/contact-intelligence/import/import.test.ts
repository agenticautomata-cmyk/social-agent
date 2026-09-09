import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  namesLikelySameBusiness,
  resolveOrgAlias,
  significantNameTokens,
} from './org-aliases.js';
import {
  buildOutreachImportKey,
  buildProgramImportKey,
  loadWorkbookFixture,
  mapProgramKind,
  mapRouteToChannel,
  normalizeEmail,
} from './normalize.js';
import {
  buildOutreachProvenance,
  parseProvenanceFromNotes,
  upsertProvenanceNotes,
} from './provenance.js';
import { matchOutreachToDb, summarizeBuckets } from './match.js';
import type { DbContactSnapshot, OutreachWorkbookRow } from './types.js';

describe('org aliases', () => {
  it('merges Visit KC name variants to one orgKey', () => {
    const a = resolveOrgAlias({ businessName: 'Visit KC' });
    const b = resolveOrgAlias({ businessName: 'Visit Kansas City' });
    assert.equal(a.orgKey, 'visit-kc');
    assert.equal(b.orgKey, 'visit-kc');
    assert.equal(a.canonicalName, 'Visit KC');
  });

  it('merges by email domain (Starlight)', () => {
    const r = resolveOrgAlias({
      businessName: 'Starlight',
      email: 'rachel.bliss@kcstarlight.com',
    });
    assert.equal(r.orgKey, 'starlight-theatre');
    assert.equal(r.canonicalName, 'Starlight Theatre');
  });

  it('keeps Hotel Kansas City distinct from 21c', () => {
    const hotel = resolveOrgAlias({ businessName: 'Hotel Kansas City' });
    const c21 = resolveOrgAlias({ businessName: '21c Museum Hotel Kansas City' });
    assert.equal(hotel.orgKey, 'hotel-kansas-city');
    assert.equal(c21.orgKey, '21c-museum-hotel-kc');
    assert.notEqual(hotel.orgKey, c21.orgKey);
  });

  it('does not merge Kansas Tourism into Legends Outlets via soft name overlap', () => {
    assert.equal(namesLikelySameBusiness('Kansas Tourism', 'Legends Outlets Kansas City'), false);
    assert.equal(namesLikelySameBusiness('21c Museum Hotel Kansas City', 'Hotel Kansas City'), false);
  });

  it('does not attach travelks.com listing pages to Kansas Tourism for unrelated names', () => {
    const legends = resolveOrgAlias({
      businessName: 'Legends Outlets Kansas City',
      email: 'info@legendsshopping.com',
      websiteOrSourceUrl:
        'https://www.travelks.com/listing/legendary-kansans-at-legends-outlets-kansas-city/26509/',
    });
    assert.notEqual(legends.orgKey, 'kansas-tourism');

    const tourism = resolveOrgAlias({
      businessName: 'Kansas Tourism',
      email: 'colby.sharplesterry@ks.gov',
      websiteOrSourceUrl: 'https://www.travelks.com/media/',
    });
    assert.equal(tourism.orgKey, 'kansas-tourism');
  });

  it('drops short metro filler from significant tokens', () => {
    const tokens = significantNameTokens('Kansas City Zoo & Aquarium');
    assert.ok(tokens.has('aquarium') || tokens.has('zoo'));
    assert.equal(tokens.has('kansas'), false);
    assert.equal(tokens.has('city'), false);
  });
});

describe('route mapping', () => {
  it('maps named media email to verified_named_decision_maker', () => {
    const row: OutreachWorkbookRow = {
      establishment: 'Visit KC',
      category: null,
      area: null,
      contact: 'Devin Aaron',
      titleDesk: 'National & International Communications',
      email: 'daaron@visitkc.com',
      phone: null,
      routeType: 'Direct media email',
      bestUse: null,
      confidence: 'High',
      sourceUrl: 'https://www.visitkc.com/media-center/contact-us/',
      notes: null,
      sheetRow: 1,
    };
    const mapped = mapRouteToChannel(row);
    assert.equal(mapped.channelConcept, 'named_decision_maker');
    assert.equal(mapped.proposedEvidenceState, 'verified_named_decision_maker');
  });

  it('maps media@ without name to verified_role_inbox', () => {
    const mapped = mapRouteToChannel({
      establishment: 'Crossroads Hotel',
      category: 'Hotel',
      area: null,
      contact: null,
      titleDesk: 'Media',
      email: 'media@crossroadshotelkc.com',
      phone: null,
      routeType: 'Direct media email',
      bestUse: null,
      confidence: 'High',
      sourceUrl: 'https://crossroadshotelkc.com/history-and-about/contact/',
      notes: null,
      sheetRow: 2,
    });
    assert.equal(mapped.proposedEvidenceState, 'verified_role_inbox');
  });

  it('maps affiliate application without email to official_contact_form', () => {
    const mapped = mapRouteToChannel({
      establishment: 'KC Dresses',
      category: null,
      area: null,
      contact: null,
      titleDesk: 'Affiliate team',
      email: null,
      phone: null,
      routeType: 'Affiliate application',
      bestUse: null,
      confidence: 'High',
      sourceUrl: 'https://kcdresses.com/pages/affiliate-collaboration-programs',
      notes: null,
      sheetRow: 3,
    });
    assert.equal(mapped.channelConcept, 'affiliate_application');
    assert.equal(mapped.proposedEvidenceState, 'official_contact_form');
  });
});

describe('program kind mapping', () => {
  it('classifies hosted / media / affiliate kinds', () => {
    assert.equal(mapProgramKind('Hosted destination coordination'), 'hosted_visit');
    assert.equal(mapProgramKind('Media access'), 'media_access');
    assert.equal(mapProgramKind('Affiliate'), 'affiliate');
    assert.equal(mapProgramKind('Affiliate / creator collaboration'), 'creator_program');
    assert.equal(mapProgramKind('Consumer rewards / content hook'), 'consumer_rewards');
  });
});

describe('provenance', () => {
  it('round-trips provenance in notes and marks permanentVerification false', () => {
    const row: OutreachWorkbookRow = {
      establishment: 'The Brim',
      category: null,
      area: null,
      contact: null,
      titleDesk: 'Media',
      email: 'media@thebrimkc.com',
      phone: null,
      routeType: 'Direct media email',
      bestUse: null,
      confidence: 'High',
      sourceUrl: 'https://www.thebrimkc.com/copy-of-links',
      notes: 'podcast ok',
      sheetRow: 10,
    };
    const importKey = buildOutreachImportKey(row);
    const prov = buildOutreachProvenance({
      row,
      importKey,
      workbookFileName: 'Kansas_City_PR_Affiliate_Directory.xlsx',
      checkedDate: '2026-09-08',
      channelConcept: 'role_inbox',
      proposedEvidenceState: 'verified_role_inbox',
      importedAt: '2026-09-09T00:00:00.000Z',
    });
    assert.equal(prov.permanentVerification, false);
    assert.equal(prov.verificationMethod, 'workbook_import');
    assert.equal(prov.confidence, 'High');

    const notes = upsertProvenanceNotes('Operator note stays', prov);
    assert.match(notes, /Operator note stays/);
    const parsed = parseProvenanceFromNotes(notes);
    assert.ok(parsed);
    assert.equal(parsed!.importKey, importKey);
    assert.equal(parsed!.permanentVerification, false);

    const again = upsertProvenanceNotes(notes, { ...prov, importedAt: '2026-09-09T01:00:00.000Z' });
    assert.equal(parseProvenanceFromNotes(again)?.importedAt, '2026-09-09T01:00:00.000Z');
    assert.equal((again.match(/\[\[benson-contact-import:v1\]\]/g) ?? []).length, 1);
  });

  it('builds stable idempotent import keys', () => {
    const row: OutreachWorkbookRow = {
      establishment: 'Visit KC',
      category: null,
      area: null,
      contact: 'Devin Aaron',
      titleDesk: null,
      email: 'daaron@visitkc.com',
      phone: null,
      routeType: 'Direct media email',
      bestUse: null,
      confidence: 'High',
      sourceUrl: null,
      notes: null,
      sheetRow: 1,
    };
    assert.equal(
      buildOutreachImportKey(row),
      'kc-pr-dir:2026-09-08:visit-kc:email:daaron@visitkc.com',
    );
    assert.match(buildProgramImportKey({
      program: 'KC Cattle Company via Awin',
      type: 'Affiliate',
      benefitPay: '10%',
      requirements: null,
      sourceUrl: 'https://ui.awin.com/merchant-profile/117705',
      howToUse: null,
      sheetRow: 1,
    }), /^kc-pr-dir-program:2026-09-08:url:/);
  });
});

describe('match buckets', () => {
  it('classifies equivalent / conflicting / new without soft false positives', () => {
    const bundle = loadWorkbookFixture({
      meta: {
        workbookFileName: 'Kansas_City_PR_Affiliate_Directory.xlsx',
        checkedDate: '2026-09-08',
        sheets: ['Outreach Directory', 'Programs'],
      },
      outreach: [
        {
          Establishment: 'Crossroads Hotel',
          Email: 'media@crossroadshotelkc.com',
          Contact: null,
          'Title / Desk': 'Media',
          'Route Type': 'Direct media email',
          Confidence: 'High',
          'Source URL': 'https://crossroadshotelkc.com/history-and-about/contact/',
        },
        {
          Establishment: 'Starlight',
          Email: 'rachel.bliss@kcstarlight.com',
          Contact: 'Rachel Bliss',
          'Title / Desk': 'Director of Marketing',
          'Route Type': 'Direct marketing email',
          Confidence: 'High',
          'Source URL': 'https://www.kcstarlight.com/about-starlight/newsroom/',
        },
        {
          Establishment: 'Kansas Tourism',
          Email: 'colby.sharplesterry@ks.gov',
          Contact: 'Colby Sharples-Terry',
          'Route Type': 'Direct PR email',
          Confidence: 'High',
          'Source URL': 'https://www.travelks.com/media/',
        },
        {
          Establishment: 'Visit KC',
          Email: 'daaron@visitkc.com',
          Contact: 'Devin Aaron',
          'Route Type': 'Direct media email',
          Confidence: 'High',
          'Source URL': 'https://www.visitkc.com/media-center/contact-us/',
        },
      ],
      programs: [],
    });

    const db: DbContactSnapshot[] = [
      {
        id: 'c1',
        businessName: 'Crossroads Hotel',
        contactName: null,
        email: 'media@crossroadshotelkc.com',
        phone: null,
        website: null,
        contactEvidenceState: 'verified_role_inbox',
        evidenceUrl: 'https://crossroadshotelkc.com/history-and-about/contact/',
        contactFormUrl: null,
        contactRole: 'Media',
        notes: null,
        mergedIntoId: null,
        evidenceCapturedAt: '2026-09-08T12:00:00.000Z',
        lastRecheckedAt: null,
        verificationMethod: null,
      },
      {
        id: 'c2',
        businessName: 'Starlight Theatre',
        contactName: null,
        email: 'help@kcstarlight.com',
        phone: null,
        website: null,
        contactEvidenceState: 'inferred_unverified',
        evidenceUrl: null,
        contactFormUrl: null,
        contactRole: null,
        notes: null,
        mergedIntoId: null,
        evidenceCapturedAt: null,
        lastRecheckedAt: null,
        verificationMethod: null,
      },
      {
        id: 'c3',
        businessName: 'Legends Outlets Kansas City',
        contactName: null,
        email: 'info@legendsshopping.com',
        phone: null,
        website: null,
        contactEvidenceState: 'inferred_unverified',
        evidenceUrl: null,
        contactFormUrl: null,
        contactRole: null,
        notes: null,
        mergedIntoId: null,
        evidenceCapturedAt: null,
        lastRecheckedAt: null,
        verificationMethod: null,
      },
    ];

    const matches = matchOutreachToDb(bundle, db);
    const byEst = Object.fromEntries(matches.map((m) => [m.row.establishment, m]));
    assert.equal(byEst['Crossroads Hotel']!.bucket, 'equivalent');
    // Named PR contact vs an existing unnamed help@ at the same org is a NEW contact row,
    // not a conflict — do not overwrite or quarantine the general inbox.
    assert.equal(byEst['Starlight']!.bucket, 'new');
    assert.equal(byEst['Kansas Tourism']!.bucket, 'new'); // must NOT match Legends
    assert.equal(byEst['Visit KC']!.bucket, 'new');
    assert.deepEqual(summarizeBuckets(matches), {
      equivalent: 1,
      new: 3,
    });
  });

  it('flags same named person with a different email as conflicting', () => {
    const bundle = loadWorkbookFixture({
      meta: {
        workbookFileName: 'Kansas_City_PR_Affiliate_Directory.xlsx',
        checkedDate: '2026-09-08',
        sheets: ['Outreach Directory'],
      },
      outreach: [
        {
          Establishment: 'Starlight Theatre',
          Email: 'rachel.bliss@kcstarlight.com',
          Contact: 'Rachel Bliss',
          'Title / Desk': 'Director of Marketing',
          'Route Type': 'Direct marketing email',
          Confidence: 'High',
          'Source URL': 'https://www.kcstarlight.com/about-starlight/newsroom/',
        },
      ],
      programs: [],
    });
    const db: DbContactSnapshot[] = [
      {
        id: 'c2',
        businessName: 'Starlight Theatre',
        contactName: 'Rachel Bliss',
        email: 'help@kcstarlight.com',
        phone: null,
        website: null,
        contactEvidenceState: 'inferred_unverified',
        evidenceUrl: null,
        contactFormUrl: null,
        contactRole: 'Director of Marketing',
        notes: null,
        mergedIntoId: null,
        evidenceCapturedAt: null,
        lastRecheckedAt: null,
        verificationMethod: null,
      },
    ];
    const [match] = matchOutreachToDb(bundle, db);
    assert.equal(match!.bucket, 'conflicting');
    assert.match(match!.conflictNotes[0]!, /email:/);
  });
});

describe('normalize helpers', () => {
  it('normalizes emails', () => {
    assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
    assert.equal(normalizeEmail('not-an-email'), null);
  });
});
