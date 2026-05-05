// Persona Picker — picks a persona for items needing a face.
//   - testimonial / case_study / success_story / transformation → persona
//   - explainer / educational / founder_message / industry_insight → founder avatar
//
// For persona-typed items, prefers reusing existing persona for the industry
// (round-robin by uses_count); generates a new portrait if none exist.

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import {
  db,
  campaigns,
  personas,
  contentItems,
  assets,
  providers,
} from '@social-agent/core';
import type { ContentType } from '@social-agent/core';
import { createWorker } from '../runtime.js';

const imageGen = providers.createImageProvider();

const PERSONA_TYPES: ContentType[] = [
  'testimonial',
  'case_study',
  'success_story',
  'transformation',
];

export const personaPickerWorker = createWorker({
  name: 'persona-picker',
  inputState: 'script_approved',
  process: async (item) => {
    const usesPersona = PERSONA_TYPES.includes(item.type);

    if (!usesPersona) {
      // founder content — verify campaign has founder avatar configured
      const campaign = await db.query.campaigns.findFirst({
        where: eq(campaigns.id, item.campaignId),
      });
      if (!campaign?.founderHeygenAvatarId || !campaign?.founderHeygenVoiceId) {
        throw new Error('campaign missing founder_heygen_avatar_id / voice_id');
      }
      return { nextState: 'assets_ready', payload: { mode: 'founder' } };
    }

    // Pick least-used active persona for this industry+campaign
    let persona = await db.query.personas.findFirst({
      where: and(
        eq(personas.campaignId, item.campaignId),
        item.industryId ? eq(personas.industryId, item.industryId) : sql`true`,
        eq(personas.active, true)
      ),
      orderBy: [asc(personas.usesCount), desc(personas.createdAt)],
    });

    // If no persona exists for this industry, create one
    if (!persona) {
      const ind = item.industryId
        ? await db.query.industries.findFirst({
            where: (i) => eq(i.id, item.industryId!),
          })
        : null;
      const role = ind?.name?.toLowerCase().replace(/s$/, '') ?? 'business owner';
      const portraitPrompt = `professional headshot of a ${role}, neutral studio lighting, friendly approachable expression, candid mid-shot`;
      const portrait = await imageGen.generatePortrait({ prompt: portraitPrompt });

      const [created] = await db
        .insert(personas)
        .values({
          campaignId: item.campaignId,
          industryId: item.industryId ?? null,
          name: `${ind?.name ?? 'Industry'} Persona`,
          role,
          portraitImageUrl: portrait.url,
          portraitPrompt,
          // In real mode, an additional step would upload the portrait to HeyGen
          // and store the resulting Photo Avatar id here. For now, use a deterministic
          // mock id so the demo still flows.
          heygenAvatarId: `photo_avatar_mock_${Math.random().toString(36).slice(2, 10)}`,
          heygenVoiceId: `voice_mock_${Math.random().toString(36).slice(2, 10)}`,
        })
        .returning();
      persona = created!;

      await db.insert(assets).values({
        personaId: persona.id,
        kind: 'persona_portrait',
        url: portrait.url,
        mimeType: 'image/jpeg',
        metadata: { prompt: portraitPrompt, mode: imageGen.mode },
      });
    }

    await db
      .update(contentItems)
      .set({ personaId: persona.id })
      .where(eq(contentItems.id, item.id));

    await db
      .update(personas)
      .set({ usesCount: sql`${personas.usesCount} + 1`, lastUsedAt: new Date() })
      .where(eq(personas.id, persona.id));

    return { nextState: 'assets_ready', payload: { personaId: persona.id, mode: 'persona' } };
  },
});
