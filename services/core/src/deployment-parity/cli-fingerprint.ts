import { computeSourceFingerprint } from './index.js';

const root = process.argv[2] || process.cwd();
const fp = await computeSourceFingerprint(root);
process.stdout.write(`${fp}\n`);
