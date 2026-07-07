import { randomUUID } from 'crypto';
import type { WebsiteDraftRecord } from './drafts.js';

export type WebsiteJobStatus = 'processing' | 'complete' | 'failed';

export type WebsiteReviseJob = {
  id: string;
  draftId: string;
  status: WebsiteJobStatus;
  assistantReply: string | null;
  draft: WebsiteDraftRecord | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type WebsiteAnalysisJob = {
  id: string;
  mediaId: string;
  status: WebsiteJobStatus;
  draftId: string | null;
  draft: WebsiteDraftRecord | null;
  media: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const reviseJobs = new Map<string, WebsiteReviseJob>();
const analysisJobs = new Map<string, WebsiteAnalysisJob>();

const JOB_TTL_MS = 30 * 60 * 1000;

function pruneOldJobs<T extends { finishedAt: string | null; startedAt: string }>(map: Map<string, T>) {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of map) {
    const ts = job.finishedAt ?? job.startedAt;
    if (new Date(ts).getTime() < cutoff) map.delete(id);
  }
}

export function createWebsiteReviseJob(draftId: string): WebsiteReviseJob {
  pruneOldJobs(reviseJobs);
  const job: WebsiteReviseJob = {
    id: randomUUID(),
    draftId,
    status: 'processing',
    assistantReply: null,
    draft: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  reviseJobs.set(job.id, job);
  return job;
}

export function getWebsiteReviseJob(jobId: string): WebsiteReviseJob | null {
  return reviseJobs.get(jobId) ?? null;
}

export function completeWebsiteReviseJob(
  jobId: string,
  result: { draft: WebsiteDraftRecord; assistantReply: string },
): void {
  const job = reviseJobs.get(jobId);
  if (!job) return;
  job.status = 'complete';
  job.draft = result.draft;
  job.assistantReply = result.assistantReply;
  job.finishedAt = new Date().toISOString();
}

export function failWebsiteReviseJob(jobId: string, error: string): void {
  const job = reviseJobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.finishedAt = new Date().toISOString();
}

export function createWebsiteAnalysisJob(mediaId: string): WebsiteAnalysisJob {
  pruneOldJobs(analysisJobs);
  const job: WebsiteAnalysisJob = {
    id: randomUUID(),
    mediaId,
    status: 'processing',
    draftId: null,
    draft: null,
    media: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  analysisJobs.set(job.id, job);
  return job;
}

export function getWebsiteAnalysisJob(jobId: string): WebsiteAnalysisJob | null {
  return analysisJobs.get(jobId) ?? null;
}

export function completeWebsiteAnalysisJob(
  jobId: string,
  result: { draftId: string; draft: WebsiteDraftRecord; media: Record<string, unknown> },
): void {
  const job = analysisJobs.get(jobId);
  if (!job) return;
  job.status = 'complete';
  job.draftId = result.draftId;
  job.draft = result.draft;
  job.media = result.media;
  job.finishedAt = new Date().toISOString();
}

export function failWebsiteAnalysisJob(jobId: string, error: string): void {
  const job = analysisJobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = error;
  job.finishedAt = new Date().toISOString();
}
