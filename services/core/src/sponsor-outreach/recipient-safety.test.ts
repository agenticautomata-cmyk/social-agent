import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DO_NOT_CONTACT_ADDRESSES,
  assertRecipientSendable,
  evaluateRecipientSafety,
  findDoNotContactEntry,
  hasReservedTld,
  isReservedDomain,
  looksLikeSyntheticFixture,
  RecipientBlockedError,
} from './recipient-safety.js';
import { contactConfidenceForStatus } from './contact-confidence.js';

describe('recipient safety — reserved and non-resolvable domains', () => {
  it('rejects every reserved TLD used by the 2026-08-10 smoke-test batch', () => {
    for (const email of [
      'b@platoscloset-op.test',
      'w@platos.example',
      'o@orphankc.test',
      'r@reviveboutique-kc.test',
      's@ambiguous-brand-kc.test',
      'x@thing.invalid',
      'y@thing.localhost',
    ]) {
      assert.equal(hasReservedTld(email), true, email);
      const verdict = evaluateRecipientSafety({ email });
      assert.equal(verdict.sendable, false, email);
      assert.equal(verdict.blocked, true, email);
      assert.equal(verdict.syntheticFixture, true, email);
    }
  });

  it('rejects the RFC 2606 reserved example second-level domains', () => {
    assert.equal(isReservedDomain('media@example.com'), true);
    const verdict = evaluateRecipientSafety({ email: 'media@example.com' });
    assert.equal(verdict.sendable, false);
    assert.equal(verdict.blocks.some((b) => b.code === 'reserved_domain'), true);
  });

  it('accepts the real verified hospitality inboxes from the source registry', () => {
    for (const email of [
      'media@crossroadshotelkc.com',
      'social.media@visitkc.com',
      'smurov@loewshotels.com',
      'colby.sharplesterry@ks.gov',
      'mwolters@visitkc.com',
    ]) {
      const verdict = evaluateRecipientSafety({ email, businessName: 'Crossroads Hotel' });
      assert.equal(verdict.sendable, true, `${email}: ${verdict.summary ?? ''}`);
      assert.equal(verdict.blocked, false, email);
      assert.equal(verdict.syntheticFixture, false, email);
    }
  });

  it('does not mistake a .test substring inside a real domain for a reserved TLD', () => {
    assert.equal(hasReservedTld('media@testkitchen.com'), false);
    assert.equal(evaluateRecipientSafety({ email: 'media@testkitchen.com' }).sendable, true);
  });
});

describe('recipient safety — do-not-contact and wrong-purpose inboxes', () => {
  it("permanently blocklists Hilton's crisis-communications inbox", () => {
    const entry = findDoNotContactEntry('breakingnews@hilton.com');
    assert.ok(entry, 'breakingnews@hilton.com must be on the do-not-contact list');
    assert.equal(entry.kind, 'wrong_purpose_inbox');
    assert.match(entry.reason, /crisis-communications/i);

    const verdict = evaluateRecipientSafety({ email: 'BreakingNews@Hilton.com' });
    assert.equal(verdict.sendable, false);
    assert.equal(verdict.blocked, true);
    assert.equal(verdict.blocks[0]?.code, 'wrong_purpose_inbox');
  });

  it('keeps the do-not-contact list non-empty and normalized', () => {
    assert.ok(DO_NOT_CONTACT_ADDRESSES.length >= 1);
    for (const entry of DO_NOT_CONTACT_ADDRESSES) {
      assert.equal(entry.address, entry.address.toLowerCase());
      assert.ok(entry.reason.length > 20, 'every blocklist entry needs a human-readable reason');
    }
  });

  it('blocks structurally wrong inboxes without blocking legitimate role inboxes', () => {
    for (const email of [
      'noreply@somehotel.com',
      'abuse@somehotel.com',
      'careers@somehotel.com',
      'accountspayable@somehotel.com',
    ]) {
      assert.equal(evaluateRecipientSafety({ email }).sendable, false, email);
    }
    for (const email of [
      'media@somehotel.com',
      'press@somehotel.com',
      'marketing@somehotel.com',
      'info@somehotel.com',
      'hello@somehotel.com',
      'events@somehotel.com',
      'partnerships@somehotel.com',
    ]) {
      assert.equal(evaluateRecipientSafety({ email }).sendable, true, email);
    }
  });
});

