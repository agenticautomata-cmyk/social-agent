import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BANNED_PITCH_PHRASES,
  checkBriefCompleteness,
  reasonableDeliverables,
  type PitchBrief,
} from './compose.js';
import { evaluatePitch, unsupportedNumbers } from './evaluate.js';
import { writeHospitalityPitch, type PitchModelCaller } from './write.js';
import type { PitchAudienceEvidence } from './creator-evidence.js';

/**
 * The real audience numbers as of 2026-09-03, so fixtures exercise the same values a
 * live pitch would use. Tests never touch the network or the analytics connector.
 */
const REAL_AUDIENCE: PitchAudienceEvidence = {
  platform: 'TikTok',
  handle: '@kckellie',
  followersCount: 6703,
  followersAvailable: true,
  lastSyncedAt: new Date().toISOString(),
  stale: false,
  postsWithMetrics: 250,
  totalViews: 1168403,
  totalEngagement: 87789,
  medianViewsPerPost: 918,
  engagementRatePercent: 7.5,
  usableClaims: [
    '@kckellie on TikTok, 6,703 followers',
    'a typical post lands around 918 views',
    '1,168,403 total views across 250 posts Benson has metrics for',
  ],
  unavailableReason: null,
};

const UNAVAILABLE_AUDIENCE: PitchAudienceEvidence = {
  ...REAL_AUDIENCE,
  followersCount: null,
  followersAvailable: false,
  usableClaims: [],
  unavailableReason: 'The TikTok connector has not returned a follower count.',
};

function baseBrief(overrides: Partial<PitchBrief> = {}): PitchBrief {
  return {
    businessName: 'Crossroads Hotel',
    propertyName: null,
    recipientEmail: 'media@crossroadshotelkc.com',
    recipientName: null,
    recipientLabel: 'media',
    whyNow: {
      headline: 'Second Company Showcase at Crossroads on Sept 5th',
      description:
        'Second Company Showcase at Crossroads on Sept 5th — Kansas City Ballet brings contemporary ballet to the hotel, free to the public.',
      date: '2026-09-05',
      sourceUrl: 'https://crossroadshotelkc.com/events/second-company-showcase/',
    },
    concept: {
      headline: 'A first-person video from the night of the Second Company Showcase',
      detail: 'The arrival, the room and the performance cut as one continuous evening.',
    },
    deliverables: [
      { description: 'one in-feed TikTok video' },
      { description: 'a set of stories on the night' },
    ],
    compensationOffered: [],
    compensationRequested: [
      { kind: 'complimentary_room', amountUsd: null, detail: 'one complimentary night' },
      { kind: 'dining_credit', amountUsd: null, detail: 'a dining credit at Lazia' },
    ],
    compensationState: 'fully_hosted',
    estimatedExperienceCostUsd: null,
    audience: REAL_AUDIENCE,
    mediaKitUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel',
    evidence: [
      {
        fact: 'Crossroads Hotel is hosting the Second Company Showcase on Sept 5th',
        sourceUrl: 'https://crossroadshotelkc.com/events/second-company-showcase/',
        observedAt: '2026-09-03T05:00:00Z',
      },
    ],
    termsToWeigh: [],
    priorRelationshipNote: null,
    isFollowUp: false,
    originalSubject: null,
    ...overrides,
  };
}

/** A caller that returns a fixed draft. Cannot reach the network. */
function fixedCaller(draft: { subject: string; body: string }): PitchModelCaller {
  return async () => draft;
}

const GOOD_BODY = [
  'The Second Company Showcase at Crossroads on Sept 5th is exactly the kind of night my',
  'audience turns up for, and I would love to film it.',
  '',
  "I'm @kckellie on TikTok, 6,703 followers, and a typical post lands around 918 views.",
  '',
  'I would shoot a first-person video from that night — the arrival, the room and the',
  'performance as one continuous evening — plus a set of stories while it is happening.',
  '',
  'For that I would ask for one complimentary night and a dining credit at Lazia.',
  '',
  'Would that work on your side?',
  '',
  'Kellie',
  '',
  'My media kit, with current numbers and recent work: https://benson.kckellie.com/media-kit/kellie-hotel',
].join('\n');

