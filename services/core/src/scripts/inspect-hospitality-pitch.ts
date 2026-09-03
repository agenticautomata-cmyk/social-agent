/**
 * Generates a hospitality pitch from live registry facts and prints it with its
 * rubric evaluation, so the output can be read by a human instead of trusted.
 *
 * `--business="Crossroads Hotel"` picks the business. `--dry` builds the brief and
 * prints it without calling the model.
 */

import {
  bestPartnershipContact,
  buildEvidenceItems,
  loadBusinessFacts,
  pickWhyNow,
  recommendedHostedStayRequest,
} from '../hospitality-pitch/brief-from-facts.js';
import { resolvePitchAudienceEvidence } from '../hospitality-pitch/creator-evidence.js';
import { checkBriefCompleteness, type PitchBrief } from '../hospitality-pitch/compose.js';
import { formatEvaluation, writeHospitalityPitch } from '../hospitality-pitch/write.js';

const args = process.argv.slice(2);
const business =
  args.find((a) => a.startsWith('--business='))?.slice('--business='.length) ?? 'Crossroads Hotel';
const dry = args.includes('--dry');

const facts = await loadBusinessFacts(business);
console.log(
  `Facts for ${business}: ${facts.events.length} events, ${facts.contacts.length} contacts.`,
);

const contact = bestPartnershipContact(facts);
const whyNow = pickWhyNow(facts);
const audience = await resolvePitchAudienceEvidence();

const brief: PitchBrief = {
  businessName: business,
  propertyName: null,
  recipientEmail: contact?.email ?? null,
  recipientName: null,
  recipientLabel: contact?.publishedLabel ?? null,
  whyNow,
  concept: whyNow
    ? {
        headline: `A short first-person video from the night of ${whyNow.headline}`,
        detail:
          'Kellie films the arrival, the room and the event itself as one continuous evening, cut to a single vertical video plus stories on the night. The hotel reads as somewhere locals go, not just somewhere visitors sleep.',
      }
    : null,
  deliverables: [
    { description: 'one in-feed TikTok video' },
    { description: 'a set of stories on the night itself' },
  ],
  compensationOffered: [],
  compensationRequested: recommendedHostedStayRequest({
    estimatedRoomRateUsd: null,
    includeDiningCredit: true,
  }),
  compensationState: 'fully_hosted',
  estimatedExperienceCostUsd: null,
  audience,
  mediaKitUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel',
  evidence: buildEvidenceItems(facts),
  termsToWeigh: [],
  priorRelationshipNote: null,
  isFollowUp: false,
  originalSubject: null,
};

console.log(`\nBest contact: ${contact?.email ?? 'none'} (${contact?.evidenceState ?? 'unknown'})`);
console.log(`Why now: ${whyNow?.headline ?? 'none found'}`);
console.log(`\nEvidence (${brief.evidence.length}):`);
for (const item of brief.evidence) console.log(`  - ${item.fact}\n      ${item.sourceUrl}`);

const missing = checkBriefCompleteness(brief);
if (missing.length > 0) {
  console.log(`\nBrief is incomplete — Benson would refuse. Missing: ${missing.join(', ')}`);
} else {
  console.log('\nBrief is complete.');
}

if (!dry) {
  const result = await writeHospitalityPitch(brief);
  if (result.ok) {
    console.log(`\n${'='.repeat(72)}\nSUBJECT: ${result.pitch.subject}\n${'='.repeat(72)}`);
    console.log(result.pitch.body);
    console.log('='.repeat(72));
    console.log(`\nCompensation: ${result.pitch.compensationSummary}`);
    console.log(`Attempts: ${result.attempts}`);
    console.log(`\n${formatEvaluation(result.evaluation)}`);
  } else {
    console.log(`\nBLOCKED: ${result.summary}`);
    if (result.rejectedDraft) {
      console.log(`\nRejected draft subject: ${result.rejectedDraft.subject}`);
      console.log(result.rejectedDraft.body);
      console.log(`\n${formatEvaluation(result.rejectedDraft.evaluation)}`);
    }
  }
}

process.exit(0);
