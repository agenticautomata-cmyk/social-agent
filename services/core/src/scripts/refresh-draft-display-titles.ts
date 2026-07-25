import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorDraftAssets, shareIntakeSubmissions } from '../schema.js';
import {
  humanDraftTitle,
  humanIntakeTitle,
  looksLikeDeviceFilename,
} from '../draft-intelligence/display-title.js';
import { normalizeCreatorNameInText } from '../creator-display.js';

async function refreshDrafts() {
  const rows = await db.select().from(creatorDraftAssets);
  let updated = 0;
  for (const row of rows) {
    const displayTitle = humanDraftTitle({
      draftTitle: row.draftTitle,
      suggestedCaption: row.suggestedCaption,
      overallSummary: row.overallSummary,
      hookAssessment: row.hookAssessment,
    });
    const patch: Partial<typeof creatorDraftAssets.$inferInsert> = {};
    if (displayTitle && looksLikeDeviceFilename(row.draftTitle)) {
      patch.draftTitle = displayTitle;
    }
    if (row.overallSummary) patch.overallSummary = normalizeCreatorNameInText(row.overallSummary);
    if (row.hookAssessment) patch.hookAssessment = normalizeCreatorNameInText(row.hookAssessment);
    if (row.suggestedCaption) patch.suggestedCaption = normalizeCreatorNameInText(row.suggestedCaption);
    if (row.transcriptText) patch.transcriptText = normalizeCreatorNameInText(row.transcriptText);
    if (Object.keys(patch).length === 0) continue;
    patch.updatedAt = new Date();
    await db.update(creatorDraftAssets).set(patch).where(eq(creatorDraftAssets.id, row.id));
    updated++;
  }
  console.log(`Updated ${updated} draft(s).`);
}

async function refreshIntakes() {
  const rows = await db.select().from(shareIntakeSubmissions);
  let updated = 0;
  for (const row of rows) {
    const displayTitle = humanIntakeTitle({
      extractedTitle: row.extractedTitle,
      hookSummary: row.hookSummary,
      aiSummary: row.aiSummary,
      intakeType: row.intakeType,
      captionSuggestionsJson: row.captionSuggestionsJson,
    });
    const patch: Partial<typeof shareIntakeSubmissions.$inferInsert> = {};
    if (looksLikeDeviceFilename(row.extractedTitle)) patch.extractedTitle = displayTitle;
    if (row.aiSummary) patch.aiSummary = normalizeCreatorNameInText(row.aiSummary);
    if (row.hookSummary) patch.hookSummary = normalizeCreatorNameInText(row.hookSummary);
    if (Object.keys(patch).length === 0) continue;
    patch.updatedAt = new Date();
    await db.update(shareIntakeSubmissions).set(patch).where(eq(shareIntakeSubmissions.id, row.id));
    updated++;
  }
  console.log(`Updated ${updated} intake(s).`);
}

async function main() {
  await refreshDrafts();
  await refreshIntakes();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
