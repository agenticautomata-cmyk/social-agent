/**
 * Improve Crossroads pitch while still awaiting approval.
 * Preserves the prior subject/body in benson_draft_context.priorDraft.
 * Does NOT approve or send.
 */

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails } from '../schema.js';
import { persistVersionedMediaKit } from '../media-kit/versions.js';
import { resolvePitchAudienceEvidence } from '../hospitality-pitch/creator-evidence.js';

const CROSSROADS_ID = '7300ff2a-e214-421b-8da9-39ceab2c2158';

const existing = await db
  .select()
  .from(outreachEmails)
  .where(eq(outreachEmails.id, CROSSROADS_ID))
  .limit(1);

if (!existing[0]) {
  console.error('Crossroads pitch not found');
  process.exit(1);
}

const row = existing[0];
if (row.status !== 'needs_approval' || row.approvedAt) {
  console.log('Crossroads is no longer awaiting approval — leaving untouched.', row.status);
  process.exit(0);
}

const audience = await resolvePitchAudienceEvidence();
const kit = await persistVersionedMediaKit({
  variant: 'hotel',
  notes: 'Creator assets pass — versioned for Crossroads approval pin',
});

if (!kit.ok) {
  console.error('Could not build hotel kit:', kit.missing);
  process.exit(1);
}

const followers = audience.followersCount?.toLocaleString('en-US') ?? '—';
const median = audience.medianViewsPerPost?.toLocaleString('en-US') ?? '—';
const totalViews = audience.totalViews?.toLocaleString('en-US') ?? '—';
const posts = audience.postsWithMetrics?.toLocaleString('en-US') ?? '—';

const priorDraft = {
  subject: row.subject,
  body: row.body,
  preservedAt: new Date().toISOString(),
};

const subject = 'Second Company Showcase Video at Crossroads Hotel — Sept 5';
const body = `Second Company Showcase at Crossroads on Sept 5th is a fantastic opportunity to highlight your venue. The Kansas City Ballet's Second Company will perform a dynamic ballet free to the public, and I'd love to capture this event through my lens.

I'm Kellie, a content creator based in Kansas City with ${followers} followers on TikTok only (Instagram/Facebook/YouTube are not connected, so I don't quote them). A typical post of mine lands around ${median} views, contributing to a total of ${totalViews} views across ${posts} posts — all from the live TikTok connector.

I propose creating a short first-person video from the night — arrival, the room if hosted, and the performance atmosphere — cut as one continuous evening so the property reads as somewhere locals choose.

Deliverables would include one in-feed TikTok video and a set of stories from the night. In exchange, I would request a complimentary room and dining credit.

Media kit (version ${kit.result.versionNumber}): ${kit.result.versionWebUrl}
One-page PDF: ${kit.result.webUrl.replace(/\/media-kit\//, '/api/public/media-kit/').replace(/\?.*$/, '')}/pdf?v=${kit.result.versionNumber}

Happy to adjust timing or focus if that helps.`;

const priorContext = (row.bensonDraftContext as Record<string, unknown> | null) ?? {};

await db
  .update(outreachEmails)
  .set({
    subject,
    body,
    mediaKitId: kit.result.kitId,
    bensonDraftContext: {
      ...priorContext,
      priorDraft,
      improvedAt: new Date().toISOString(),
      mediaKitVersionId: kit.result.versionId,
      mediaKitContentHash: kit.result.contentHash,
      mediaKitVersionNumber: kit.result.versionNumber,
      tiktokOnly: true,
    },
    updatedAt: new Date(),
  })
  .where(eq(outreachEmails.id, CROSSROADS_ID));

console.log(
  JSON.stringify(
    {
      ok: true,
      id: CROSSROADS_ID,
      subject,
      kitVersion: kit.result.versionNumber,
      kitUrl: kit.result.versionWebUrl,
      priorSubject: priorDraft.subject,
    },
    null,
    2,
  ),
);
process.exit(0);
