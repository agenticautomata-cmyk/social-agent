/**
 * Visual production API — preview/capability/read surfaces.
 * Mutating routes refuse when BENSON_VISUAL_PRODUCTION_ENABLED is false.
 * Never sends email/Telegram or publishes social.
 */
import { Hono } from 'hono';
import { env } from '@social-agent/core';
import {
  reportImageArtCapabilities,
  loadWeekendDropTheme,
  lockWeekendFactSheet,
  packWeekendSlides,
  renderWeekendSlideHtml,
} from '@social-agent/core/visual-production';
import { loadWeekendList } from '@social-agent/core/creator-calendar';

export const visualProductionRoute = new Hono();

function enabled(): boolean {
  return env.BENSON_VISUAL_PRODUCTION_ENABLED !== false;
}

visualProductionRoute.get('/status', async (c) => {
  const capabilities = await reportImageArtCapabilities();
  const theme = loadWeekendDropTheme();
  return c.json({
    ok: true,
    enabled: enabled(),
    imageGenEnabled: env.BENSON_IMAGE_GEN_ENABLED,
    imageGenProvider: env.BENSON_IMAGE_GEN_PROVIDER,
    dailyCapUsd: env.BENSON_IMAGE_GEN_DAILY_CAP_USD,
    theme: { id: theme.id, seriesName: theme.seriesName, tagline: theme.tagline },
    capabilities,
  });
});

visualProductionRoute.get('/poc/arms', async (c) => {
  const capabilities = await reportImageArtCapabilities();
  return c.json({
    ok: true,
    arms: [
      { id: 'legacy', label: 'Legacy control', available: true },
      { id: 'template', label: 'New deterministic template', available: true },
      {
        id: 'template_openai',
        label: 'Template + OpenAI background',
        available: capabilities.openai.available && env.BENSON_IMAGE_GEN_ENABLED,
        reason: capabilities.openai.reason,
      },
      {
        id: 'template_gemini',
        label: 'Template + Gemini background',
        available: capabilities.gemini.available && env.BENSON_IMAGE_GEN_ENABLED,
        reason: capabilities.gemini.reason,
      },
    ],
    spentUsd: 0,
    hardCapUsd: 2,
  });
});

visualProductionRoute.get('/weekend-drop/preview', async (c) => {
  const list = await loadWeekendList(new Date());
  const sheet = lockWeekendFactSheet(list);
  const slides = packWeekendSlides(sheet);
  const format = c.req.query('format') === 'story' ? 'story' : 'carousel';
  const role = c.req.query('role') ?? 'cover';
  const slide =
    slides.find((s) => s.role === role) ??
    slides.find((s) => s.role === 'cover')!;
  const html = renderWeekendSlideHtml({ sheet, slide, format });
  return c.html(html);
});

visualProductionRoute.post('/projects', async (c) => {
  if (!enabled()) {
    return c.json({ ok: false, error: 'Visual production is disabled.' }, 403);
  }
  // Project persistence lands with design_projects migration; create is gated.
  return c.json({
    ok: false,
    error: 'Project create requires an approved operator flow; use preview endpoints for now.',
  }, 501);
});
