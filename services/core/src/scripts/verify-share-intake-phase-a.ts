/**
 * Phase A verification — Share-to-Benson manual intake flow.
 * Run: npx tsx src/scripts/verify-share-intake-phase-a.ts
 */

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, shareIntakeSubmissions } from '../schema.js';
import {
  promoteIntakeToContentItem,
  rejectIntakeSubmission,
  resolveIntakeType,
  stubExtractIntake,
} from '../intake/index.js';
import { campaigns } from '../schema.js';

async function main() {
  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
  if (!campaign) throw new Error('no campaign');

  const urlStub = stubExtractIntake({
    intakeType: 'url',
    url: 'https://planetcomicon.com/tickets/',
    categorySuggestion: 'convention',
  });

  const [urlRow] = await db
    .insert(shareIntakeSubmissions)
    .values({
      campaignId: campaign.id,
      sourceType: 'manual_share',
      intakeType: 'url',
      originalUrl: 'https://planetcomicon.com/tickets/',
      aiSummary: urlStub.ai_summary,
      extractedTitle: urlStub.extracted_title,
      extractedCategory: urlStub.extracted_category,
      extractedTags: urlStub.extracted_tags,
      confidenceScore: String(urlStub.confidence_score),
      reviewStatus: 'needs_review',
      submittedBy: 'verify-script',
    })
    .returning();

  const textStub = stubExtractIntake({
    intakeType: 'text',
    text: 'Mahomes autograph signing at Dick\'s Leawood Friday 6pm',
    notes: 'From group text',
    categorySuggestion: 'autograph_signing',
  });

  const [textRow] = await db
    .insert(shareIntakeSubmissions)
    .values({
      campaignId: campaign.id,
      sourceType: 'manual_share',
      intakeType: resolveIntakeType(false, true, false),
      rawText: 'Mahomes autograph signing at Dick\'s Leawood Friday 6pm',
      notes: 'From group text',
      aiSummary: textStub.ai_summary,
      extractedTitle: textStub.extracted_title,
      extractedCategory: textStub.extracted_category,
      extractedTags: textStub.extracted_tags,
      confidenceScore: String(textStub.confidence_score),
      reviewStatus: 'needs_review',
      submittedBy: 'verify-script',
    })
    .returning();

  const pending = await db
    .select()
    .from(shareIntakeSubmissions)
    .where(eq(shareIntakeSubmissions.reviewStatus, 'needs_review'));

  const promoteResult = await promoteIntakeToContentItem(urlRow!, 'verify-script');
  if (!promoteResult.ok) throw new Error(`promote failed: ${promoteResult.reason}`);

  const rejected = await rejectIntakeSubmission(textRow!.id, 'verify-script', 'test reject');
  if (!rejected) throw new Error('reject failed');

  const contentItem = await db.query.contentItems.findFirst({
    where: eq(contentItems.id, promoteResult.contentItemId),
  });

  const totalContent = await db.select().from(contentItems);

  console.log(
    JSON.stringify(
      {
        urlIntakeId: urlRow!.id,
        textIntakeId: textRow!.id,
        pendingBeforeAction: pending.length,
        promotedContentItemId: promoteResult.contentItemId,
        promotedTopic: contentItem?.topic,
        promotedSourceUrl: contentItem?.sourceUrl,
        promotedMetadataIngest: (contentItem?.metadata as { ingest?: string })?.ingest,
        rejectedStatus: rejected.reviewStatus,
        totalContentItems: totalContent.length,
        ok: true,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
