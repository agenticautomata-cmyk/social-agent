import { randomUUID } from 'node:crypto';
import type {
  CallLocationScript,
  FieldVerificationAspect,
  FieldVerificationProvenance,
  InventoryVerificationStatus,
  PartnershipFieldVerificationResult,
  PartnershipFieldVerificationTask,
  PartnershipLocalLocation,
  PartnershipResearch,
  PermissionVerificationStatus,
  ProcessVerificationStatus,
} from './types.js';
import { localAvailabilityLabel } from './local-verification.js';

const UNCERTAINTY_MARKERS =
  /NEEDS VERIFICATION|UNKNOWN\s*\/?\s*CALL FIRST|LIKELY AVAILABLE|needs_verification|unknown_call_first|likely_available/i;

const RESEARCH_FIELD_LABELS: Array<[keyof PartnershipResearch, string]> = [
  ['creatorProgram', 'Creator program details'],
  ['creatorContactPath', 'Creator contact path'],
  ['localFilmingPotential', 'Local filming permissions'],
  ['retailerRelationships', 'Retailer relationship'],
  ['organicBeforeApproval', 'Organic content before approval'],
];

const LOCATION_ASPECTS: Array<{
  aspect: Exclude<FieldVerificationAspect, 'general' | 'research_field'>;
  label: string;
  taskTitle: (locationName: string) => string;
}> = [
  {
    aspect: 'inventory',
    label: 'in-store inventory',
    taskTitle: (name) => `Verify inventory at ${name}`,
  },
  {
    aspect: 'pickup',
    label: 'pickup availability',
    taskTitle: (name) => `Verify pickup at ${name}`,
  },
  {
    aspect: 'ship_to_store',
    label: 'ship-to-store',
    taskTitle: (name) => `Verify ship-to-store at ${name}`,
  },
  {
    aspect: 'seller_intake',
    label: 'seller/resale intake',
    taskTitle: (name) => `Verify seller intake at ${name}`,
  },
  {
    aspect: 'filming',
    label: 'filming permission',
    taskTitle: (name) => `Verify filming permission at ${name}`,
  },
];

export type LocationVerificationSnapshot = {
  inventoryStatus: InventoryVerificationStatus | null;
  pickupStatus: ProcessVerificationStatus | null;
  shipToStoreStatus: ProcessVerificationStatus | null;
  sellerIntakeStatus: ProcessVerificationStatus | null;
  filmingStatus: PermissionVerificationStatus | null;
};

export function isInventoryResolved(status: InventoryVerificationStatus | null | undefined): boolean {
  return status === 'confirmed_available' || status === 'confirmed_unavailable';
}

export function isPermissionResolved(status: PermissionVerificationStatus | null | undefined): boolean {
  return status === 'confirmed_allowed' || status === 'confirmed_not_allowed';
}

export function isProcessResolved(status: ProcessVerificationStatus | null | undefined): boolean {
  return status === 'confirmed_offered' || status === 'confirmed_not_offered';
}

export function isDefinitiveVerificationStatus(
  aspect: FieldVerificationAspect,
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  switch (aspect) {
    case 'inventory':
      return isInventoryResolved(normalizeInventoryStatus(status));
    case 'filming':
      return isPermissionResolved(normalizePermissionStatus(status));
    case 'pickup':
    case 'ship_to_store':
    case 'seller_intake':
      return isProcessResolved(normalizeProcessStatus(status));
    default:
      return false;
  }
}

export function mergeLocationVerificationState(
  research: PartnershipResearch,
  locationIndex: number,
): LocationVerificationSnapshot {
  const snapshot: LocationVerificationSnapshot = {
    inventoryStatus: null,
    pickupStatus: null,
    shipToStoreStatus: null,
    sellerIntakeStatus: null,
    filmingStatus: null,
  };

  for (const result of research.fieldVerificationResults ?? []) {
    if (result.locationIndex !== locationIndex) continue;
    applySnapshotAspect(snapshot, 'inventoryStatus', normalizeInventoryStatus(result.inventoryStatus));
    applySnapshotAspect(snapshot, 'pickupStatus', normalizeProcessStatus(result.pickupStatus));
    applySnapshotAspect(snapshot, 'shipToStoreStatus', normalizeProcessStatus(result.shipToStoreStatus));
    applySnapshotAspect(snapshot, 'sellerIntakeStatus', normalizeProcessStatus(result.sellerIntakeStatus));
    applySnapshotAspect(snapshot, 'filmingStatus', normalizePermissionStatus(result.filmingStatus));
  }

  return snapshot;
}

