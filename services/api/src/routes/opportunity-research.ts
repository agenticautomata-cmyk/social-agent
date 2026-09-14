import { Hono } from 'hono';
import {
  expressCreatorInterest,
  getDiscoveryRecord,
  describeInterestNextStep,
} from '@social-agent/core/creator-interest';
import {
  getOpportunityResearchView,
  runOpportunityResearch,
  evaluateContactBusinessGate,
} from '@social-agent/core/opportunity-research';

export const opportunityResearchRoute = new Hono();

opportunityResearchRoute.get('/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const view = await getOpportunityResearchView(contentItemId);
  if (!view) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, ...view });
});

/**
 * Start Research this for an opportunity. Uses the same creator-interest
 * research job path when possible so Discoveries + Opportunities stay unified.
 */
opportunityResearchRoute.post('/:contentItemId/research', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  try {
    const interest = await expressCreatorInterest({
      contentItemId,
      action: 'research',
      sourceScreen: 'opportunity_research',
    });
    // If duplicate interest returned without a fresh job, run dossier directly.
    if (!interest.researchJobId) {
      const result = await runOpportunityResearch({
        contentItemId: interest.contentItemId,
        trigger: 'research_this_api',
      });
      return c.json({
        ok: true,
        researchRunId: result.researchRunId,
        researchJobId: null,
        contentItemId: result.contentItemId,
        dossier: result.dossier,
        outreachSent: false,
        nextStep: describeInterestNextStep('research'),
      });
    }

    // Job runs async; return current view + job id for progress polling.
    const view = await getOpportunityResearchView(interest.contentItemId);
    const record = await getDiscoveryRecord(interest.contentItemId);
    return c.json({
      ok: true,
      researchJobId: interest.researchJobId,
      researchRunId:
        (view?.dossier?.researchRunId as string | undefined) ??
        (record?.opportunityResearch?.researchRunId as string | undefined) ??
        null,
      contentItemId: interest.contentItemId,
      dossier: view?.dossier ?? record?.opportunityResearch ?? null,
      status: record?.researchJob?.status ?? 'queued',
      outreachSent: false,
      nextStep: describeInterestNextStep('research'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

opportunityResearchRoute.get('/:contentItemId/contact-gate', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const view = await getOpportunityResearchView(contentItemId);
  if (!view) return c.json({ ok: false, error: 'not_found' }, 404);
  const gate = evaluateContactBusinessGate(view.dossier);
  return c.json({ ok: true, gate, dossier: view.dossier });
});

opportunityResearchRoute.post('/:contentItemId/research/sync', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  try {
    const result = await runOpportunityResearch({
      contentItemId,
      trigger: 'research_this_sync',
    });
    return c.json({
      ok: true,
      researchRunId: result.researchRunId,
      contentItemId: result.contentItemId,
      dossier: result.dossier,
      duplicateContactsAvoided: result.duplicateContactsAvoided,
      createdOpportunity: false,
      outreachSent: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});
