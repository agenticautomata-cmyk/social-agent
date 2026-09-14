import { randomUUID } from 'node:crypto';
import { emitDataChange } from '../../data-revision/index.js';
import { pickCanonicalArticleUrl } from './canonical-url.js';
import { fetchEditorialArticle } from './article-fetch.js';
import { extractEditorialOpportunities } from './extract.js';
import {
  classifyEditorialContentType,
  hasEditorialOpportunitySignal,
  isPersistableEditorialOpportunity,
} from './classifier.js';
import { persistEditorialOpportunity } from './persist.js';
import type { ArticleAccessStatus, EditorialOpportunityRunResult } from './types.js';

export async function processEditorialEmailOpportunities(input: {
  gmailMessageId: string;
  discoveryEmailMessageId?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  urls: string[];
  senderEmail?: string | null;
  senderName?: string | null;
  receivedAt?: Date;
  dryRun?: boolean;
  notifyTelegram?: boolean;
  fetchArticle?: boolean;
  runId?: string;
}): Promise<EditorialOpportunityRunResult> {
  const runId = input.runId ?? randomUUID();
  const emailText = (input.bodyText || '').trim() || stripHtml(input.bodyHtml ?? '');
  const blob = `${input.subject}\n${emailText}`;

  const rejected: EditorialOpportunityRunResult['rejected'] = [];

  if (!hasEditorialOpportunitySignal(blob)) {
    const contentType = classifyEditorialContentType({ text: emailText, subject: input.subject });
    return {
      runId,
      gmailMessageId: input.gmailMessageId,
      discoveryEmailMessageId: input.discoveryEmailMessageId ?? null,
      opportunitiesCreated: 0,
      opportunitiesMerged: 0,
      opportunitiesRejected: 1,
      articleAccess: 'not_attempted',
      contentItemIds: [],
      telegramNotifiedIds: [],
      candidates: [],
      rejected: [{ reason: contentType === 'news_only' ? 'news_only' : 'no_editorial_signal', detail: contentType }],
    };
  }

  const canonicalArticleUrl = pickCanonicalArticleUrl(input.urls);
  let articleAccess: ArticleAccessStatus = 'email_evidence_only';
  let articleText: string | null = null;
  let publicationDate: string | null = null;

  if (input.fetchArticle !== false && canonicalArticleUrl) {
    const article = await fetchEditorialArticle(canonicalArticleUrl);
    articleAccess = article.access;
    articleText = article.text;
    publicationDate = article.publicationDate;
    if (article.access !== 'fetched') {
      // Keep going on email evidence — do not discard strong email-supported opportunities.
      rejected.push({
        reason: 'article_inaccessible',
        detail: article.blockedReason ?? article.access,
      });
    }
  }

  const candidates = extractEditorialOpportunities({
    subject: input.subject,
    emailText,
    articleText,
    canonicalArticleUrl,
    emailSource: input.senderName ?? input.senderEmail ?? null,
    publicationDate,
    articleAccess,
    receivedAt: input.receivedAt,
  });

  if (candidates.length === 0) {
    const contentType = classifyEditorialContentType({
      text: emailText,
      subject: input.subject,
      articleBlocked: articleAccess === 'blocked' || articleAccess === 'subscription_required',
    });
    rejected.push({
      reason: isPersistableEditorialOpportunity(contentType)
        ? 'no_supported_business_entity'
        : contentType,
    });
    return {
      runId,
      gmailMessageId: input.gmailMessageId,
      discoveryEmailMessageId: input.discoveryEmailMessageId ?? null,
      opportunitiesCreated: 0,
      opportunitiesMerged: 0,
      opportunitiesRejected: rejected.length,
      articleAccess,
      contentItemIds: [],
      telegramNotifiedIds: [],
      candidates: [],
      rejected,
    };
  }

  let opportunitiesCreated = 0;
  let opportunitiesMerged = 0;
  const contentItemIds: string[] = [];
  const telegramNotifiedIds: string[] = [];

  for (const candidate of candidates) {
    const result = await persistEditorialOpportunity({
      candidate,
      gmailMessageId: input.gmailMessageId,
      discoveryEmailMessageId: input.discoveryEmailMessageId ?? null,
      runId,
      subject: input.subject,
      dryRun: input.dryRun,
      notifyTelegram: input.notifyTelegram,
    });
    contentItemIds.push(result.contentItemId);
    if (result.created) opportunitiesCreated += 1;
    if (result.duplicateMerged) opportunitiesMerged += 1;
    if (result.telegramSent) telegramNotifiedIds.push(result.contentItemId);
  }

  if (!input.dryRun && contentItemIds.length > 0) {
    await emitDataChange({
      eventType: 'manual_update',
      domains: ['opportunities', 'discoveries', 'recommendations', 'home_briefing'],
      completedAt: new Date().toISOString(),
      source: 'editorial-email-opportunity',
      recordIds: contentItemIds,
      success: true,
      metadata: {
        runId,
        gmailMessageId: input.gmailMessageId,
        opportunitiesCreated,
        opportunitiesMerged,
        articleAccess,
      },
    });
  }

  return {
    runId,
    gmailMessageId: input.gmailMessageId,
    discoveryEmailMessageId: input.discoveryEmailMessageId ?? null,
    opportunitiesCreated,
    opportunitiesMerged,
    opportunitiesRejected: rejected.length,
    articleAccess,
    contentItemIds,
    telegramNotifiedIds,
    candidates,
    rejected,
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