function applySnapshotAspect<T extends string>(
  snapshot: LocationVerificationSnapshot,
  key: keyof LocationVerificationSnapshot,
  status: T | null,
): void {
  if (!status) return;
  const aspect = aspectForSnapshotKey(key);
  if (isDefinitiveVerificationStatus(aspect, status)) {
    snapshot[key] = status as never;
  }
}

function aspectForSnapshotKey(key: keyof LocationVerificationSnapshot): FieldVerificationAspect {
  switch (key) {
    case 'inventoryStatus':
      return 'inventory';
    case 'pickupStatus':
      return 'pickup';
    case 'shipToStoreStatus':
      return 'ship_to_store';
    case 'sellerIntakeStatus':
      return 'seller_intake';
    default:
      return 'filming';
  }
}

function isAspectUnresolved(
  aspect: Exclude<FieldVerificationAspect, 'general' | 'research_field'>,
  snapshot: LocationVerificationSnapshot,
): boolean {
  switch (aspect) {
    case 'inventory':
      return !isInventoryResolved(snapshot.inventoryStatus);
    case 'pickup':
      return !isProcessResolved(snapshot.pickupStatus);
    case 'ship_to_store':
      return !isProcessResolved(snapshot.shipToStoreStatus);
    case 'seller_intake':
      return !isProcessResolved(snapshot.sellerIntakeStatus);
    case 'filming':
      return !isPermissionResolved(snapshot.filmingStatus);
  }
}

