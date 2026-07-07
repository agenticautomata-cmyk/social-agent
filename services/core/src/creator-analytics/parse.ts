import { getCreatorTimezone, timezoneShortLabel } from '../datetime.js';
import type { ImportVideoRow } from './types.js';

export { getCreatorTimezone } from '../datetime.js';

export function computeEngagementRate(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  saves: number | null | undefined,
  provided?: number | null,
): number {
  if (provided != null && !Number.isNaN(provided)) return Number(provided);
  if (views <= 0) return 0;
  const interactions = likes + comments + shares + (saves ?? 0);
  return Math.round((interactions / views) * 10000) / 10000;
}

export function parseNumeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvText(csv: string): { rows: ImportVideoRow[]; errors: Array<{ row: number; message: string }> } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'CSV is empty' }] };
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const required = ['video_id', 'published_at'];
  for (const col of required) {
    if (!header.includes(col)) {
      return { rows: [], errors: [{ row: 1, message: `Missing required column: ${col}` }] };
    }
  }

  const rows: ImportVideoRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      record[key] = values[idx] ?? '';
    });

    if (!record.video_id) {
      errors.push({ row: i + 1, message: 'video_id is required' });
      continue;
    }
    if (!record.published_at) {
      errors.push({ row: i + 1, message: 'published_at is required' });
      continue;
    }

    rows.push({
      video_id: record.video_id,
      title: record.title || null,
      caption: record.caption || null,
      post_url: record.post_url || null,
      thumbnail_url: record.thumbnail_url || null,
      published_at: record.published_at,
      content_category: record.content_category || null,
      content_pillar: record.content_pillar || null,
      location_tag: record.location_tag || null,
      sponsor_tag: record.sponsor_tag || null,
      opportunity_id: record.opportunity_id || null,
      views: parseNumeric(record.views),
      likes: parseNumeric(record.likes),
      comments: parseNumeric(record.comments),
      shares: parseNumeric(record.shares),
      saves: parseNumeric(record.saves),
      watch_time_seconds: parseNumeric(record.watch_time_seconds),
      average_watch_duration_seconds: parseNumeric(record.average_watch_duration_seconds),
      completion_rate: parseNumeric(record.completion_rate),
      follower_count_snapshot: parseNumeric(record.follower_count_snapshot),
    });
  }

  return { rows, errors };
}

export function parseJsonImport(body: unknown): {
  rows: ImportVideoRow[];
  errors: Array<{ row: number; message: string }>;
} {
  if (!Array.isArray(body)) {
    return { rows: [], errors: [{ row: 0, message: 'JSON must be an array of video objects' }] };
  }

  const rows: ImportVideoRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  body.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      errors.push({ row: idx + 1, message: 'Invalid object' });
      return;
    }
    const row = item as Record<string, unknown>;
    if (!row.video_id || !row.published_at) {
      errors.push({ row: idx + 1, message: 'video_id and published_at are required' });
      return;
    }

    rows.push({
      video_id: String(row.video_id),
      title: row.title != null ? String(row.title) : null,
      caption: row.caption != null ? String(row.caption) : null,
      post_url: row.post_url != null ? String(row.post_url) : null,
      thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
      published_at: String(row.published_at),
      content_category: row.content_category != null ? String(row.content_category) : null,
      content_pillar: row.content_pillar != null ? String(row.content_pillar) : null,
      location_tag: row.location_tag != null ? String(row.location_tag) : null,
      sponsor_tag: row.sponsor_tag != null ? String(row.sponsor_tag) : null,
      opportunity_id: row.opportunity_id != null ? String(row.opportunity_id) : null,
      views: parseNumeric(row.views),
      likes: parseNumeric(row.likes),
      comments: parseNumeric(row.comments),
      shares: parseNumeric(row.shares),
      saves: parseNumeric(row.saves),
      watch_time_seconds: parseNumeric(row.watch_time_seconds),
      average_watch_duration_seconds: parseNumeric(row.average_watch_duration_seconds),
      completion_rate: parseNumeric(row.completion_rate),
      follower_count_snapshot: parseNumeric(row.follower_count_snapshot),
      engagement_rate: parseNumeric(row.engagement_rate),
    });
  });

  return { rows, errors };
}

export function parsePublishedAt(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Creator-local weekday + hour bucket for posting-time analysis. */
export function postTimeBucket(date: Date, timezone = getCreatorTimezone()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Unknown';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return `${weekday} ${hour}:00 ${timezoneShortLabel(timezone, date)}`;
}

/** Weekday-only bucket — groups more samples for posting-time recommendations. */
export function weekdayBucket(date: Date, timezone = getCreatorTimezone()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(date);
}
