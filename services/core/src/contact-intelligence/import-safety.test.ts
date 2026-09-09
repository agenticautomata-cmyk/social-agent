/**
 * Import / recommendation safety tests for KC contact intelligence.
 * No email, Telegram, or form submission.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateContactEvidence } from '../partnership-contracts/contact-evidence.js';
import { evaluateEmailFormatInference } from './discovery/email-inference.js';
import {
  buildOutreachImportKey,
  loadWorkbookFixture,
  mapRouteToChannel,
} from './import/normalize.js';
import { matchOutreachToDb, summarizeBuckets } from './import/match.js';
import { resolveOrgAlias } from './import/org-aliases.js';
import {
  askFromBestUse,
  routeTypeFromChannel,
} from './route-map.js';
import {
  MEDIA_ACCESS_DEFAULT_DISCLAIMER,
  normalizeCompensationForRoute,
} from './labels.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('kc contact intelligence import safety', () => {
  const fixturePath = resolve(
    process.cwd(),
    '../../docs/ops/fixtures/kc-pr-affiliate-directory-2026-09-08.json',
  );
  const bundle = loadWorkbookFixture(JSON.parse(readFileSync(fixturePath, 'utf8')));

  it('loads 48 outreach + 10 program rows', () => {
    assert.equal(bundle.outreach.length, 48);
    assert.equal(bundle.programs.length, 10);
    assert.equal(bundle.meta.checkedDate, '2026-09-08');
  });

  it('never invents emails — only workbook addresses', () => {
    for (const row of bundle.outreach) {
      if (row.email) assert.match(row.email, /@/);
      if (row.contact && !row.email) {
        const guessed = evaluateEmailFormatInference({
          email: `${row.contact.split(' ')[0]?.toLowerCase()}@example.com`,
          personName: row.contact,
          observedOnOfficialPage: false,
        });
        assert.equal(guessed.allowed, false);
      }
    }
  });

  it('refuses first.last guess patterns', () => {
    const verdict = evaluateEmailFormatInference({
      email: 'jane.doe@hotel.example',
      personName: 'Jane Doe',
      observedOnOfficialPage: false,
    });
    assert.equal(verdict.allowed, false);
  });

  it('maps Visit KC named contacts to verified_named_decision_maker', () => {
    const row = bundle.outreach.find((r) => r.email === 'daaron@visitkc.com');
    assert.ok(row);
    const mapped = mapRouteToChannel(row!);
    assert.equal(mapped.proposedEvidenceState, 'verified_named_decision_maker');
    assert.equal(mapped.channelConcept, 'named_decision_maker');
  });

  it('maps form-only routes to official_contact_form (not emailable)', () => {
    const row = bundle.outreach.find((r) => /form/i.test(r.routeType ?? '') && !r.email);
    assert.ok(row);
    const mapped = mapRouteToChannel(row!);
    assert.equal(mapped.proposedEvidenceState, 'official_contact_form');
    const verdict = evaluateContactEvidence({
      state: mapped.proposedEvidenceState,
      email: null,
      contactFormUrl: row!.sourceUrl,
      evidenceUrl: row!.sourceUrl,
      sourceIsOfficial: true,
      evidenceCapturedAt: '2026-09-08T12:00:00.000Z',
      verificationMethod: 'workbook_import',
    });
    assert.equal(verdict.emailSendAllowed, false);
    assert.equal(verdict.deliveryChannel, 'official_form');
  });

  it('keeps two Visit KC emails as separate import keys', () => {
    const a = bundle.outreach.find((r) => r.email === 'daaron@visitkc.com')!;
    const b = bundle.outreach.find((r) => r.email === 'mwolters@visitkc.com')!;
    assert.notEqual(buildOutreachImportKey(a), buildOutreachImportKey(b));
    const matches = matchOutreachToDb(bundle, []);
    const visit = matches.filter((m) => m.orgKey === 'visit-kc');
    assert.equal(visit.length, 2);
    assert.ok(visit.every((m) => m.bucket === 'new'));
  });

  it('does not merge Visit KC with Visit KCK', () => {
    const a = resolveOrgAlias({ businessName: 'Visit KC', email: 'daaron@visitkc.com' });
    const b = resolveOrgAlias({
      businessName: 'Visit Kansas City Kansas',
      email: 'ritz@visitkansascityks.com',
    });
    assert.notEqual(a.orgKey, b.orgKey);
  });

  it('classifies same-person email clash as conflicting', () => {
    const row = bundle.outreach.find((r) => r.email === 'rachel.bliss@kcstarlight.com')!;
    const matches = matchOutreachToDb(bundle, [
      {
        id: 'db-1',
        businessName: 'Starlight Theatre',
        contactName: 'Rachel Bliss',
        email: 'help@kcstarlight.com',
        phone: null,
        website: 'https://www.kcstarlight.com',
        contactEvidenceState: 'official_general_inbox',
        evidenceUrl: null,
        contactFormUrl: null,
        contactRole: 'Public Relations Manager',
        notes: null,
        mergedIntoId: null,
        evidenceCapturedAt: '2026-01-01T00:00:00.000Z',
        lastRecheckedAt: null,
        verificationMethod: null,
      },
    ]);
    const hit = matches.find((m) => m.importKey === buildOutreachImportKey(row));
    assert.equal(hit?.bucket, 'conflicting');
  });

  it('summarizeBuckets counts rows', () => {
    const matches = matchOutreachToDb(bundle, []);
    const counts = summarizeBuckets(matches);
    assert.equal(counts.new, 48);
  });
});

describe('kc recommendation / ask safety', () => {
  it('never labels media access as paid', () => {
    assert.equal(normalizeCompensationForRoute('media_access', 'paid'), 'media_access_not_paid');
    const ask = askFromBestUse('Media access / credentials', 'media_access');
    assert.equal(ask.askType, 'event_credential');
    assert.equal(ask.compensation, 'media_access_not_paid');
    assert.match(ask.askSummary, /not guaranteed/i);
    assert.match(MEDIA_ACCESS_DEFAULT_DISCLAIMER, /not guaranteed/i);
  });

  it('does not treat general inbox as PR named route', () => {
    const route = routeTypeFromChannel('general_inbox', 'General public email', null);
    assert.equal(route, 'general_inbox');
    const ask = askFromBestUse(null, route);
    assert.equal(ask.askType, 'relationship_introduction');
  });

  it('workbook verificationMethod uses tighter staleness for send gate', () => {
    const old = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const v2 = evaluateContactEvidence(
      {
        state: 'verified_named_decision_maker',
        email: 'daaron@visitkc.com',
        personName: 'Devin Aaron',
        representsBusiness: 'Visit KC',
        evidenceUrl: 'https://www.visitkc.com/media-center/contact-us/',
        sourceIsOfficial: true,
        evidenceCapturedAt: old,
        verificationMethod: 'workbook_import',
      },
      'Visit KC',
    );
    assert.equal(v2.staleEvidence, true);
    assert.equal(v2.emailSendAllowed, false);
  });
});