export function buildFieldVerificationTasks(input: {
  research: PartnershipResearch;
  brandName: string | null;
  retailerName: string | null;
}): PartnershipFieldVerificationTask[] {
  const tasks: PartnershipFieldVerificationTask[] = [];
  const seen = new Set<string>();

  for (const [index, location] of (input.research.localLocations ?? []).entries()) {
    const snapshot = mergeLocationVerificationState(input.research, index);
    const unresolvedAspects = LOCATION_ASPECTS.filter((item) => isAspectUnresolved(item.aspect, snapshot));

    if (unresolvedAspects.length === 0) continue;

    for (const item of unresolvedAspects) {
      const key = `location:${index}:${item.aspect}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push({
        key,
        kind: 'location_inventory',
        aspect: item.aspect,
        title: item.taskTitle(location.name),
        description: buildAspectDescription(item.aspect, item.label, location, input.brandName),
        locationIndex: index,
        priority:
          location.availability === 'unknown_call_first' || item.aspect === 'inventory' ? 'high' : 'medium',
        source: `${location.name} (${localAvailabilityLabel(location.availability)}) — ${item.label} unresolved`,
        availabilityLabel: item.aspect === 'inventory' ? localAvailabilityLabel(location.availability) : null,
        followUpSuggestion: followUpSuggestionForAspect(item.aspect),
      });
    }
  }

  for (const item of input.research.needsVerification ?? []) {
    if (!UNCERTAINTY_MARKERS.test(item)) continue;
    const key = `needs:${slugKey(item)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      key,
      kind: 'general',
      aspect: 'general',
      title: summarizeVerificationItem(item),
      description: item,
      locationIndex: null,
      priority: /CALL FIRST|NEEDS VERIFICATION/i.test(item) ? 'high' : 'medium',
      source: item,
      availabilityLabel: extractAvailabilityLabel(item),
      followUpSuggestion: 'Try a store manager or corporate/partnership contact if front-line staff cannot answer.',
    });
  }

  for (const [fieldKey, label] of RESEARCH_FIELD_LABELS) {
    const field = input.research[fieldKey] as PartnershipResearch[keyof PartnershipResearch];
    if (!field || typeof field !== 'object' || !('status' in field)) continue;
    const verifiedField = field as { status?: string; value?: string | null };
    if (verifiedField.status !== 'needs_verification' || !verifiedField.value?.trim()) continue;
    const key = `field:${String(fieldKey)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      key,
      kind: 'research_field',
      aspect: 'research_field',
      title: `Verify ${label.toLowerCase()}`,
      description: verifiedField.value.trim(),
      locationIndex: null,
      priority: 'medium',
      source: `NEEDS VERIFICATION: ${label}`,
      availabilityLabel: null,
      followUpSuggestion: null,
    });
  }

  return tasks.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1));
}

export function buildCallLocationScript(input: {
  location: PartnershipLocalLocation;
  locationIndex: number;
  research: PartnershipResearch;
  brandName: string | null;
  retailerName: string | null;
}): CallLocationScript {
  const brand = input.brandName ?? 'the brand';
  const retailer = input.retailerName ?? 'the store';
  const snapshot = mergeLocationVerificationState(input.research, input.locationIndex);
  const unresolved = LOCATION_ASPECTS.filter((item) => isAspectUnresolved(item.aspect, snapshot)).map(
    (item) => item.label,
  );

  const isReklaimJared =
    /reklaim/i.test(brand) ||
    /reklaim/i.test(input.research.companySummary.value ?? '') ||
    (/jared/i.test(retailer) && /reklaim/i.test(`${brand} ${input.research.researchSummary ?? ''}`));

  const allFollowUpQuestions = isReklaimJared
    ? [
        `Is any REKLAIM merchandise physically stocked at ${input.location.name}?`,
        'What categories are stocked (handbags, watches, other)?',
        'Can REKLAIM items be picked up at this store, or shipped to this store for pickup?',
        'Does this store participate in any REKLAIM selling or resale intake process?',
        'Who at this location understands the REKLAIM program?',
      ]
    : [
        `Is ${brand} merchandise physically stocked at ${input.location.name}?`,
        'What product categories are currently in stock?',
        'Can items be picked up here or shipped to this store for pickup?',
        'Does this location participate in any brand resale, trade-in, or intake program?',
        'Who at this location understands the brand program?',
      ];

  const creatorAccessQuestions = isReklaimJared
    ? [
        'Would KCKellie be permitted to film an employee explaining the REKLAIM process?',
        'Is manager or corporate approval required before filming in-store?',
        'Are there areas of the store where filming is restricted?',
      ]
    : [
        `Would Kellie be permitted to film an employee explaining how ${brand} works at this location?`,
        'Is manager or corporate approval required before filming in-store?',
        'Are there areas of the store where filming is restricted?',
      ];

  const filteredFollowUp = filterQuestionsForUnresolvedAspects(allFollowUpQuestions, unresolved);
  const filteredCreatorAccess =
    unresolved.includes('filming permission') || unresolved.length === 0
      ? creatorAccessQuestions
      : [];

  return {
    locationName: input.location.name,
    locationAddress: input.location.address,
    objectives: [
      `Confirm facts only for ${input.location.name} — do not generalize to other ${retailer} locations.`,
      ...(unresolved.length
        ? [`Still unresolved at this location: ${unresolved.join(', ')}.`]
        : ['All targeted questions remain open at this location.']),
      'Document pickup, ship-to-store, seller/resale intake, and filming permission without assuming chain-wide policy.',
      'Identify the right in-store contact and whether manager or corporate follow-up is needed.',
    ],
    suggestedScript: [
      `Hi, I'm a local creator researching ${brand} at ${retailer}. I'm not selling anything today — I'm verifying facts for this specific store only.`,
      unresolved.includes('in-store inventory')
        ? `Can you tell me whether this location currently carries ${brand} merchandise in the store?`
        : null,
      unresolved.includes('pickup availability') || unresolved.includes('ship-to-store')
        ? 'If a customer buys online, can items be picked up here or shipped to this store?'
        : null,
      unresolved.includes('seller/resale intake')
        ? `Does this store handle any ${brand} resale or intake process? I don't want to assume — I'd rather ask directly.`
        : null,
      unresolved.includes('filming permission')
        ? 'If filming a short explainer with a staff member is possible here, what approval would be required?'
        : null,
    ].filter(Boolean) as string[],
    followUpQuestions: dedupe([...filteredFollowUp, ...collectUnknownFacts(input.research, input.location)]),
    creatorAccessQuestions: filteredCreatorAccess,
  };
}

