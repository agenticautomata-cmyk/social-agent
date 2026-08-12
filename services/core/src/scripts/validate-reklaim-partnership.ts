#!/usr/bin/env -S pnpm exec tsx
/**
 * Live validation for creator partnership research (REKLAIM / Jared test case).
 * Requires OPENAI_API_KEY and network for web search.
 */
import { submitCreatorPartnership, getCreatorPartnership, runPartnershipResearch, buildPartnershipCreatorPlay } from '../creator-partnership/pipeline.js';
import assert from 'node:assert/strict';

const REKLAIM_URL =
  'https://www.jared.com/jewelry/handbags/c/7000001712?icid=MM:J:ReklaimHandbags';

const submitted = await submitCreatorPartnership({
  url: REKLAIM_URL,
  text: 'Creator partnership test — REKLAIM handbags at Jared',
  sourceScreen: 'validation_script',
});

console.log('Submitted:', submitted);

await runPartnershipResearch(submitted.partnershipId);

let partnership = await getCreatorPartnership(submitted.partnershipId);
console.log('After research:', {
  fitScore: partnership?.fitScore,
  pipelineStatus: partnership?.pipelineStatus,
  researchStatus: partnership?.researchStatus,
  monetizationPaths: partnership?.monetizationPaths,
  companySummary: partnership?.research?.companySummary?.value?.slice(0, 200),
  creatorProgram: partnership?.research?.creatorProgram?.value?.slice(0, 200),
  needsVerification: partnership?.needsVerification?.slice(0, 5),
});

await buildPartnershipCreatorPlay(submitted.partnershipId);
partnership = await getCreatorPartnership(submitted.partnershipId);

const hook = partnership?.creatorPlay?.openingHook ?? '';
const playBlob = JSON.stringify(partnership?.creatorPlay ?? {}).toLowerCase();
const kcInventoryUnverified = partnership?.research?.localLocations?.every(
  (l) => l.availability !== 'confirmed_available',
);

console.log('Creator Play hook:', hook);
console.log('Creator Play concepts:', partnership?.creatorPlay?.contentConcepts);
console.log('Local locations:', partnership?.research?.localLocations);

assert.ok(kcInventoryUnverified, 'expected KC inventory to remain unverified');
assert.doesNotMatch(hook, /shop reklaim at jared in kc/i);
assert.doesNotMatch(hook, /\bin kc\b.*let me show you/i);
assert.doesNotMatch(playBlob, /shop reklaim at jared in kc/);
assert.ok(
  partnership?.creatorPlay?.researchBeforeFilming?.some((item) => /verify.*(kc|kansas city)/i.test(item)),
  'expected KC verification action in researchBeforeFilming',
);
if (partnership?.research?.creatorProgram?.value) {
  assert.match(partnership.research.creatorProgram.value, /conscious collective/i);
}
if (partnership?.research?.companySummary?.value) {
  assert.match(partnership.research.companySummary.value, /reklaim|pre-owned|handbag/i);
}

console.log('REKLAIM validation checks passed.');

process.exit(0);
