import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, sponsorContacts } from '../schema.js';
import { evaluateAngleForInventory } from './match-angle.js';
import {
  draftUsesDateNightLanguage,
  draftUsesLuxuryDateNightLanguage,
  evaluateDraftQuality,
  isNearDuplicateDraft,
} from './draft-quality.js';
import type { DraftAngleAudit } from './types.js';
import { loadInventoryItemById } from '../sponsor-outreach/contacts.js';

export type DraftAuditReport = {
  totalDrafts: number;
  dateNightLanguage: number;
  luxuryDateNightLanguage: number;
  dateNightValid: number;
  misclassified: number;
  duplicated: number;
  noDefensibleAngle: number;
  archived: number;
  items: DraftAngleAudit[];
};

export async function auditExistingDrafts(options?: { archiveInvalid?: boolean }): Promise<DraftAuditReport> {
  const rows = await db
    .select({
      email: outreachEmails,
      contact: sponsorContacts,
    })
    .from(outreachEmails)
    .innerJoin(sponsorContacts, eq(outreachEmails.sponsorContactId, sponsorContacts.id))
    .where(inArray(outreachEmails.status, ['needs_approval', 'draft']))
    .orderBy(desc(outreachEmails.updatedAt));

  const items: DraftAngleAudit[] = [];
  const fingerprints: Array<{
    emailId: string;
    businessName: string;
    subject: string;
    body: string;
    angleFamily: string;
  }> = [];

  for (const row of rows) {
    const opportunity = row.contact.sourceOpportunityId
      ? await loadInventoryItemById(row.contact.sourceOpportunityId)
      : null;
    const angle = opportunity
      ? evaluateAngleForInventory(opportunity)
      : {
          family: 'no_valid_angle' as const,
          valid: false,
          dateNightEligible: false,
          entityType: 'unknown' as const,
          pitchAngle: 'NO VALID ANGLE',
          contentAngle: 'NO VALID ANGLE',
          sponsorshipAsk: 'NO VALID ANGLE',
          templateType: 'introduction',
          explanation: ['missing_opportunity_context'],
          luxuryEvidence: false,
        };

    const quality = evaluateDraftQuality({
      subject: row.email.subject,
      body: row.email.body,
      angle,
      contactEmail: row.contact.email,
      contactName: row.contact.contactName,
      businessName: row.contact.businessName,
    });

    const usesDateNight = draftUsesDateNightLanguage(row.email.subject, row.email.body);
    const usesLuxuryDateNight = draftUsesLuxuryDateNightLanguage(row.email.subject, row.email.body);

    const duplicate = fingerprints.some((prev) =>
      isNearDuplicateDraft(
        {
          businessName: row.contact.businessName,
          subject: row.email.subject,
          body: row.email.body,
          angleFamily: angle.family,
        },
        prev,
      ),
    );

    fingerprints.push({
      emailId: row.email.id,
      businessName: row.contact.businessName,
      subject: row.email.subject,
      body: row.email.body,
      angleFamily: angle.family,
    });

    const misclassified =
      quality.blockedReasons.includes('article_misclassified_as_restaurant_opening') ||
      (usesLuxuryDateNight && !angle.dateNightEligible) ||
      (usesDateNight && !angle.dateNightEligible);

    let recommendedAction: DraftAngleAudit['recommendedAction'] = 'keep';
    if (!quality.showToKellie || misclassified || duplicate) {
      recommendedAction = options?.archiveInvalid ? 'archive' : 'regenerate';
    }

    items.push({
      emailId: row.email.id,
      businessName: row.contact.businessName,
      subject: row.email.subject,
      usesDateNightLanguage: usesDateNight,
      usesLuxuryDateNightLanguage: usesLuxuryDateNight,
      dateNightValid: usesDateNight ? angle.dateNightEligible : true,
      misclassified,
      duplicate,
      noDefensibleAngle: !angle.valid,
      recommendedAction,
      detectedFamily: angle.family,
    });
  }

  let archived = 0;
  if (options?.archiveInvalid) {
    for (const item of items) {
      if (item.recommendedAction !== 'archive') continue;
      await db
        .update(outreachEmails)
        .set({
          status: 'canceled',
          pitchReadinessStatus: 'needs_angle',
          updatedAt: new Date(),
        })
        .where(eq(outreachEmails.id, item.emailId));
      archived += 1;
    }
  }

  return {
    totalDrafts: items.length,
    dateNightLanguage: items.filter((i) => i.usesDateNightLanguage).length,
    luxuryDateNightLanguage: items.filter((i) => i.usesLuxuryDateNightLanguage).length,
    dateNightValid: items.filter((i) => i.usesDateNightLanguage && i.dateNightValid).length,
    misclassified: items.filter((i) => i.misclassified).length,
    duplicated: items.filter((i) => i.duplicate).length,
    noDefensibleAngle: items.filter((i) => i.noDefensibleAngle).length,
    archived,
    items,
  };
}

export function summarizeDraftAudit(report: DraftAuditReport) {
  return {
    totalDrafts: report.totalDrafts,
    dateNightLanguage: report.dateNightLanguage,
    luxuryDateNightLanguage: report.luxuryDateNightLanguage,
    dateNightValid: report.dateNightValid,
    misclassified: report.misclassified,
    duplicated: report.duplicated,
    noDefensibleAngle: report.noDefensibleAngle,
    archived: report.archived,
  };
}