describe('brief completeness — Benson writes it or says what is missing', () => {
  it('accepts a fully evidenced brief', () => {
    assert.deepEqual(checkBriefCompleteness(baseBrief()), []);
  });

  it('refuses without a current reason to write', () => {
    const missing = checkBriefCompleteness(baseBrief({ whyNow: null }));
    assert.ok(missing.some((m) => m.includes('reason to write')));
  });

  it('refuses without real analytics rather than falling back to a follower band', () => {
    const missing = checkBriefCompleteness(baseBrief({ audience: UNAVAILABLE_AUDIENCE }));
    assert.ok(missing.some((m) => m.includes('follower count')));
  });

  it('refuses when analytics are stale', () => {
    const missing = checkBriefCompleteness(
      baseBrief({ audience: { ...REAL_AUDIENCE, stale: true } }),
    );
    assert.ok(missing.some((m) => m.includes('stale')));
  });

  it('refuses without a real media kit', () => {
    const missing = checkBriefCompleteness(baseBrief({ mediaKitUrl: null }));
    assert.ok(missing.some((m) => m.includes('media kit')));
  });

  it('refuses a claim that has no source', () => {
    const missing = checkBriefCompleteness(
      baseBrief({
        evidence: [{ fact: 'They love working with creators', sourceUrl: '', observedAt: null }],
      }),
    );
    assert.ok(missing.some((m) => m.includes('a source for the claim')));
  });

  it('returns a refusal, never an instruction for Kellie to draft it herself', async () => {
    const result = await writeHospitalityPitch(baseBrief({ whyNow: null }), {
      call: fixedCaller({ subject: 'x', body: 'y' }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.summary, /Benson cannot write a pitch/);
      assert.doesNotMatch(result.summary, /draft a pitch/i);
    }
  });
});

describe('deliverables are capped by what the compensation supports', () => {
  it('allows a full package for cash plus hosted', () => {
    const brief = baseBrief({
      compensationOffered: [
        { kind: 'creator_fee', amountUsd: 750, detail: '$750 fee' },
        { kind: 'complimentary_room', amountUsd: 289, detail: 'one night' },
      ],
      deliverables: [
        { description: 'two in-feed TikTok videos' },
        { description: 'stories across the stay' },
        { description: 'a photo set' },
        { description: 'usage rights for paid social' },
      ],
    });
    assert.equal(reasonableDeliverables(brief).deliverables.length, 4);
  });

  it('cuts the ask to one deliverable when only a discount is on offer', () => {
    const brief = baseBrief({
      compensationOffered: [
        { kind: 'partial_discount', amountUsd: null, percentOff: 15, detail: '15% off' },
      ],
      deliverables: [
        { description: 'two in-feed TikTok videos' },
        { description: 'stories across the stay' },
        { description: 'a photo set' },
      ],
    });
    const result = reasonableDeliverables(brief);
    assert.equal(result.deliverables.length, 1);
    assert.match(result.trimmedNote ?? '', /not compensation/i);
  });

  it('cuts the ask when a gift card does not cover the experience', () => {
    const brief = baseBrief({
      compensationOffered: [{ kind: 'gift_card', amountUsd: 50, detail: '$50 gift card' }],
      estimatedExperienceCostUsd: 400,
      deliverables: [
        { description: 'two in-feed TikTok videos' },
        { description: 'stories across the stay' },
      ],
    });
    assert.equal(reasonableDeliverables(brief).deliverables.length, 1);
  });
});

describe('pitch rubric catches what a model would slip through', () => {
  it('passes a genuinely tailored pitch built from verified facts', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: GOOD_BODY,
      brief,
    });
    assert.equal(evaluation.passes, true, JSON.stringify(evaluation.blockers));
    assert.equal(evaluation.total, 30);
  });

  it('blocks an invented view count', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: GOOD_BODY.replace('918 views', '45,000 views'),
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(evaluation.blockers.some((b) => b.includes('45,000')));
  });

  it('blocks an invented demographic claim', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: `${GOOD_BODY}\n\nMy audience is 78% women aged 25-34 in Kansas City.`,
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(evaluation.blockers.length > 0);
  });

  it('blocks a follower band instead of the real count', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: GOOD_BODY.replace('6,703 followers', 'over 5K followers'),
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(evaluation.blockers.some((b) => /band|5K/i.test(b)));
  });

  it('blocks the form-letter opener and names the exact phrase to remove', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Collaboration',
      body: `Hi there,\n\nI hope this email finds you well. I wanted to reach out about a partnership opportunity.\n\n${GOOD_BODY}`,
      brief,
    });
    assert.equal(evaluation.passes, false);
    // The retry needs the literal phrase, not a category name.
    assert.ok(evaluation.blockers.some((b) => b.includes('I hope this email finds you well')));
  });

  it('blocks a pitch that never names the business', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'A collaboration',
      body: GOOD_BODY.replace(/Crossroads/g, 'your hotel'),
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(evaluation.blockers.some((b) => b.includes('never names the business')));
  });

  it('accepts a natural shorthand for the business name', () => {
    // "Crossroads" is how a person addresses the Crossroads Hotel.
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: GOOD_BODY,
      brief,
    });
    assert.ok(evaluation.scores.find((s) => s.dimension === 'specificity')!.score >= 4);
  });

  it('blocks describing a discount as a hosted experience', () => {
    const brief = baseBrief({
      compensationOffered: [
        { kind: 'partial_discount', amountUsd: null, percentOff: 15, detail: '15% off' },
      ],
      compensationState: 'discount_only',
    });
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: GOOD_BODY.replace(
        'For that I would ask for one complimentary night and a dining credit at Lazia.',
        'Thank you for the complimentary hosted stay.',
      ),
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(
      evaluation.blockers.some((b) => b.includes('discount as a hosted or gifted experience')),
    );
  });

  it('blocks a pitch with no next step', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: GOOD_BODY.replace('Would that work on your side?', 'Thanks for the consideration.'),
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(evaluation.blockers.some((b) => b.includes('no clear next step')));
  });

  it('blocks a pitch that states no deliverable', () => {
    const brief = baseBrief();
    const evaluation = evaluatePitch({
      subject: 'Filming the Second Company Showcase on Sept 5th',
      body: [
        'The Second Company Showcase at Crossroads on Sept 5th caught my eye.',
        "I'm @kckellie on TikTok, 6,703 followers.",
        'Would you be open to hosting me?',
        'Kellie',
        'https://benson.kckellie.com/media-kit/kellie-hotel',
      ].join('\n\n'),
      brief,
    });
    assert.equal(evaluation.passes, false);
    assert.ok(evaluation.blockers.some((b) => b.includes('does not state any deliverable')));
  });

  it('treats digits inside a URL as a link, not a claim', () => {
    const brief = baseBrief({
      mediaKitUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel-2026',
    });
    const found = unsupportedNumbers(
      `See https://benson.kckellie.com/media-kit/kellie-hotel-2026 for details.`,
      brief,
    );
    assert.deepEqual(found, []);
  });

  it('every banned phrase is actually detected', () => {
    for (const banned of BANNED_PITCH_PHRASES) {
      const sample = banned.pattern.source
        .replace(/\\b/g, '')
        .replace(/\(\?:/g, '(')
        .replace(/[\\^$]/g, '');
      assert.ok(sample.length > 0, `pattern for ${banned.why} should be inspectable`);
    }
  });
});

