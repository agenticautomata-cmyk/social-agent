import 'server-only';

/** Server-only runtime flags for layout (no secrets). */
export function getRuntimeStatus() {
  const demoMode =
    process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
  const preAlpha =
    process.env.ENABLE_PRE_ALPHA_LABELS === 'true' ||
    process.env.ENABLE_PRE_ALPHA_LABELS === '1' ||
    process.env.ENABLE_OPPORTUNITIES_UI === 'true' ||
    process.env.ENABLE_OPPORTUNITIES_UI === '1';

  return {
    demoMode,
    showPreAlphaBanner: false,
  };
}
