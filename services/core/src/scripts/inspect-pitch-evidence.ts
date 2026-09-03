/**
 * Prints the real audience evidence a pitch is allowed to use, so it can be eyeballed
 * against the TikTok app rather than trusted because the code says so.
 */

import {
  formatAudienceLine,
  resolvePitchAudienceEvidence,
} from '../hospitality-pitch/creator-evidence.js';

const evidence = await resolvePitchAudienceEvidence();
console.log(JSON.stringify(evidence, null, 2));
console.log('\nAudience line a pitch would use:');
console.log(formatAudienceLine(evidence) ?? '(nothing verified — pitch would be blocked)');
process.exit(0);