describe('recipient safety — fixture markers beyond the domain', () => {
  it('detects the live fixture business names', () => {
    for (const businessName of [
      "Plato's Closet Canary",
      "Plato's Closet Smoke",
      'Plato Closet Gate Check',
      'Orphan Evidence Only Brand',
      'Ambiguous Brand Alpha',
    ]) {
      assert.equal(looksLikeSyntheticFixture({ businessName }), true, businessName);
    }
  });

  it('detects fixture breadcrumbs left in contact notes', () => {
    assert.equal(
      looksLikeSyntheticFixture({
        email: 'contact@reviveboutique.com',
        businessName: 'Revive Boutique',
        notes: 'canary.plato.1786376231393@example seeded by smoke test',
      }),
      true,
    );
  });

  it('does not flag a real KC business', () => {
    assert.equal(
      looksLikeSyntheticFixture({
        email: 'media@crossroadshotelkc.com',
        businessName: 'Crossroads Hotel',
        notes: 'Media inbox published on crossroadshotelkc.com/contact-2/ (verified 2026-09-03).',
      }),
      false,
    );
  });
});

describe('recipient safety — missing vs blocked are different states', () => {
  it('reports "no email" as not-sendable but not blocked', () => {
    const verdict = evaluateRecipientSafety({
      email: null,
      businessName: 'Origin Hotel Kansas City',
    });
    assert.equal(verdict.sendable, false);
    assert.equal(verdict.blocked, false, 'a missing email is a research gap, not a permanent block');
    assert.equal(verdict.blocks[0]?.code, 'missing_email');
  });

  it('reports a fixture with no email as permanently blocked', () => {
    const verdict = evaluateRecipientSafety({ email: null, businessName: "Plato's Closet Canary" });
    assert.equal(verdict.blocked, true);
    assert.equal(verdict.syntheticFixture, true);
  });
});

describe('assertRecipientSendable', () => {
  it('throws RecipientBlockedError for a fixture', () => {
    assert.throws(
      () => assertRecipientSendable({ email: 'b@platoscloset-op.test' }),
      (err: unknown) => err instanceof RecipientBlockedError && err.code === 'reserved_tld',
    );
  });

  it('does not throw for a verified property media inbox', () => {
    assert.doesNotThrow(() => assertRecipientSendable({ email: 'media@crossroadshotelkc.com' }));
  });
});

describe('contact confidence never renders a fixture as verified', () => {
  it('downgrades verified_direct_email on a reserved-TLD address', () => {
    const confidence = contactConfidenceForStatus('verified_direct_email', {
      email: 'c@platoscloset-op.test',
      businessName: "Plato's Closet Canary",
    });
    assert.equal(confidence.tier, 'none');
    assert.equal(confidence.usable, false);
    assert.match(confidence.label, /fixture/i);
  });

  it('downgrades a wrong-purpose inbox even if the status claims verification', () => {
    const confidence = contactConfidenceForStatus('verified_role_email', {
      email: 'breakingnews@hilton.com',
      businessName: 'Hilton',
    });
    assert.equal(confidence.tier, 'none');
    assert.equal(confidence.usable, false);
  });

  it('preserves the existing single-argument behaviour', () => {
    assert.equal(contactConfidenceForStatus('verified_direct_email').tier, 'high');
    assert.equal(contactConfidenceForStatus('contact_form').tier, 'medium');
    assert.equal(contactConfidenceForStatus(null).tier, 'none');
  });

  it('keeps a real verified email at high confidence', () => {
    const confidence = contactConfidenceForStatus('verified_role_email', {
      email: 'media@crossroadshotelkc.com',
      businessName: 'Crossroads Hotel',
    });
    assert.equal(confidence.tier, 'high');
    assert.equal(confidence.usable, true);
  });
});
