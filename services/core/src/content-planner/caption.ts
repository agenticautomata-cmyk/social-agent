import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { normalizeInventoryItem } from '../inventory/normalize.js';
import { env } from '../env.js';
import { upsertPlannerItem } from './items.js';

function fallbackCaption(title: string, venue: string | null, category: string | null): string {
  const parts = [
    title,
    venue ? `📍 ${venue}` : null,
    category ? `#${category.replace(/_/g, '')}` : null,
    '#KansasCity #KC #kclife',
  ].filter(Boolean);
  return parts.join('\n\n').slice(0, 2200);
}

export async function generatePlannerCaption(contentItemId: string): Promise<{
  caption: string;
  hook: string | null;
}> {
  const [row] = await db
    .select({
      item: contentItems,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  if (!row) throw new Error('Content item not found');

  const inv = normalizeInventoryItem(row.item, row.sourceName, row.sourceType);
  const title = inv.title;
  const venue = inv.venue ?? inv.locationName ?? inv.neighborhood;
  const summary = inv.summary ?? inv.whyItMatters;

  if (env.DEMO_MODE || !env.OPENAI_API_KEY) {
    const caption = fallbackCaption(title, venue, inv.category);
    await upsertPlannerItem(contentItemId, { draftCaption: caption });
    return { caption, hook: title.slice(0, 120) };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.BENSON_ASK_MODEL,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Write TikTok captions for Kellie, a Kansas City lifestyle creator. Return JSON: { "hook": string, "caption": string }. Hook is one punchy opening line. Caption includes hook, 2-3 short lines, 3-5 KC hashtags. Keep under 400 characters total.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            title,
            venue,
            category: inv.category,
            summary,
            eventDate: inv.eventDate,
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    const caption = fallbackCaption(title, venue, inv.category);
    await upsertPlannerItem(contentItemId, { draftCaption: caption });
    return { caption, hook: title.slice(0, 120) };
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = json.choices?.[0]?.message?.content;
  let hook: string | null = null;
  let caption = fallbackCaption(title, venue, inv.category);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { hook?: string; caption?: string };
      hook = parsed.hook?.trim() ?? null;
      caption = parsed.caption?.trim() || caption;
    } catch {
      /* use fallback */
    }
  }

  await upsertPlannerItem(contentItemId, {
    draftCaption: caption,
    contentAngle: hook,
  });

  return { caption, hook };
}
