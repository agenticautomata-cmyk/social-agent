import { writeRuntimeFingerprint } from './index.js';

const role = process.argv[2] as 'api' | 'workers' | 'dashboard' | 'deployed';
const fingerprint = process.argv[3];
const root = process.argv[4] || process.cwd();
const builtAt = process.argv[5] ?? null;

if (!role || !fingerprint) {
  console.error(
    'Usage: cli-write-fingerprint.ts <api|workers|dashboard|deployed> <fingerprint> [root] [builtAt]',
  );
  process.exit(1);
}

writeRuntimeFingerprint(role, fingerprint, root, { builtAt });
