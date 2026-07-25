import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, sponsorContacts } from '../schema.js';
import {
  draftSponsorOutreachFromOpportunity,
  regenerateOutreachApprovalDraft,
} from '../sponsor-outreach/benson-drafting/draft.js';
import { draftUsesDateNightLanguage } from './draft-quality.js';

export type RegenerateCorrectedReport = {
  created: Array<{ contentItemId: string; businessName: string; emailId: string }>;
  regenerated: Array<{ emailId: string; businessName: string; subject: string }>;
  skipped: Array<{ key: string; reason: string }>;
};

const TARGET_BUSINESS_RE =
  /\b(adidas|aerie|21c museum hotel|martin city tavern|tori kelly)\b/i;

/** Re-draft archived corrected-angle targets and refresh active 21c copies still using date-night language. */
export async function regenerateCorrectedOutreachDrafts(): Promise<RegenerateCorrectedReport> {
  const report: RegenerateCorrectedReport = {
    created: [],
    regenerated: [],
    skipped: [],
  };

  const activeRows = await db
    .select({ email: outreachEmails, contact: sponsorContacts })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(outreachEmails.sponsorContactId, sponsorContacts.id))
    .where(inArray(outreachEmails.status, ['needs_approval', 'draft']));

  const activeOpportunityIds = new Set(
    activeRows.map((row) => row.contact.sourceOpportunityId).filter(Boolean) as string[],
  );

  const canceledRows = await db
    .select({ email: outreachEmails, contact: sponsorContacts })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(outreachEmails.sponsorContactId, sponsorContacts.id))
    .where(eq(outreachEmails.status, 'canceled'));

  const recreateOpportunityIds = new Set<string>();
  for (const row of canceledRows) {
    const businessName = row.contact.businessName ?? '';
    if (!TARGET_BUSINESS_RE.test(businessName)) continue;
    const oppId = row.contact.sourceOpportunityId;
    if (!oppId) {
      report.skipped.push({ key: businessName, reason: 'missing_opportunity' });
      continue;
    }
    if (activeOpportunityIds.has(oppId)) {
      report.skipped.push({ key: `${businessName}:${oppId}`, reason: 'active_draft_exists' });
      continue;
    }
    recreateOpportunityIds.add(oppId);
  }

  for (const contentItemId of recreateOpportunityIds) {
    try {
      const result = await draftSponsorOutreachFromOpportunity(contentItemId, {
        ignoreDailyCap: true,
      });
      if (result.skipped || !result.emailId) {
        report.skipped.push({
          key: contentItemId,
          reason: result.skipped ?? 'no_email_id',
        });
        continue;
      }
      const contact = await db
        .select({ businessName: sponsorContacts.businessName })
        .from(sponsorContacts)
        .where(eq(sponsorContacts.sourceOpportunityId, contentItemId))
        .limit(1);
      report.created.push({
        contentItemId,
        businessName: contact[0]?.businessName ?? contentItemId,
        emailId: result.emailId,
      });
    } catch (err) {
      report.skipped.push({
        key: contentItemId,
        reason: err instanceof Error ? err.message : 'error',
      });
    }
  }

  for (const row of activeRows) {
    const businessName = row.contact.businessName ?? '';
    if (!/\b21c museum hotel/i.test(businessName)) continue;
    if (!draftUsesDateNightLanguage(row.email.subject, row.email.body)) continue;

    try {
      const updated = await regenerateOutreachApprovalDraft(row.email.id);
      report.regenerated.push({
        emailId: updated.id,
        businessName,
        subject: updated.subject,
      });
    } catch (err) {
      report.skipped.push({
        key: row.email.id,
        reason: err instanceof Error ? err.message : 'error',
      });
    }
  }

  return report;
}
