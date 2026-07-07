import 'dotenv/config';
import { askBenson } from '../ask-benson/ask.js';

const QUESTIONS = [
  'What should I post next?',
  'Who should I pitch first?',
  'Why are followers unavailable?',
  'What is my best posting time?',
  'What businesses do I mention most?',
];

async function main() {
  console.log('Ask Benson verification\n');

  let passed = 0;
  let failed = 0;

  for (const message of QUESTIONS) {
    console.log(`\n--- Q: ${message} ---`);
    try {
      const result = await askBenson({ message, pageContext: '/verify' });
      const ok =
        result.ok &&
        result.answer.length > 20 &&
        result.confidence >= 0 &&
        result.evidence.length >= 0;

      if (ok) {
        passed++;
        console.log('PASS');
      } else {
        failed++;
        console.log('FAIL');
      }

      console.log(`Answer: ${result.answer.slice(0, 280)}${result.answer.length > 280 ? '…' : ''}`);
      console.log(`Evidence: ${result.evidence.join(' | ') || '(none)'}`);
      console.log(`Confidence: ${result.confidence}`);
      console.log(`Cost: ${result.estimatedCost ?? 0} (cached: ${result.cached})`);
      if (result.error) console.log(`Error: ${result.error}`);
    } catch (err) {
      failed++;
      console.log('FAIL');
      console.error(err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n=== ${passed}/${QUESTIONS.length} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