export type SaveFieldVerificationInput = Omit<PartnershipFieldVerificationResult, 'id' | 'savedAt'>;

export function applyFieldVerificationResult(
  research: PartnershipResearch,
  input: SaveFieldVerificationInput,
  context: { brandName: string | null; retailerName: string | null },
): { research: PartnershipResearch; verifiedCount: number } {
  const next: PartnershipResearch = structuredClone(research);
  const provenance = input.provenance ?? buildProvenance(input);
  const result: PartnershipFieldVerificationResult = {
    ...input,
    provenance,
    id: randomUUID(),
    savedAt: new Date().toISOString(),
  };
  next.fieldVerificationResults = [...(next.fieldVerificationResults ?? []), result];

  const verifiedCount = countDefinitiveAnswers(result);

  if (input.locationIndex != null && next.localLocations[input.locationIndex]) {
    applyLocationScopedUpdates(next.localLocations[input.locationIndex]!, result, context, provenance);
  }

  next.needsVerification = filterResolvedNeedsVerification(next.needsVerification ?? [], result, next);

  return { research: next, verifiedCount };
}

export function shouldOfferRebuildCreatorPlay(verifiedCount: number): boolean {
  return verifiedCount > 0;
}

function applyLocationScopedUpdates(
  loc: PartnershipLocalLocation,
  result: PartnershipFieldVerificationResult,
  context: { brandName: string | null; retailerName: string | null },
  provenance: FieldVerificationProvenance,
): void {
  const inventory = normalizeInventoryStatus(result.inventoryStatus);
  if (inventory === 'confirmed_available') {
    loc.availability = 'confirmed_available';
    loc.notes = appendNote(loc.notes, locationScopedNote(provenance, `Inventory confirmed available at this location only.`));
  } else if (inventory === 'confirmed_unavailable') {
    loc.availability = 'confirmed_unavailable';
    loc.notes = appendNote(
      loc.notes,
      locationScopedNote(
        provenance,
        `${context.brandName ?? 'Brand'} not stocked at this location (verified negative — does not imply other stores).`,
      ),
    );
  } else if (inventory === 'unknown' || inventory === 'ambiguous') {
    loc.notes = appendNote(
      loc.notes,
      locationScopedNote(provenance, `Inventory still unresolved (${inventory}). ${result.followUpSuggestion ?? ''}`.trim()),
    );
  }

  const aspectNotes: Array<[FieldVerificationAspect, string | null]> = [
    ['pickup', formatProcessNote('Pickup', normalizeProcessStatus(result.pickupStatus))],
    ['ship_to_store', formatProcessNote('Ship-to-store', normalizeProcessStatus(result.shipToStoreStatus))],
    ['seller_intake', formatProcessNote('Seller/resale intake', normalizeProcessStatus(result.sellerIntakeStatus))],
    [
      'filming',
      formatPermissionNote(
        normalizePermissionStatus(result.filmingStatus),
        result.approvalRequirements,
      ),
    ],
  ];

  for (const [, note] of aspectNotes) {
    if (note) loc.notes = appendNote(loc.notes, locationScopedNote(provenance, note));
  }

  if (result.notes?.trim()) {
    loc.notes = appendNote(loc.notes, locationScopedNote(provenance, result.notes.trim()));
  }
}

function locationScopedNote(provenance: FieldVerificationProvenance, detail: string): string {
  const who = [provenance.contactRole, provenance.contactName].filter(Boolean).join(', ');
  const when = provenance.contactedAt?.slice(0, 10) ?? 'undated';
  const where = provenance.location ?? 'this location';
  return `[${provenance.source}/${provenance.channel} @ ${where}${who ? `; ${who}` : ''}; ${when}] ${detail}`;
}

