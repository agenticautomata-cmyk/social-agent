import { readDeploymentParity } from './index.js';

const root = process.argv[2] || process.cwd();
const p = await readDeploymentParity(root);
console.log(JSON.stringify({ ok: true, ...p, checkedAt: new Date().toISOString() }, null, 2));
process.exit(p.status === 'MATCH' ? 0 : 2);
