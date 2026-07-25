'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  useBensonAnswerVoice,
  type AutoPlayMode,
  type LongAnswerMode,
  type PlaybackSpeed,
  type VoiceMode,
} from '../../../lib/use-benson-studio-voice';

export default function AskBensonVoiceSettingsPage() {
  const voice = useBensonAnswerVoice();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void voice.loadSettings();
  }, [voice]);

  async function save(patch: Parameters<typeof voice.updateSettings>[0]) {
    await voice.updateSettings(patch);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="p-4 md:p-8">
      <div className="glass-panel-strong p-6 space-y-6 max-w-xl">
        <div>
          <h1 className="text-lg font-semibold">Ask Benson Voice</h1>
          <p className="text-sm text-paper-soft mt-1">
            Benson Studio Voice uses a consistent on-server voice. Device voice remains available as a fallback.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Voice mode</legend>
          {(
            [
              ['studio', 'Benson Studio Voice'],
              ['device', 'Device Voice'],
              ['text_only', 'Text Only'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="voiceMode"
                checked={voice.settings.voiceMode === value}
                onChange={() => void save({ voiceMode: value as VoiceMode })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Auto-play</legend>
          {(
            [
              ['off', 'Off'],
              ['short_only', 'Short answers only'],
              ['all', 'All answers'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="autoPlay"
                checked={voice.settings.autoPlay === value}
                onChange={() => void save({ autoPlay: value as AutoPlayMode })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Playback speed</legend>
          <div className="flex flex-wrap gap-2">
            {([0.75, 1.0, 1.25, 1.5] as PlaybackSpeed[]).map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => void save({ playbackSpeed: speed })}
                className={`rounded-lg px-3 py-1.5 text-sm border ${
                  voice.settings.playbackSpeed === speed
                    ? 'border-accent bg-accent/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {speed}×
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Long answers</legend>
          {(
            [
              ['full', 'Read full answer'],
              ['summary', 'Read summary only'],
              ['ask', 'Ask before generating'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="longAnswer"
                checked={voice.settings.longAnswerMode === value}
                onChange={() => void save({ longAnswerMode: value as LongAnswerMode })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {saved && <p className="text-xs text-accent">Saved</p>}

        <Link href="/ask-benson" className="text-sm text-accent hover:underline">
          Back to Ask Benson
        </Link>
      </div>
    </main>
  );
}