function buildProvenance(input: SaveFieldVerificationInput): FieldVerificationProvenance {
  const role = input.contactRole?.toLowerCase() ?? '';
  const channel =
    role.includes('manager')
      ? 'manager_phone_confirmation'
      : role.includes('corporate')
        ? 'manager_phone_confirmation'
        : input.contactName
          ? 'employee_phone_confirmation'
          : 'other';

  return {
    source: 'field_verification',
    channel,
    contactName: input.contactName,
    contactRole: input.contactRole,
    contactedAt: input.contactedAt,
    location: input.location,
  };
}

function countDefinitiveAnswers(result: PartnershipFieldVerificationResult): number {
  let count = 0;
  if (isInventoryResolved(normalizeInventoryStatus(result.inventoryStatus))) count += 1;
  if (isProcessResolved(normalizeProcessStatus(result.pickupStatus))) count += 1;
  if (isProcessResolved(normalizeProcessStatus(result.shipToStoreStatus))) count += 1;
  if (isProcessResolved(normalizeProcessStatus(result.sellerIntakeStatus))) count += 1;
  if (isPermissionResolved(normalizePermissionStatus(result.filmingStatus))) count += 1;
  return count;
}

function formatProcessNote(label: string, status: ProcessVerificationStatus | null): string | null {
  if (!status) return null;
  if (status === 'confirmed_offered') return `${label}: confirmed offered at this location.`;
  if (status === 'confirmed_not_offered') return `${label}: confirmed not offered at this location.`;
  if (status === 'unknown') return `${label}: unknown — contact could not answer.`;
  if (status === 'ambiguous') return `${label}: ambiguous — needs follow-up.`;
  return null;
}

function formatPermissionNote(
  status: PermissionVerificationStatus | null,
  approvalRequirements: string | null,
): string | null {
  if (!status) return null;
  if (status === 'confirmed_allowed') {
    return approvalRequirements?.trim()
      ? `Filming allowed at this location with conditions: ${approvalRequirements.trim()}`
      : 'Filming allowed at this location.';
  }
  if (status === 'confirmed_not_allowed') {
    return approvalRequirements?.trim()
      ? `Filming not allowed at this location: ${approvalRequirements.trim()}`
      : 'Filming not allowed at this location.';
  }
  if (status === 'unknown') return 'Filming permission: unknown — contact could not answer.';
  if (status === 'ambiguous') return 'Filming permission: ambiguous — needs manager/corporate follow-up.';
  return null;
}

function filterResolvedNeedsVerification(
  items: string[],
  result: PartnershipFieldVerificationResult,
  research: PartnershipResearch,
): string[] {
  const inventory = normalizeInventoryStatus(result.inventoryStatus);
  const inventoryResolved = isInventoryResolved(inventory);
  const filming = normalizePermissionStatus(result.filmingStatus);
  const filmingResolved = isPermissionResolved(filming);
  const sellerResolved = isProcessResolved(normalizeProcessStatus(result.sellerIntakeStatus));

  return items.filter((item) => {
    if (inventoryResolved) {
      if (/kc inventory|in-store inventory|local inventory|carries .* in (kc|kansas city)/i.test(item)) {
        return false;
      }
      if (result.location && item.toLowerCase().includes(result.location.toLowerCase()) && /inventory|stock|in-store/i.test(item)) {
        return false;
      }
    }
    if (filmingResolved && /filming|film in-store|on-site/i.test(item)) {
      return false;
    }
    if (sellerResolved && /seller|intake|resale|trade-in/i.test(item)) {
      return false;
    }
    if (
      inventoryResolved &&
      research.localLocations.every(
        (loc) => loc.availability === 'confirmed_available' || loc.availability === 'confirmed_unavailable',
      ) &&
      /before filming, verify .* inventory/i.test(item)
    ) {
      return false;
    }
    return true;
  });
}

/** Map legacy saved values from earlier field verification passes. */
export function normalizeInventoryStatus(
  status: string | null | undefined,
): InventoryVerificationStatus | null {
  if (!status) return null;
  if (status === 'verified') return 'confirmed_available';
  if (status === 'denied') return 'confirmed_unavailable';
  if (INVENTORY_STATUS_SET.has(status)) return status as InventoryVerificationStatus;
  return null;
}

