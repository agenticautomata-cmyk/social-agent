import { execSync } from 'node:child_process';
import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { voiceboxPin } from '../benson-voice/voicebox-pin.js';

export type StudioVoiceReleaseReport = {
  commitHash: string;
  releaseTag: string;
  deployedAt: Date;
  previousRelease: string;
  migration: string;
  engine: string;
  voiceProfile: string;
  testTotals: string;
  pushResult: string;
  rollbackCommands: string;
  notes: string[];
};

function gitHead(): string {
  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
}

export function buildStudioVoiceTelegram(report: StudioVoiceReleaseReport): string {
  const deployed = report.deployedAt.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return [
    '🎙️ BENSON RELEASE — Studio Voice for Ask Benson',
    '',
    `Deployed: ${deployed}`,
    `Commit: ${report.commitHash}`,
    `Tag: ${report.releaseTag}`,
    `Previous: ${report.previousRelease}`,
    `Voicebox: ${voiceboxPin.upstreamTag} @ ${voiceboxPin.upstreamCommit}`,
    `Migration: ${report.migration}`,
    `Engine: ${report.engine}`,
    `Voice profile: ${report.voiceProfile}`,
    `Tests: ${report.testTotals}`,
    `Push: ${report.pushResult}`,
    '',
    'WHAT\'S NEW FOR KELLIE',
    '• Tap Listen on any Ask Benson answer to hear Benson Studio Voice',
    '• Pause, resume, restart, or regenerate from the answer controls',
    '• Voice settings: /ask-benson/settings (mode, auto-play, speed, long answers)',
    '• If Studio Voice is offline, tap the phone icon for device voice',
    '• Text always appears first — audio never blocks the answer',
    '',
    'Admin: /admin/voice-service',
    'Ask Benson: https://benson.kckellie.com/ask-benson',
    '',
    'Rollback:',
    report.rollbackCommands,
    '',
    ...report.notes.map((n) => `• ${n}`),
  ].join('\n');
}

export async function sendStudioVoiceReleaseNotifications(
  report: StudioVoiceReleaseReport,
): Promise<{ push: { sent: boolean; reason?: string }; telegram: { sent: boolean; reason?: string } }> {
  const push = await sendBensonPush(
    {
      topic: 'studio_update',
      title: 'Benson What\'s New — Studio Voice',
      body: 'Ask Benson now speaks with a consistent Voicebox-powered Studio Voice. Text appears immediately, and device voice remains available as a fallback.',
      url: '/ask-benson/settings',
    },
    { force: true },
  );

  const telegram = await sendTelegramMessage(buildStudioVoiceTelegram(report), {
    requireOutreachEnabled: false,
  });

  return {
    push: { sent: push.sent > 0, reason: push.reason },
    telegram: { sent: telegram.sent, reason: telegram.reason },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report: StudioVoiceReleaseReport = {
    commitHash: gitHead(),
    releaseTag: process.env.BENSON_RELEASE_TAG ?? 'release/studio-voice-voicebox',
    deployedAt: new Date(),
    previousRelease: 'release/global-refresh-discovery-skip-2026-07-25 @ 60f201a',
    migration: '71_benson_studio_voice.sql',
    engine: voiceboxPin.defaultEngine,
    voiceProfile: `${voiceboxPin.profileName} (${voiceboxPin.presetVoiceId})`,
    testTotals: process.env.BENSON_VOICE_TEST_TOTALS ?? 'see CI / acceptance log',
    pushResult: 'pending',
    rollbackCommands:
      'git checkout release/global-refresh-discovery-skip-2026-07-25 && ./scripts/pre-alpha-start-prod.sh && docker compose stop voicebox',
    notes: ['Voicebox bound to 127.0.0.1:17493 only — not public'],
  };

  const result = await sendStudioVoiceReleaseNotifications(report);
  console.log(JSON.stringify({ report, result }, null, 2));
}
