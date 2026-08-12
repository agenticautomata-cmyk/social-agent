import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFieldVerificationResult,
  buildCallLocationScript,
  buildFieldVerificationTasks,
  mergeLocationVerificationState,
  shouldOfferRebuildCreatorPlay,
} from './field-verification.js';
import type { PartnershipResearch } from './types.js';

const REKLAIM_RESEARCH: PartnershipResearch = {
  companySummary: { value: 'REKLAIM authenticated pre-owned luxury handbags.', status: 'inferred', source: 'web' },
  audienceFitRationale: { value: 'Luxury resale audience fit.', status: 'inferred', source: 'web' },
  creatorProgram: { value: 'Conscious Collective creator program.', status: 'needs_verification', source: 'web' },
  programBenefits: { value: null, status: 'unavailable', source: null },
  programRequirements: { value: null, status: 'unavailable', source: null },
  socialAccounts: { value: null, status: 'unavailable', source: null },
  recentCollaborations: { value: null, status: 'unavailable', source: null },
  retailerRelationships: { value: 'REKLAIM sold through Jared nationally.', status: 'inferred', source: 'web_research' },
  localFilmingPotential: { value: 'Store visit possible if inventory confirmed.', status: 'needs_verification', source: 'web' },
  creatorContactPath: { value: null, status: 'needs_verification', source: null },
  productsPricingHooks: { value: null, status: 'unavailable', source: null },
  organicBeforeApproval: { value: null, status: 'unavailable', source: null },
  needsVerification: [
    'NEEDS VERIFICATION: KC in-store REKLAIM inventory at Jared',
    'Before filming, verify Jared — Kansas City area inventory (UNKNOWN / CALL FIRST).',
  ],
  citations: [],
  localLocations: [
    {
      name: 'Jared — Kansas City area',
      address: null,
      availability: 'unknown_call_first',
      notes: 'National retailer may carry this brand online or in select stores.',
      source: 'retailer_page',
    },
  ],
  researchSummary: 'REKLAIM at Jared',
  researchedAt: '2026-08-01T00:00:00.000Z',
};

const PROVENANCE = {
  source: 'field_verification' as const,
  channel: 'employee_phone_confirmation' as const,
  contactName: 'Alex',
  contactRole: 'Sales associate',
  contactedAt: '2026-08-09T15:00:00.000Z',
  location: 'Jared — Kansas City area',
};