export function normalizePermissionStatus(
  status: string | null | undefined,
): PermissionVerificationStatus | null {
  if (!status) return null;
  if (status === 'verified') return 'confirmed_allowed';
  if (status === 'denied') return 'confirmed_not_allowed';
  if (PERMISSION_STATUS_SET.has(status)) return status as PermissionVerificationStatus;
  return null;
}

export function normalizeProcessStatus(status: string | null | undefined): ProcessVerificationStatus | null {
  if (!status) return null;
  if (status === 'verified') return 'confirmed_offered';
  if (status === 'denied') return 'confirmed_not_offered';
  if (PROCESS_STATUS_SET.has(status)) return status as ProcessVerificationStatus;
  return null;
}

const INVENTORY_STATUS_SET = new Set<string>([
  'confirmed_available',
  'confirmed_unavailable',
  'likely_available',
  'unknown_call_first',
  'unknown',
  'ambiguous',
]);

const PERMISSION_STATUS_SET = new Set<string>(['confirmed_allowed', 'confirmed_not_allowed', 'unknown', 'ambiguous']);

const PROCESS_STATUS_SET = new Set<string>(['confirmed_offered', 'confirmed_not_offered', 'unknown', 'ambiguous']);

function buildAspectDescription(
  aspect: Exclude<FieldVerificationAspect, 'general' | 'research_field'>,
  label: string,
  location: PartnershipLocalLocation,
  brandName: string | null,
): string {
  return `Confirm ${label} for ${location.name} only. A verified yes or no both count — unknown means the contact could not answer.${brandName ? ` Brand: ${brandName}.` : ''}`;
}

function followUpSuggestionForAspect(
  aspect: Exclude<FieldVerificationAspect, 'general' | 'research_field'>,
): string | null {
  if (aspect === 'filming') return 'Ask for the store manager or corporate marketing/partnership contact.';
  if (aspect === 'seller_intake') return 'Seller/resale intake may require a manager or corporate policy answer.';
  return 'If front-line staff cannot answer, ask for a manager or corporate contact.';
}

function filterQuestionsForUnresolvedAspects(questions: string[], unresolved: string[]): string[] {
  if (unresolved.length === 0) return questions;
  return questions.filter((question) => {
    const lower = question.toLowerCase();
    if (unresolved.includes('in-store inventory') && /stock|carries|merchandise physically stocked/i.test(lower)) {
      return true;
    }
    if (unresolved.includes('pickup availability') && /picked up|pick up/i.test(lower)) return true;
    if (unresolved.includes('ship-to-store') && /shipped to this store/i.test(lower)) return true;
    if (unresolved.includes('seller/resale intake') && /seller|resale|intake/i.test(lower)) return true;
    if (unresolved.includes('filming permission')) return false;
    return false;
  });
}

function collectUnknownFacts(research: PartnershipResearch, location: PartnershipLocalLocation): string[] {
  const facts: string[] = [];
  for (const item of research.needsVerification ?? []) {
    if (UNCERTAINTY_MARKERS.test(item)) facts.push(item.replace(/^NEEDS VERIFICATION:\s*/i, ''));
  }
  if (location.availability !== 'confirmed_available' && location.availability !== 'confirmed_unavailable') {
    facts.push(`Current status for ${location.name}: ${localAvailabilityLabel(location.availability)}`);
  }
  return dedupe(facts).slice(0, 6);
}

function summarizeVerificationItem(item: string): string {
  const stripped = item.replace(/^NEEDS VERIFICATION:\s*/i, '').trim();
  return stripped.length > 72 ? `${stripped.slice(0, 69)}…` : stripped;
}

function extractAvailabilityLabel(item: string): string | null {
  if (/UNKNOWN\s*\/?\s*CALL FIRST/i.test(item)) return 'UNKNOWN / CALL FIRST';
  if (/LIKELY AVAILABLE/i.test(item)) return 'LIKELY AVAILABLE';
  if (/NEEDS VERIFICATION/i.test(item)) return 'NEEDS VERIFICATION';
  return null;
}

function slugKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
}

function appendNote(existing: string | null, addition: string): string {
  if (!existing?.trim()) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing.trim()} | ${addition}`;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
