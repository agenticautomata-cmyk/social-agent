import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { equipmentChecklists, equipmentTroubleshooting } from '../schema.js';

type ChecklistSeed = {
  slug: string;
  title: string;
  shootType: string;
  description: string;
  gearToBring: string[];
  steps: Array<{ title: string; detail: string }>;
  commonMistakes: string[];
  recoverySteps: string[];
};

const CHECKLIST_SEEDS: ChecklistSeed[] = [
  {
    slug: 'basic-tiktok-walking',
    title: 'Basic TikTok walking video',
    shootType: 'walking',
    description: 'Quick walking B-roll or talking-while-walking clip.',
    gearToBring: ['Phone', 'DJI Osmo Mobile 8', 'Hollyland LARK M2', 'Fully charged TX/RX', 'Optional power bank'],
    steps: [
      { title: 'Battery check', detail: 'Charge Osmo and LARK TX/RX overnight; pack power bank.' },
      { title: 'Phone on gimbal', detail: 'Balance phone in Osmo clamp; open DJI Mimo and connect.' },
      { title: 'Mic setup', detail: 'Clip LARK TX, plug RX into phone or use camera receiver as needed.' },
      { title: 'Audio test', detail: 'Record 10 seconds walking — check levels, no rustling on lav.' },
      { title: 'Framing', detail: 'Chest-to-head height, leave headroom, walk smoothly.' },
      { title: 'Lighting', detail: 'Face the light; avoid harsh backlight outdoors.' },
      { title: 'Record test', detail: '30-second test clip — review shake and audio before the real take.' },
    ],
    commonMistakes: ['Mic rubbing on clothing', 'Gimbal not balanced', 'Walking too fast for follow mode'],
    recoverySteps: ['Stop, remount phone, re-pair LARK, redo 10-sec audio test'],
  },
  {
    slug: 'sit-down-talking',
    title: 'Sit-down talking video',
    shootType: 'talking_head',
    description: 'Desk or couch talking-head TikTok.',
    gearToBring: ['Phone or camera', 'Osmo (optional)', 'LARK M2', 'Small light or window light'],
    steps: [
      { title: 'Battery check', detail: 'Charge LARK and phone.' },
      { title: 'Stable mount', detail: 'Use Osmo on table or phone on stack of books — avoid shaky grip.' },
      { title: 'Mic placement', detail: 'LARK TX 6–8 inches from mouth, hidden under collar if possible.' },
      { title: 'Audio test', detail: 'Clap test + speak at normal volume; listen for echo in room.' },
      { title: 'Framing', detail: 'Eyes upper third; leave space for captions at bottom.' },
      { title: 'Lighting', detail: 'Window or ring light at 45° — no window behind you.' },
      { title: 'Record test', detail: 'Record 15 seconds; check focus and lip sync.' },
    ],
    commonMistakes: ['Mic too far', 'Backlit face', 'Looking at screen not lens'],
    recoverySteps: ['Move closer to light, adjust lav, re-frame in Mimo'],
  },
  {
    slug: 'food-review-restaurant',
    title: 'Food review at a restaurant',
    shootType: 'restaurant',
    description: 'Restaurant food review with clean audio in a noisy room.',
    gearToBring: ['Phone', 'Osmo Mobile 8', 'LARK M2', 'Discreet lav clip'],
    steps: [
      { title: 'Battery check', detail: 'Full charge on all gear before leaving.' },
      { title: 'Gimbal prep', detail: 'Pre-balance phone at home; quick connect in Mimo at table.' },
      { title: 'Mic setup', detail: 'LARK TX under shirt; RX on phone with cable tucked.' },
      { title: 'Audio test', detail: 'Whisper-normal-loud test; enable noise cancellation if available.' },
      { title: 'Framing', detail: 'Plate hero shots on gimbal; talking head slightly off-center.' },
      { title: 'Lighting', detail: 'Use table light or sit near window — avoid ceiling-only light.' },
      { title: 'Record test', detail: 'Capture ambient noise sample; adjust mic gain if needed.' },
    ],
    commonMistakes: ['Handling noise on table', 'RX cable in frame', 'Osmo motor noise in quiet room'],
    recoverySteps: ['Switch to noise cancellation, soft grip on gimbal, move plate toward light'],
  },
  {
    slug: 'store-thrift-walkthrough',
    title: 'Store / thrift walkthrough',
    shootType: 'store_walk',
    description: 'Walking through aisles showing finds.',
    gearToBring: ['Phone', 'Osmo Mobile 8', 'LARK M2', 'Wide grip on gimbal'],
    steps: [
      { title: 'Battery check', detail: 'Charge everything; thrift trips run long.' },
      { title: 'Gimbal mode', detail: 'Follow mode for walking; practice start/stop before filming.' },
      { title: 'Mic setup', detail: 'Secure TX — walking causes rustle.' },
      { title: 'Audio test', detail: 'Walk and talk for 10 seconds in a quiet aisle.' },
      { title: 'Framing', detail: 'Show item then face; keep horizon level.' },
      { title: 'Lighting', detail: 'Use bright aisles; avoid flickery fluorescent when possible.' },
      { title: 'Record test', detail: 'One aisle test clip before main content.' },
    ],
    commonMistakes: ['Fast pans', 'Mic cable snag on racks', 'Portrait lock forgotten'],
    recoverySteps: ['Slow down, re-pair mic, switch orientation in Mimo'],
  },
  {
    slug: 'sponsor-product-review',
    title: 'Sponsor / product review',
    shootType: 'sponsor',
    description: 'Polished product demo with clear audio.',
    gearToBring: ['Phone', 'Osmo Mobile 8', 'LARK M2', 'Clean backdrop or tidy surface'],
    steps: [
      { title: 'Battery check', detail: '100% on phone, gimbal, and mic.' },
      { title: 'Product staging', detail: 'Clear label-facing hero angle on table.' },
      { title: 'Mic setup', detail: 'LARK for voice; avoid tapping product near TX.' },
      { title: 'Audio test', detail: 'Read sponsor line once; check clarity.' },
      { title: 'Framing', detail: 'Product in foreground for B-roll; talking head for CTA.' },
      { title: 'Lighting', detail: 'Even light on product — no harsh shadows on logo.' },
      { title: 'Record test', detail: 'Full 20-sec run-through before final takes.' },
    ],
    commonMistakes: ['Blown highlights on packaging', 'Off-brand background clutter', 'Muffled speech'],
    recoverySteps: ['Add fill light, move product, adjust lav position'],
  },
  {
    slug: 'outdoor-event',
    title: 'Outdoor event',
    shootType: 'outdoor_event',
    description: 'Festivals, markets, or street events.',
    gearToBring: ['Phone', 'Osmo Mobile 8', 'LARK M2', 'Power bank', 'Wind muff if available'],
    steps: [
      { title: 'Battery check', detail: 'Phone + gimbal + mic + power bank.' },
      { title: 'Gimbal setup', detail: 'Sport/follow mode; check wind resistance settings.' },
      { title: 'Mic setup', detail: 'Secure TX; enable noise cancellation for crowds.' },
      { title: 'Audio test', detail: 'Sample crowd noise; confirm voice still clear.' },
      { title: 'Framing', detail: 'Wide establishing shots + stable walking pieces.' },
      { title: 'Lighting', detail: 'Shoot golden hour if possible; avoid midday harsh sun.' },
      { title: 'Record test', detail: '30-sec outdoor test before event peak noise.' },
    ],
    commonMistakes: ['Wind on lav', 'Overexposure in sun', 'Gimbal limit at extreme angles'],
    recoverySteps: ['Shield mic, adjust exposure, reset gimbal calibration'],
  },
  {
    slug: 'iphone-17-pro-tiktok-setup',
    title: 'iPhone 17 Pro TikTok setup',
    shootType: 'iphone_setup',
    description: 'Dial in Camera app settings before any TikTok shoot.',
    gearToBring: ['iPhone 17 Pro', 'LARK M2', 'Osmo Mobile 8', 'Power bank'],
    steps: [
      { title: 'Storage & battery', detail: 'Clear space; 80%+ charge; Low Power Mode off for recording.' },
      { title: 'Camera settings', detail: '4K 30 or 60 as needed; enable grid; set mic input to LARK when plugged in.' },
      { title: 'Camera Control', detail: 'Confirm Camera Control opens Camera to Photo/Video mode you use for TikTok.' },
      { title: 'Orientation', detail: 'Vertical/portrait for TikTok; lock orientation before mounting on Osmo.' },
      { title: 'Focus/exposure', detail: 'Tap and hold to AE/AF lock on your face before walking or talking.' },
      { title: 'Audio path', detail: 'Connect LARK RX; test in Camera app — not just TikTok.' },
      { title: 'Record test', detail: '15-sec clip: check focus hunt, exposure pump, and audio levels.' },
    ],
    commonMistakes: ['HDR blowing highlights', 'Auto white balance shift', 'Recording with phone mic instead of LARK'],
    recoverySteps: ['Toggle HDR off, re-lock exposure, replug LARK, restart Camera app'],
  },
  {
    slug: 'restaurant-review-recording',
    title: 'Restaurant review recording setup',
    shootType: 'restaurant_recording',
    description: 'Full stack: iPhone + Osmo + LARK in a noisy restaurant.',
    gearToBring: ['iPhone 17 Pro', 'Osmo Mobile 8', 'LARK M2', 'Small clip for lav'],
    steps: [
      { title: 'Pre-set iPhone', detail: 'Portrait, AE/AF lock tested at home; noise cancellation on LARK.' },
      { title: 'Table mount', detail: 'Osmo on table for plate shots; handheld for bites and talking head.' },
      { title: 'Mic hidden', detail: 'TX under shirt; cable tucked; RX secured to phone.' },
      { title: 'Audio test', detail: 'Normal voice at table — listen for clatter and music bleed.' },
      { title: 'Hero food shots', detail: 'Slow push on Osmo; tap exposure on plate not window.' },
      { title: 'Talking head', detail: 'Face window or table light; leave caption space at bottom.' },
      { title: 'Record test', detail: 'One full intro take before ordering noise peaks.' },
    ],
    commonMistakes: ['Backlit window behind Kellie', 'Banging utensils near TX', 'Auto exposure pumping on plate'],
    recoverySteps: ['Rotate to face light, enable LARK noise cancellation, manual exposure lock'],
  },
  {
    slug: 'store-walkthrough-recording',
    title: 'Store walkthrough recording setup',
    shootType: 'store_recording',
    description: 'Walking thrift/store content with stable video and clear voice.',
    gearToBring: ['iPhone 17 Pro', 'Osmo Mobile 8', 'LARK M2'],
    steps: [
      { title: 'Portrait lock', detail: 'Vertical in Camera; confirm Osmo follow mode for walking.' },
      { title: 'Mic secure', detail: 'TX fixed — walking rub is the #1 failure mode.' },
      { title: 'Walk test', detail: '10-sec aisle walk checking gimbal follow and audio.' },
      { title: 'Framing', detail: 'Chest-high gimbal; show item then face; slow turns.' },
      { title: 'Fluorescent light', detail: 'Find brighter aisle if flicker appears.' },
      { title: 'Record test', detail: 'One full aisle before filming finds.' },
    ],
    commonMistakes: ['Fast pans', 'Portrait not locked', 'Mic cable catching on racks'],
    recoverySteps: ['Slow down, re-pair mic, switch Osmo follow mode'],
  },
  {
    slug: 'talking-head-recording',
    title: 'Talking-head recording setup',
    shootType: 'talking_head_recording',
    description: 'Sit-down TikTok with iPhone and LARK.',
    gearToBring: ['iPhone 17 Pro', 'LARK M2', 'Window or ring light', 'Optional Osmo as tripod'],
    steps: [
      { title: 'Eye-line', detail: 'Look at lens not screen; phone at eye level.' },
      { title: 'LARK placement', detail: '6–8 inches from mouth; collar hide.' },
      { title: 'AE/AF lock', detail: 'Lock on face before recording — prevents pulse if you move.' },
      { title: 'Lighting', detail: '45° key light; no window behind you.' },
      { title: 'Audio test', detail: 'Record 10 sec; check room echo.' },
      { title: 'Framing', detail: 'Headroom for captions; slight off-center optional.' },
      { title: 'Record test', detail: 'Full hook line once before main takes.' },
    ],
    commonMistakes: ['Mic too far', 'Reading from screen', 'Backlit face'],
    recoverySteps: ['Move light, adjust lav, re-lock focus on eyes'],
  },
  {
    slug: 'sponsor-product-video',
    title: 'Sponsor product video setup',
    shootType: 'sponsor_product',
    description: 'Clean product demo + talking head for brand deals.',
    gearToBring: ['iPhone 17 Pro', 'Osmo Mobile 8', 'LARK M2', 'Neutral backdrop'],
    steps: [
      { title: 'Product hero', detail: 'Label readable; even light; slow Osmo push.' },
      { title: 'Talking head', detail: 'LARK on; sponsor talking points nearby not on screen.' },
      { title: 'iPhone settings', detail: 'Consistent white balance; lock exposure on product skin tones.' },
      { title: 'Audio test', detail: 'Read disclosure line clearly.' },
      { title: 'B-roll', detail: 'Hands + product detail shots; 3–5 sec clips.' },
      { title: 'Record test', detail: '20-sec run-through before hero take.' },
    ],
    commonMistakes: ['Glare on packaging', 'Muffled speech', 'Shaky product close-ups'],
    recoverySteps: ['Angle product to kill glare, move lav, use Osmo for close-ups'],
  },
  {
    slug: 'low-light-recording',
    title: 'Low-light recording setup',
    shootType: 'low_light',
    description: 'Night, dim restaurant, or evening outdoor shoots.',
    gearToBring: ['iPhone 17 Pro', 'LARK M2', 'Osmo if walking', 'Optional small light'],
    steps: [
      { title: 'Assess light', detail: 'Find brightest practical light; avoid mixed color temps if possible.' },
      { title: 'iPhone mode', detail: 'Night mode when appropriate; lock exposure if subject is static.' },
      { title: 'Blackmagic?', detail: 'If you need manual ISO/shutter, switch to Blackmagic Camera — otherwise stay in Camera app.' },
      { title: 'Stability', detail: 'Osmo or brace phone — low light magnifies shake.' },
      { title: 'Audio', detail: 'LARK still primary; noise cancellation for ambient hum.' },
      { title: 'Record test', detail: 'Check grain, motion blur, and skin tones on face.' },
    ],
    commonMistakes: ['Underexposed face', 'Too slow shutter causing blur', 'Auto ISO pumping'],
    recoverySteps: ['Move toward light, lock exposure, lower Osmo walk speed'],
  },
  {
    slug: 'upload-edit-post-workflow',
    title: 'Quick upload / edit / post workflow',
    shootType: 'post_workflow',
    description: 'From clip on phone to live TikTok.',
    gearToBring: ['iPhone 17 Pro', 'CapCut app', 'TikTok app'],
    steps: [
      { title: 'Import', detail: 'AirDrop or Files → CapCut; trim dead air first.' },
      { title: 'Captions', detail: 'Auto captions in CapCut; fix names and KC places.' },
      { title: 'Cover frame', detail: 'Pick clear face or product frame for cover.' },
      { title: 'Export', detail: '1080p vertical; save to Photos.' },
      { title: 'TikTok post', detail: 'Upload from TikTok; write hook in first line; check sound.' },
      { title: 'Creator Search Insights', detail: 'Check trending searches related to topic before final caption.' },
      { title: 'Studio follow-up', detail: 'Optional: review analytics in TikTok Studio next day.' },
    ],
    commonMistakes: ['Wrong aspect ratio export', 'Copyrighted sound mismatch', 'No caption hook'],
    recoverySteps: ['Re-export vertical from CapCut, swap sound in TikTok, repost draft'],
  },
];

