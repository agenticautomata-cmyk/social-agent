/**
 * Writes a rendered media kit to disk so it can be opened and visually checked.
 *
 * Verification of a generated document has to include actually looking at it — a
 * clipped section or a stale number is invisible in a passing test.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { loadMediaKitBySlug, renderMediaKitHtml } from '../media-kit/index.js';

const slug = process.argv[2] ?? 'kellie-hotel';
const out = process.argv[3] ?? `/tmp/media-kit-${slug}.html`;

const kit = await loadMediaKitBySlug(slug);
if (!kit) {
  console.error(`No media kit found for slug "${slug}".`);
  process.exit(1);
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, renderMediaKitHtml(kit.content), 'utf8');

const a = kit.content.audience;
console.log(`Wrote ${out}`);
console.log(`  variant:   ${kit.content.variant}`);
console.log(`  followers: ${a.followersCount?.toLocaleString('en-US') ?? 'unavailable'}`);
console.log(`  median:    ${a.medianViewsPerPost?.toLocaleString('en-US') ?? 'n/a'} views/post`);
console.log(`  total:     ${a.totalViews?.toLocaleString('en-US') ?? 'n/a'} views over ${a.postsWithMetrics} posts`);
console.log(`  examples:  ${kit.content.examples.length}`);
for (const example of kit.content.examples) {
  console.log(`    ${example.views?.toLocaleString('en-US')} views — ${example.title}`);
}
console.log(`  partnerships listed: ${kit.content.verifiedPartnerships.length}`);
