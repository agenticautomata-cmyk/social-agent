import { Hono } from 'hono';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  contentItems,
  industries,
  personas,
  publications,
  publishingTargets,
  sources,
  type ContentState,
} from '@social-agent/core';
import { contentItemToOpportunity } from '@social-agent/core/opportunities';

export const opportunitiesRoute = new Hono();

const ListQuery = z.object({
  campaignId: z.string().uuid().optional(),
  state: z.string().optional(),
  reddit: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  sourceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const STATE_VALUES: ContentState[] = [
  'planned',
  'script_drafted',
  'script_approved',
  'script_rejected',
  'assets_ready',
  'video_generating',
  'video_ready',
  'post_production',
  'ready_to_publish',
  'scheduled',
  'published',
  'failed',
  'cancelled',
];

opportunitiesRoute.get('/', async (c) => {
  const parsed = ListQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'invalid query', issues: parsed.error.issues }, 400);
  const { campaignId, state, reddit, sourceId, limit } = parsed.data;

  const conditions = [];
  if (campaignId) conditions.push(eq(contentItems.campaignId, campaignId));
  if (state && (STATE_VALUES as string[]).includes(state)) {
    conditions.push(eq(contentItems.state, state as ContentState));
  }
  if (reddit) conditions.push(isNotNull(contentItems.sourceId));
  if (sourceId) conditions.push(eq(contentItems.sourceId, sourceId));

  const rows = await db
    .select({
      item: contentItems,
      industryName: industries.name,
      personaName: personas.name,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(industries, eq(industries.id, contentItems.industryId))
    .leftJoin(personas, eq(personas.id, contentItems.personaId))
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contentItems.createdAt))
    .limit(limit);

  return c.json({
    items: rows.map(({ item, industryName, personaName, sourceName, sourceType }) => ({
      opportunity: contentItemToOpportunity(item),
      industryName,
      personaName,
      sourceName,
      sourceType,
    })),
  });
});

opportunitiesRoute.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [item] = await db.select().from(contentItems).where(eq(contentItems.id, id));
  if (!item) return c.json({ error: 'not found' }, 404);

  const pubRows = await db
    .select({
      pub: publications,
      target: publishingTargets,
    })
    .from(publications)
    .innerJoin(publishingTargets, eq(publishingTargets.id, publications.targetId))
    .where(eq(publications.contentItemId, id));

  return c.json({
    opportunity: contentItemToOpportunity(item),
    publications: pubRows,
  });
});
