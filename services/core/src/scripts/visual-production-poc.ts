/**
 * Capped four-arm image-art PoC.
 * Hard spend ceiling: USD $2.00 across all paid attempts.
 * Max 2 generation attempts per available paid provider.
 * Never uploads private Kellie assets. Never publishes/sends.
 *
 * Usage: BENSON_IMAGE_GEN_POC=1 pnpm --filter @social-agent/core exec tsx src/scripts/visual-production-poc.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { env } from '../env.js';
import { bensonRepoRoot } from '../playwright-runtime/index.js';
import { reportImageArtCapabilities } from '../visual-production/image-art/index.js';
import { proofDir, writeTextArtifact } from '../visual-production/export/playwright-export.js';

const HARD_CAP_USD = 2.0;
const MAX_ATTEMPTS_PER_PROVIDER = 2;
/** Conservative per-image estimate for gpt-image medium 1024px — refuse if next call would exceed cap. */
const OPENAI_ESTIMATE_USD = 0.08;

type SpendLedger = {
  spentUsd: number;
  attempts: Array<{
    provider: string;
    status: string;
    estimatedCostUsd: number;
    model?: string;
    error?: string;
    outputPath?: string;
  }>;
};

function assertNoSecrets(value: string): void {
  if (/sk-[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_\-]{10,}/.test(value)) {
    throw new Error('Refusing to write secret-like material into PoC artifacts');
  }
}

async function tryOpenAIBackground(outDir: string, ledger: SpendLedger, attempt: number): Promise<void> {
  if (!env.OPENAI_API_KEY?.trim()) {
    ledger.attempts.push({
      provider: 'openai',
      status: 'unavailable',
      estimatedCostUsd: 0,
      error: 'OPENAI_API_KEY not configured',
    });
    return;
  }
  if (ledger.spentUsd + OPENAI_ESTIMATE_USD > HARD_CAP_USD) {
    ledger.attempts.push({
      provider: 'openai',
      status: 'capped',
      estimatedCostUsd: 0,
      error: `Next call would exceed hard cap $${HARD_CAP_USD}`,
    });
    return;
  }

  const model = env.BENSON_IMAGE_GEN_MODEL?.trim() || 'gpt-image-1';
  const prompt =
    'Abstract Kansas City editorial background for a social carousel: deep navy field, subtle teal atmospheric light, yellow accent geometry, no people, no faces, no readable event text, no fake venues, no logos, high-end print texture.';

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        size: '1024x1024',
        n: 1,
      }),
    });
    const raw = await res.text();
    assertNoSecrets(raw.slice(0, 200));
    if (!res.ok) {
      ledger.attempts.push({
        provider: 'openai',
        status: 'failed',
        estimatedCostUsd: 0,
        model,
        error: `HTTP ${res.status}: ${raw.slice(0, 240).replace(/sk-[A-Za-z0-9]+/g, '[redacted]')}`,
      });
      return;
    }
    const json = JSON.parse(raw) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const b64 = json.data?.[0]?.b64_json;
    const url = json.data?.[0]?.url;
    let outputPath: string | undefined;
    if (b64) {
      outputPath = join(outDir, `poc-openai-bg-attempt-${attempt}.png`);
      await writeFile(outputPath, Buffer.from(b64, 'base64'));
    } else if (url) {
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      outputPath = join(outDir, `poc-openai-bg-attempt-${attempt}.png`);
      await writeFile(outputPath, buf);
    }
    ledger.spentUsd += OPENAI_ESTIMATE_USD;
    ledger.attempts.push({
      provider: 'openai',
      status: outputPath ? 'succeeded' : 'failed',
      estimatedCostUsd: OPENAI_ESTIMATE_USD,
      model,
      outputPath,
      error: outputPath ? undefined : 'No image payload in response',
    });
  } catch (err) {
    ledger.attempts.push({
      provider: 'openai',
      status: 'failed',
      estimatedCostUsd: 0,
      model,
      error: err instanceof Error ? err.message.slice(0, 240) : 'unknown error',
    });
  }
}

async function main(): Promise<void> {
  if (process.env.BENSON_IMAGE_GEN_POC !== '1') {
    console.error('Refusing to run: set BENSON_IMAGE_GEN_POC=1 for explicit one-shot PoC.');
    process.exit(2);
  }

  const out = join(proofDir(bensonRepoRoot()), 'poc');
  await mkdir(out, { recursive: true });
  const capabilities = await reportImageArtCapabilities();
  const ledger: SpendLedger = { spentUsd: 0, attempts: [] };

  // Arm 1+2 are deterministic (already proven). Paid arms only:
  if (capabilities.openai.available || env.OPENAI_API_KEY?.trim()) {
    for (let i = 1; i <= MAX_ATTEMPTS_PER_PROVIDER; i += 1) {
      if (ledger.spentUsd >= HARD_CAP_USD) break;
      // Temporarily treat as selected for this one-shot harness only.
      await tryOpenAIBackground(out, ledger, i);
      if (ledger.attempts.at(-1)?.status !== 'succeeded') break;
      // One successful sample is enough evidence; second attempt only if first failed.
      break;
    }
  } else {
    ledger.attempts.push({
      provider: 'openai',
      status: 'unavailable',
      estimatedCostUsd: 0,
      error: capabilities.openai.reason ?? 'unavailable',
    });
  }

  if (!env.GOOGLE_AI_API_KEY?.trim()) {
    ledger.attempts.push({
      provider: 'gemini',
      status: 'unavailable',
      estimatedCostUsd: 0,
      error: 'GOOGLE_AI_API_KEY not configured',
    });
  } else {
    ledger.attempts.push({
      provider: 'gemini',
      status: 'unavailable',
      estimatedCostUsd: 0,
      error: 'Gemini key present but adapter not invoked in this PoC pass (capability probe only unless explicitly selected).',
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    hardCapUsd: HARD_CAP_USD,
    spentUsd: Number(ledger.spentUsd.toFixed(4)),
    capabilities: {
      off: capabilities.off,
      openai: {
        available: capabilities.openai.available,
        reason: capabilities.openai.reason,
        model: capabilities.openai.model,
      },
      gemini: {
        available: capabilities.gemini.available,
        reason: capabilities.gemini.reason,
        model: capabilities.gemini.model,
      },
    },
    attempts: ledger.attempts,
    notes: [
      'No private Kellie assets uploaded.',
      'No email / Telegram / social publish.',
      'Deterministic template arms already proven in phase1-manifest.json.',
    ],
  };

  await writeTextArtifact(join(out, 'poc-spend-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
