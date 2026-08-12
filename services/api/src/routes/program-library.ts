import { Hono } from 'hono';
import { z } from 'zod';
import {
  activateProgramLibraryRecord,
  deactivateProgramLibraryRecord,
  getProgramLibraryRecord,
  listProgramLibrary,
  saveProgramToLibrary,
  seedProgramLibrary,
  updateProgramLibraryById,
  verifyProgramMissingInfo,
} from '@social-agent/core/program-library';

export const programLibraryRoute = new Hono();

programLibraryRoute.get('/', async (c) => {
  const scope = c.req.query('scope');
  const programType = c.req.query('programType');
  const mode = c.req.query('mode');
  const needsVerification = c.req.query('needsVerification') === 'true';
  const programs = await listProgramLibrary({
    scope: scope as import('@social-agent/core/program-library').ProgramScope | undefined,
    programType: programType as import('@social-agent/core/program-library').ProgramType | undefined,
    mode: mode as import('@social-agent/core/program-library').ProgramLibraryMode | undefined,
    needsVerification,
    limit: Number(c.req.query('limit') ?? 80),
  });
  return c.json({ ok: true, programs });
});

programLibraryRoute.post('/seed', async (c) => {
  try {
    const result = await seedProgramLibrary();
    return c.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

const SaveSchema = z.object({
  programName: z.string().min(1),
  brandName: z.string().min(1),
  programType: z
    .enum(['affiliate', 'creator', 'influencer', 'referral', 'ambassador', 'other'])
    .optional(),
  scope: z.enum(['kc_local', 'regional', 'national']).optional(),
  commissionBenefit: z.string().optional().nullable(),
  audienceBenefit: z.string().optional().nullable(),
  affiliateNetwork: z.string().optional().nullable(),
  cookieWindow: z.string().optional().nullable(),
  eligibility: z.string().optional().nullable(),
  officialProgramUrl: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  contactPath: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  locationNote: z.string().optional().nullable(),
  evidenceUrls: z.array(z.string()).optional(),
  sourceScreen: z.string().optional(),
});

programLibraryRoute.post('/', async (c) => {
  try {
    const body = SaveSchema.parse(await c.req.json());
    const result = await saveProgramToLibrary({ ...body, operatorSupplied: true });
    const program = await getProgramLibraryRecord(result.programId);
    return c.json({ ok: true, result, program });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

programLibraryRoute.get('/:id', async (c) => {
  const program = await getProgramLibraryRecord(c.req.param('id'));
  if (!program) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, program });
});

programLibraryRoute.patch('/:id', async (c) => {
  try {
    const existing = await getProgramLibraryRecord(c.req.param('id'));
    if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);
    const body = SaveSchema.partial().parse(await c.req.json());
    const result = await updateProgramLibraryById(c.req.param('id'), {
      programName: body.programName ?? existing.programName,
      brandName: body.brandName ?? existing.brandName,
      ...body,
    });
    const program = await getProgramLibraryRecord(result.programId);
    return c.json({ ok: true, result, program });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

programLibraryRoute.post('/:id/activate', async (c) => {
  try {
    const result = await activateProgramLibraryRecord(c.req.param('id'));
    const program = await getProgramLibraryRecord(result.programId);
    return c.json({ ok: true, result, program });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

programLibraryRoute.post('/:id/deactivate', async (c) => {
  try {
    await deactivateProgramLibraryRecord(c.req.param('id'));
    const program = await getProgramLibraryRecord(c.req.param('id'));
    return c.json({ ok: true, program });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

programLibraryRoute.post('/:id/verify', async (c) => {
  try {
    const result = await verifyProgramMissingInfo(c.req.param('id'));
    const program = await getProgramLibraryRecord(c.req.param('id'));
    return c.json({ ok: true, result, program });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});