describe('field verification tasks', () => {
  it('creates location tasks from UNKNOWN / CALL FIRST locations', () => {
    const tasks = buildFieldVerificationTasks({
      research: REKLAIM_RESEARCH,
      brandName: 'REKLAIM',
      retailerName: 'Jared',
    });
    assert.ok(tasks.some((t) => t.kind === 'location_inventory'));
    assert.ok(tasks.some((t) => /NEEDS VERIFICATION|CALL FIRST/i.test(t.source)));
  });

  it('builds REKLAIM/Jared call script with seller intake as a question, not an assumption', () => {
    const script = buildCallLocationScript({
      location: REKLAIM_RESEARCH.localLocations[0]!,
      locationIndex: 0,
      research: REKLAIM_RESEARCH,
      brandName: 'REKLAIM',
      retailerName: 'Jared',
    });
    assert.ok(script.followUpQuestions.some((q) => /physically stocked/i.test(q)));
    assert.ok(script.followUpQuestions.some((q) => /seller|resale intake/i.test(q)));
    assert.ok(script.creatorAccessQuestions.some((q) => /KCKellie|film/i.test(q)));
    assert.ok(script.suggestedScript.some((line) => /don't want to assume|specific store only/i.test(line)));
  });
});

describe('verified negative answers', () => {
  it('1. confirmed NO becomes verified negative inventory, not unknown_call_first', () => {
    const { research, verifiedCount } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:inventory',
        locationIndex: 0,
        location: 'Jared — Kansas City area',
        contactName: 'Alex',
        contactRole: 'Sales associate',
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: 'confirmed_unavailable',
        pickupStatus: null,
        shipToStoreStatus: null,
        sellerIntakeStatus: null,
        filmingStatus: null,
        approvalRequirements: null,
        followUpContact: null,
        followUpSuggestion: null,
        provenance: PROVENANCE,
        notes: 'We do not stock REKLAIM at this location.',
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    assert.equal(research.localLocations[0]!.availability, 'confirmed_unavailable');
    assert.notEqual(research.localLocations[0]!.availability, 'unknown_call_first');
    assert.ok(verifiedCount >= 1);
    assert.ok(shouldOfferRebuildCreatorPlay(verifiedCount));
  });

  it('filming confirmed not allowed is verified negative, not unknown', () => {
    const { research, verifiedCount } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:filming',
        locationIndex: 0,
        location: 'Jared — Kansas City area',
        contactName: 'Alex',
        contactRole: 'Sales associate',
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: null,
        pickupStatus: null,
        shipToStoreStatus: null,
        sellerIntakeStatus: null,
        filmingStatus: 'confirmed_not_allowed',
        approvalRequirements: 'We do not allow filming.',
        followUpContact: null,
        followUpSuggestion: null,
        provenance: PROVENANCE,
        notes: null,
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    assert.ok(verifiedCount >= 1);
    assert.match(research.localLocations[0]!.notes ?? '', /Filming not allowed at this location/i);
    assert.equal(research.retailerRelationships.status, 'inferred');
  });
});

describe('task resolution and scope', () => {
  it('2. confirmed unavailable inventory closes that inventory verification task', () => {
    const { research } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:inventory',
        locationIndex: 0,
        location: 'Jared — Kansas City area',
        contactName: 'Alex',
        contactRole: 'Sales associate',
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: 'confirmed_unavailable',
        pickupStatus: null,
        shipToStoreStatus: null,
        sellerIntakeStatus: null,
        filmingStatus: null,
        approvalRequirements: null,
        followUpContact: null,
        followUpSuggestion: null,
        provenance: PROVENANCE,
        notes: 'No REKLAIM here.',
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    const tasks = buildFieldVerificationTasks({
      research,
      brandName: 'REKLAIM',
      retailerName: 'Jared',
    });
    assert.equal(tasks.some((t) => t.key === 'location:0:inventory'), false);
  });

  it('3. unknown answer remains unresolved', () => {
    const { research } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:inventory',
        locationIndex: 0,
        location: 'Jared — Kansas City area',
        contactName: null,
        contactRole: null,
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: 'unknown',
        pickupStatus: null,
        shipToStoreStatus: null,
        sellerIntakeStatus: null,
        filmingStatus: null,
        approvalRequirements: null,
        followUpContact: null,
        followUpSuggestion: 'Ask for the store manager.',
        provenance: { ...PROVENANCE, contactName: null, contactRole: null },
        notes: 'Could not reach anyone who knew.',
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    assert.equal(research.localLocations[0]!.availability, 'unknown_call_first');
    const tasks = buildFieldVerificationTasks({
      research,
      brandName: 'REKLAIM',
      retailerName: 'Jared',
    });
    assert.ok(tasks.some((t) => t.key === 'location:0:inventory'));
  });

  it('4. one location result does not become a chain-wide retailer fact', () => {
    const { research } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:inventory',
        locationIndex: 0,
        location: 'Jared Store A',
        contactName: 'Alex',
        contactRole: 'Sales associate',
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: 'confirmed_unavailable',
        pickupStatus: null,
        shipToStoreStatus: null,
        sellerIntakeStatus: null,
        filmingStatus: null,
        approvalRequirements: null,
        followUpContact: null,
        followUpSuggestion: null,
        provenance: { ...PROVENANCE, location: 'Jared Store A' },
        notes: 'Store A has no REKLAIM inventory.',
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    assert.equal(research.retailerRelationships.status, 'inferred');
    assert.equal(research.retailerRelationships.source, 'web_research');
    assert.match(research.localLocations[0]!.notes ?? '', /does not imply other stores/i);
  });

  it('5. partially resolved call generates only remaining verification questions', () => {
    const { research } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:inventory',
        locationIndex: 0,
        location: 'Jared — Kansas City area',
        contactName: 'Alex',
        contactRole: 'Sales associate',
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: 'confirmed_unavailable',
        pickupStatus: 'unknown',
        shipToStoreStatus: null,
        sellerIntakeStatus: null,
        filmingStatus: 'ambiguous',
        approvalRequirements: 'Manager approval required',
        followUpContact: 'Store manager',
        followUpSuggestion: 'Ask for the store manager.',
        provenance: PROVENANCE,
        notes: 'Inventory: none. Pickup: unknown. Filming: manager approval required.',
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    const snapshot = mergeLocationVerificationState(research, 0);
    assert.equal(snapshot.inventoryStatus, 'confirmed_unavailable');
    assert.equal(snapshot.pickupStatus, null);
    assert.equal(snapshot.filmingStatus, null);

    const tasks = buildFieldVerificationTasks({
      research,
      brandName: 'REKLAIM',
      retailerName: 'Jared',
    });
    assert.equal(tasks.some((t) => t.key === 'location:0:inventory'), false);
    assert.ok(tasks.some((t) => t.key === 'location:0:pickup'));
    assert.ok(tasks.some((t) => t.key === 'location:0:filming'));
  });
});

describe('positive verification without global overwrite', () => {
  it('promotes confirmed available inventory at location without overwriting web retailer research', () => {
    const { research, verifiedCount } = applyFieldVerificationResult(
      REKLAIM_RESEARCH,
      {
        taskKey: 'location:0:inventory',
        locationIndex: 0,
        location: 'Jared — Kansas City area',
        contactName: 'Alex',
        contactRole: 'Store manager',
        contactedAt: '2026-08-09T15:00:00.000Z',
        inventoryStatus: 'confirmed_available',
        pickupStatus: 'confirmed_offered',
        shipToStoreStatus: 'unknown',
        sellerIntakeStatus: 'confirmed_not_offered',
        filmingStatus: 'confirmed_allowed',
        approvalRequirements: 'Manager approval required for filming',
        followUpContact: 'Alex — store manager',
        followUpSuggestion: null,
        provenance: { ...PROVENANCE, contactRole: 'Store manager', channel: 'manager_phone_confirmation' },
        notes: 'Handbags confirmed on display.',
      },
      { brandName: 'REKLAIM', retailerName: 'Jared' },
    );

    assert.equal(research.localLocations[0]!.availability, 'confirmed_available');
    assert.equal(research.retailerRelationships.status, 'inferred');
    assert.equal(research.localFilmingPotential.status, 'needs_verification');
    assert.ok(verifiedCount >= 3);
    assert.ok((research.fieldVerificationResults ?? []).length === 1);
    assert.match(research.fieldVerificationResults?.[0]?.provenance.channel ?? '', /manager_phone_confirmation/);
  });
});
