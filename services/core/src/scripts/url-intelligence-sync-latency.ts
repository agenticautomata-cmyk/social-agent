import { askBenson } from '../ask-benson/ask.js';
import { submitCreatorPartnership } from '../creator-partnership/index.js';

const SCHEELS =
  'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';

async function main() {
  const tSubmit = Date.now();
  const submit = await submitCreatorPartnership(
    {
      url: SCHEELS,
      text: SCHEELS,
      sourceScreen: 'timing',
      initialIntakeRoute: 'local_discovery',
    },
    { skipResearch: true },
  );
  console.log(
    JSON.stringify({
      step: 'submit',
      wallMs: Date.now() - tSubmit,
      syncMs: submit.syncMs,
      duplicate: submit.duplicate,
      partnershipId: submit.partnershipId,
      skipResearch: true,
    }),
  );

  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = Date.now();
    const res = await submitCreatorPartnership(
      {
        url: SCHEELS,
        text: SCHEELS,
        sourceScreen: 'timing',
        initialIntakeRoute: 'local_discovery',
      },
      { skipResearch: true },
    );
    const ms = Date.now() - start;
    samples.push(ms);
    console.log(
      JSON.stringify({
        step: 'submit_loop',
        i,
        wallMs: ms,
        syncMs: res.syncMs,
        partnershipId: res.partnershipId,
        duplicate: res.duplicate,
        skipResearch: true,
      }),
    );
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      step: 'summary',
      p50: samples[9],
      p95: samples[18],
      max: samples[19],
      min: samples[0],
      all: samples,
      note: 'All iterations use internal skipResearch — no paid partnership research',
    }),
  );

  const askStart = Date.now();
  const ask = await askBenson({ message: SCHEELS });
  console.log(
    JSON.stringify({
      step: 'ask_once',
      wallMs: Date.now() - askStart,
      ok: ask.ok,
      partnershipId: ask.collection?.partnershipId,
      note: 'Single askBenson for routing smoke only; research singleflight prevents N×6 bursts',
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