const TROUBLESHOOTING_SEEDS = [
  {
    slug: 'gimbal-wont-connect',
    label: "My gimbal won't connect",
    equipmentSlug: 'dji-osmo-mobile-8',
    quickPrompt: 'My DJI Osmo Mobile 8 will not connect to DJI Mimo. Step-by-step fix.',
    symptoms: ['Mimo cannot find gimbal', 'Bluetooth pairing fails'],
    steps: [
      { title: 'Power cycle', detail: 'Turn off Osmo, close Mimo, reboot phone, try again.' },
      { title: 'Charge check', detail: 'Ensure gimbal has charge — low battery blocks pairing.' },
      { title: 'Bluetooth', detail: 'Disable/enable Bluetooth; forget old Osmo device in phone settings.' },
    ],
    sortOrder: 1,
  },
  {
    slug: 'mic-no-sound',
    label: 'My mic has no sound',
    equipmentSlug: 'hollyland-lark-m2',
    quickPrompt: 'My Hollyland LARK M2 has no audio in my recording. Troubleshoot step by step.',
    symptoms: ['Silent recording', 'RX connected but no levels'],
    steps: [
      { title: 'Pairing', detail: 'Confirm TX and RX indicators show linked state.' },
      { title: 'Cable/plug', detail: 'Reseat receiver on phone; check TRS/USB-C adapter.' },
      { title: 'Gain', detail: 'Adjust volume on RX; test in voice memo app.' },
    ],
    sortOrder: 2,
  },
  {
    slug: 'audio-sounds-bad',
    label: 'Audio sounds bad',
    equipmentSlug: 'hollyland-lark-m2',
    quickPrompt: 'My LARK M2 audio sounds muffled or noisy. How do I fix it?',
    symptoms: ['Muffled voice', 'Background noise', 'Rustling'],
    steps: [
      { title: 'Placement', detail: 'Reposition TX away from clothing rub.' },
      { title: 'Noise cancellation', detail: 'Enable noise cancellation per manual.' },
      { title: 'Environment', detail: 'Move away from loud AC or crowd; test again.' },
    ],
    sortOrder: 3,
  },
  {
    slug: 'gimbal-shaking',
    label: 'Gimbal is shaking',
    equipmentSlug: 'dji-osmo-mobile-8',
    quickPrompt: 'My Osmo Mobile 8 is shaking or vibrating while filming. How do I fix balance and follow mode?',
    symptoms: ['Vibration', 'Jitter on walk', 'Motor struggle'],
    steps: [
      { title: 'Balance', detail: 'Re-center phone in clamp; run balance check in Mimo.' },
      { title: 'Follow mode', detail: 'Switch to appropriate follow mode for walking vs static.' },
      { title: 'Grip', detail: 'Hold handle lightly — white-knuckle grip causes shake.' },
    ],
    sortOrder: 4,
  },
  {
    slug: 'track-myself',
    label: 'How do I track myself?',
    equipmentSlug: 'dji-osmo-mobile-8',
    quickPrompt: 'How do I enable ActiveTrack or subject tracking on Osmo Mobile 8?',
    symptoms: ['Subject drifts out of frame'],
    steps: [
      { title: 'Open Mimo', detail: 'Connect gimbal and open shooting screen.' },
      { title: 'Tracking mode', detail: 'Select tracking / ActiveTrack per manual.' },
      { title: 'Frame subject', detail: 'Draw box on yourself and start recording.' },
    ],
    sortOrder: 5,
  },
  {
    slug: 'portrait-landscape',
    label: 'How do I switch portrait/landscape?',
    equipmentSlug: 'dji-osmo-mobile-8',
    quickPrompt: 'How do I switch between portrait and landscape on Osmo Mobile 8?',
    symptoms: ['Wrong orientation', 'TikTok vertical needed'],
    steps: [
      { title: 'Rotate phone', detail: 'Physically rotate in clamp to vertical or horizontal.' },
      { title: 'Mimo orientation', detail: 'Confirm orientation icon in Mimo matches TikTok vertical.' },
      { title: 'Recalibrate', detail: 'Let gimbal re-level after rotating.' },
    ],
    sortOrder: 6,
  },
  {
    slug: 'indicator-lights',
    label: 'What do these lights mean?',
    quickPrompt: 'What do the indicator lights mean on my Hollyland LARK M2 and DJI Osmo Mobile 8?',
    symptoms: ['Blinking LEDs', 'Unknown status colors'],
    steps: [
      { title: 'Identify device', detail: 'Specify Osmo vs LARK TX vs RX.' },
      { title: 'Manual lookup', detail: 'Match blink pattern to manual indicator section.' },
    ],
    sortOrder: 7,
  },
  {
    slug: 'setup-restaurant',
    label: 'Setup for restaurant video',
    quickPrompt: 'Give me gimbal and LARK M2 setup for a restaurant TikTok food review.',
    symptoms: [],
    steps: [],
    sortOrder: 8,
  },
  {
    slug: 'setup-walking-store',
    label: 'Setup for walking store video',
    quickPrompt: 'Setup my Osmo and LARK for a walking thrift store TikTok.',
    symptoms: [],
    steps: [],
    sortOrder: 9,
  },
  {
    slug: 'setup-sponsor-review',
    label: 'Setup for sponsor/product review',
    quickPrompt: 'Setup gear for a sponsor product review TikTok with clean audio and stable shots.',
    symptoms: [],
    steps: [],
    sortOrder: 10,
  },
  {
    slug: 'iphone-camera-settings',
    label: 'Best iPhone settings for TikTok',
    equipmentSlug: 'apple-iphone-17-pro',
    quickPrompt: 'Best iPhone 17 Pro camera settings for TikTok — resolution, frame rate, HDR, and mic input.',
    symptoms: [],
    steps: [],
    sortOrder: 11,
  },
  {
    slug: 'camera-control-help',
    label: 'How do I use Camera Control?',
    equipmentSlug: 'apple-iphone-17-pro',
    quickPrompt: 'How do I use Camera Control on iPhone 17 Pro for quick TikTok recording?',
    symptoms: [],
    steps: [],
    sortOrder: 12,
  },
  {
    slug: 'exposure-focus-lock',
    label: 'Lock focus and exposure',
    equipmentSlug: 'apple-iphone-17-pro',
    quickPrompt: 'How do I lock focus and exposure on iPhone 17 Pro while filming TikTok?',
    symptoms: [],
    steps: [],
    sortOrder: 13,
  },
  {
    slug: 'creator-search-insights',
    label: 'Creator Search Insights',
    equipmentSlug: 'tiktok',
    quickPrompt: 'How do I use TikTok Creator Search Insights to pick video topics?',
    symptoms: [],
    steps: [],
    sortOrder: 14,
  },
  {
    slug: 'tiktok-analytics-help',
    label: 'Read my TikTok analytics',
    equipmentSlug: 'tiktok',
    quickPrompt: 'Help me interpret my TikTok analytics — views, watch time, and retention.',
    symptoms: [],
    steps: [],
    sortOrder: 15,
  },
  {
    slug: 'capcut-workflow',
    label: 'CapCut editing workflow',
    equipmentSlug: 'capcut',
    quickPrompt: 'Walk me through a fast CapCut editing workflow for a TikTok talking-head clip.',
    symptoms: [],
    steps: [],
    sortOrder: 16,
  },
  {
    slug: 'blackmagic-vs-camera',
    label: 'Blackmagic vs Camera app',
    equipmentSlug: 'blackmagic-camera',
    quickPrompt: 'When should I use Blackmagic Camera instead of the iPhone Camera app for TikTok?',
    symptoms: [],
    steps: [],
    sortOrder: 17,
  },
  {
    slug: 'portrait-vs-landscape',
    label: 'Portrait or landscape?',
    quickPrompt: 'Should Kellie film TikTok in portrait or landscape on iPhone 17 Pro and Osmo?',
    symptoms: [],
    steps: [],
    sortOrder: 18,
  },
];