describe('scenario fixtures across the compensation and contact matrix', () => {
  const scenarios: Array<{ name: string; brief: PitchBrief; expectWritable: boolean }> = [
    {
      name: 'boutique hotel hosted stay',
      brief: baseBrief(),
      expectWritable: true,
    },
    {
      name: 'large-chain influencer request with a form route',
      brief: baseBrief({
        businessName: 'Loews Hotels',
        propertyName: 'Loews Kansas City Hotel',
        recipientEmail: null,
        recipientLabel: null,
        termsToWeigh: [
          'Loews\u2019 rights flow grants a perpetual, worldwide, royalty-free licence with no obligation to use the content.',
        ],
      }),
      expectWritable: true,
    },
    {
      name: 'paid UGC hotel package',
      brief: baseBrief({
        compensationOffered: [
          { kind: 'creator_fee', amountUsd: 1200, detail: '$1,200 fee' },
          { kind: 'usage_rights_payment', amountUsd: 400, detail: '$400 for 90-day paid usage' },
        ],
        compensationState: 'cash',
      }),
      expectWritable: true,
    },
    {
      name: 'hosted restaurant dinner',
      brief: baseBrief({
        businessName: 'Lazia',
        compensationRequested: [
          { kind: 'hosted_meal', amountUsd: null, detail: 'a hosted dinner for two' },
        ],
      }),
      expectWritable: true,
    },
    {
      name: 'cash plus hosted',
      brief: baseBrief({
        compensationOffered: [
          { kind: 'creator_fee', amountUsd: 500, detail: '$500 fee' },
          { kind: 'complimentary_room', amountUsd: 289, detail: 'one night' },
        ],
        compensationState: 'cash_plus_hosted',
      }),
      expectWritable: true,
    },
    {
      name: 'official generic inbox only',
      brief: baseBrief({
        recipientEmail: 'info@crossroadshotelkc.com',
        recipientLabel: null,
      }),
      expectWritable: true,
    },
    {
      name: 'named marketing contact',
      brief: baseBrief({
        recipientName: 'Alex Rivera',
        recipientLabel: 'marketing',
      }),
      expectWritable: true,
    },
    {
      name: 'existing relationship',
      brief: baseBrief({
        priorRelationshipNote:
          'Kellie filmed a rooftop video here in June 2026 and it was well received.',
      }),
      expectWritable: true,
    },
    {
      name: 'follow-up after no response',
      brief: baseBrief({
        isFollowUp: true,
        originalSubject: 'Filming the Second Company Showcase on Sept 5th',
      }),
      expectWritable: true,
    },
    {
      name: 'missing analytics',
      brief: baseBrief({ audience: UNAVAILABLE_AUDIENCE }),
      expectWritable: false,
    },
    {
      name: 'no verified contact and no reason to write',
      brief: baseBrief({ recipientEmail: null, recipientLabel: null, whyNow: null }),
      expectWritable: false,
    },
    {
      name: 'no compensation position at all',
      brief: baseBrief({
        compensationRequested: [],
        compensationOffered: [],
        compensationState: 'unknown_requires_research',
      }),
      expectWritable: false,
    },
    {
      name: 'no media kit',
      brief: baseBrief({ mediaKitUrl: null }),
      expectWritable: false,
    },
    {
      name: 'discount only',
      brief: baseBrief({
        compensationOffered: [
          { kind: 'media_rate', amountUsd: null, percentOff: 20, detail: '20% media rate' },
        ],
        compensationState: 'discount_only',
      }),
      expectWritable: true,
    },
  ];

  for (const scenario of scenarios) {
    it(`${scenario.name}: ${scenario.expectWritable ? 'writable' : 'honestly blocked'}`, () => {
      const missing = checkBriefCompleteness(scenario.brief);
      assert.equal(
        missing.length === 0,
        scenario.expectWritable,
        `missing: ${missing.join(', ')}`,
      );
    });
  }

  it('builds a prompt that carries the terms Kellie should weigh', () => {
    const loews = scenarios.find((s) => s.name.includes('large-chain'))!.brief;
    assert.ok(loews.termsToWeigh[0]?.includes('perpetual'));
    // Benson surfaces the licence term; it does not decide it is disqualifying.
    assert.equal(checkBriefCompleteness(loews).length, 0);
  });

  it('keeps a follow-up short and anchored to the original', async () => {
    const brief = scenarios.find((s) => s.name.includes('follow-up'))!.brief;
    const result = await writeHospitalityPitch(brief, {
      call: fixedCaller({
        subject: 'Re: Filming the Second Company Showcase on Sept 5th',
        body: [
          'Following up on the Second Company Showcase note from last week — still keen to',
          'film it at Crossroads if it works for you.',
          '',
          "I'm @kckellie on TikTok, 6,703 followers.",
          '',
          'One in-feed TikTok video, in exchange for one complimentary night.',
          '',
          'Worth a quick chat?',
          '',
          'Kellie',
          '',
          'My media kit: https://benson.kckellie.com/media-kit/kellie-hotel',
        ].join('\n'),
      }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.evaluation.wordCount < 110, `follow-up was ${result.evaluation.wordCount} words`);
    }
  });
});

describe('retry behaviour', () => {
  it('retries once with the specific problem named, then succeeds', async () => {
    let attempt = 0;
    const call: PitchModelCaller = async ({ user }) => {
      attempt += 1;
      if (attempt === 1) {
        return {
          subject: 'Collaboration request',
          body: `I wanted to reach out about the Second Company Showcase.\n\n${GOOD_BODY}`,
        };
      }
      // The retry prompt must name the literal phrase so it can be removed.
      assert.match(user, /I wanted to reach out/);
      return { subject: 'Filming the Second Company Showcase on Sept 5th', body: GOOD_BODY };
    };
    const result = await writeHospitalityPitch(baseBrief(), { call });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.attempts, 2);
  });

  it('returns the rejected draft for inspection rather than saving a bad pitch', async () => {
    const result = await writeHospitalityPitch(baseBrief(), {
      call: fixedCaller({
        subject: 'Partnership opportunity',
        body: 'Hi there, I hope this email finds you well. Let me know.',
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.rejectedDraft, 'the rejected draft must be available for inspection');
      assert.equal(result.rejectedDraft!.evaluation.passes, false);
    }
  });
});
