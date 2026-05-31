import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { emailTemplates } from '../schema.js';

export type EmailTemplateRecord = {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function rowToRecord(row: typeof emailTemplates.$inferSelect): EmailTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    subject: row.subject,
    body: row.body,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listEmailTemplates(activeOnly = true): Promise<EmailTemplateRecord[]> {
  const rows = activeOnly
    ? await db.select().from(emailTemplates).where(eq(emailTemplates.active, true))
    : await db.select().from(emailTemplates);
  return rows.map(rowToRecord);
}

export async function getEmailTemplate(id: string): Promise<EmailTemplateRecord | null> {
  const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getEmailTemplateByType(type: string): Promise<EmailTemplateRecord | null> {
  const rows = await db.select().from(emailTemplates).where(eq(emailTemplates.type, type)).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}