export async function seedEquipmentChecklists(): Promise<void> {
  for (const seed of CHECKLIST_SEEDS) {
    const existing = await db.query.equipmentChecklists.findFirst({
      where: eq(equipmentChecklists.slug, seed.slug),
    });
    const values = {
      title: seed.title,
      shootType: seed.shootType,
      description: seed.description,
      gearToBring: seed.gearToBring,
      steps: seed.steps,
      commonMistakes: seed.commonMistakes,
      recoverySteps: seed.recoverySteps,
      updatedAt: new Date(),
    };
    if (existing) {
      await db.update(equipmentChecklists).set(values).where(eq(equipmentChecklists.slug, seed.slug));
    } else {
      await db.insert(equipmentChecklists).values({ slug: seed.slug, ...values });
    }
  }
}

export async function seedEquipmentTroubleshooting(): Promise<void> {
  const items = await db.query.equipmentItems.findMany();
  const bySlug = new Map(items.map((i) => [i.slug, i.id]));

  for (const seed of TROUBLESHOOTING_SEEDS) {
    const equipmentId = seed.equipmentSlug ? bySlug.get(seed.equipmentSlug) ?? null : null;
    const existing = await db.query.equipmentTroubleshooting.findFirst({
      where: eq(equipmentTroubleshooting.slug, seed.slug),
    });
    const values = {
      label: seed.label,
      equipmentId,
      symptoms: seed.symptoms,
      steps: seed.steps,
      quickPrompt: seed.quickPrompt,
      sortOrder: seed.sortOrder,
    };
    if (existing) {
      await db
        .update(equipmentTroubleshooting)
        .set(values)
        .where(eq(equipmentTroubleshooting.slug, seed.slug));
    } else {
      await db.insert(equipmentTroubleshooting).values({ slug: seed.slug, ...values });
    }
  }
}
