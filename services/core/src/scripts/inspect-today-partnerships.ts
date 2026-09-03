/** Prints the partnership decisions Today would show, from live data. */
import { loadPartnershipDecisions } from '../partnership-today/decisions.js';

async function main(): Promise<void> {
  const decisions = await loadPartnershipDecisions();
  if (decisions.length === 0) {
    console.log('No partnership needs a decision today.');
    return;
  }
  console.log(`${decisions.length} partnership decision(s) on Today:\n`);
  for (const [i, d] of decisions.entries()) {
    console.log(`${i + 1}. ${d.title}`);
    console.log(`   kind:     ${d.kind}`);
    console.log(`   why:      ${d.why}`);
    console.log(`   comp:     ${d.compensationLabel ?? '—'}`);
    console.log(`   contact:  ${d.contactLabel ?? '—'}`);
    console.log(`   link:     ${d.href}`);
    if (d.dueDate) console.log(`   due:      ${d.dueDate}`);
    console.log();
  }
}

void main();
