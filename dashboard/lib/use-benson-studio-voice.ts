'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApiUrl, parseApiJsonResponse } from './client-api';
import {
  speechTextFromAnswer,
  useBensonSpeechSynthesis,
  getBensonVoiceMuted,
  setBensonVoiceMuted,
} from './use-benson-voice';

export type VoiceMode = 'studio' | 'device' | 'text_only';
export type AutoPlayMode = 'off' | 'short_only' | 'all';
export type LongAnswerMode = 'full' | 'summary' | 'ask';
export type PlaybackSpeed = 0.75 | 1.0 | 1.25 | 1.5;

export const BENSON_CUSTOM_PROFILE = 'Benson Custom';

export function isCustomVoiceProfile(profileId: string | null | undefined): boolean {
  return profileId === BENSON_CUSTOM_PROFILE || profileId === 'benson_custom_v1';
}

export type VoiceSettings = {
  voiceMode: VoiceMode;
  voiceboxProfileId: string | null;
  autoPlay: AutoPlayMode;
  playbackSpeed: PlaybackSpeed;
  longAnswerMode: LongAnswerMode;
  fallbackEnabled: boolean;
};

export type VoicePlaybackState =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'studio_unavailable'
  | 'device'
  | 'failed';

type VoiceJob = {
  id: string;
  status: string;
  chunkIndex: number;
  chunkTotal: number;
  generatedAudioId: string | null;
  sanitizedError: string | null;
};

const VOICE_UNAVAILABLE_MESSAGE = "Benson's custom voice is temporarily unavailable.";
const VOICE_POLL_MS = 600;
const VOICE_POLL_MAX = 180;
const LONG_ANSWER_WORDS = 120;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isLongAnswer(text: string): boolean {
  return wordCount(text) > LONG_ANSWER_WORDS;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  voiceMode: 'studio',
  voiceboxProfileId: null,
  autoPlay: 'all',
  playbackSpeed: 1.0,
  longAnswerMode: 'ask',
  fallbackEnabled: true,
};

export function useBensonAnswerVoice() {
  const deviceSpeech = useBensonSpeechSynthesis();
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [playbackState, setPlaybackState] = useState<VoicePlaybackState>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<number | null>(null);
  const pendingLongConfirmRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const voiceMutedRef = useRef(voiceMuted);
  voiceMutedRef.current = voiceMuted;

  useEffect(() => {
    setVoiceMuted(getBensonVoiceMuted());
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(clientApiUrl('/api/voice/settings'));
      const parsed = await parseApiJsonResponse<{ ok?: boolean; settings?: VoiceSettings }>(res);
      if (parsed.ok && parsed.data.ok && parsed.data.settings) setSettings(parsed.data.settings);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void fetch(clientApiUrl('/api/voice/prewarm'), { method: 'POST' }).catch(() => {});
  }, [loadSettings]);

  const stopAll = useCallback(() => {
    deviceSpeech.stopSpeaking();
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setActiveMessageId(null);
    setPlaybackState('idle');
  }, [deviceSpeech]);

  const playAudioUrl = useCallback(
    (url: string, speed: number) =>
      new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.playbackRate = speed;
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Playback failed'));
        void audio.play().catch(reject);
      }),
    [],
  );

  const fetchVoiceJobs = useCallback(async (messageId: string): Promise<VoiceJob[]> => {
    const res = await fetch(clientApiUrl(`/api/voice/messages/${messageId}/jobs`));
    const parsed = await parseApiJsonResponse<{ ok?: boolean; jobs?: VoiceJob[] }>(res);
    if (!parsed.ok) throw new Error(parsed.error);
    return (parsed.data.jobs ?? []).sort((a, b) => a.chunkIndex - b.chunkIndex);
  }, []);

  /** Play each chunk as soon as it is generated — don't wait for the full answer. */
  const playChunksAsTheyComplete = useCallback(
    async (messageId: string) => {
      const completed = new Map<number, string>();
      let chunkTotal = 1;
      let nextToPlay = 0;
      const speed = settingsRef.current.playbackSpeed;

      while (nextToPlay < chunkTotal) {
        let polls = 0;
        while (!completed.has(nextToPlay)) {
          const jobs = await fetchVoiceJobs(messageId);
          if (jobs.length > 0) chunkTotal = jobs[0]?.chunkTotal ?? chunkTotal;
          const failed = jobs.find((j) => j.status === 'failed');
          if (failed) throw new Error(failed.sanitizedError ?? 'Generation failed');
          for (const job of jobs) {
            if (job.status === 'complete' && job.generatedAudioId) {
              completed.set(job.chunkIndex, job.generatedAudioId);
            }
          }
          if (completed.has(nextToPlay)) break;
          polls += 1;
          if (polls > VOICE_POLL_MAX) throw new Error('Generation timed out');
          await new Promise((r) => setTimeout(r, VOICE_POLL_MS));
        }

        if (nextToPlay === 0) {
          setPlaybackState('playing');
          setStatusMessage('Playing');
        }

        const audioId = completed.get(nextToPlay);
        if (!audioId) throw new Error('No audio generated');
        await playAudioUrl(clientApiUrl(`/api/voice/audio/${audioId}`), speed);
        nextToPlay += 1;
      }
    },
    [fetchVoiceJobs, playAudioUrl],
  );

  const speakWithStudio = useCallback(
    async (
      messageId: string,
      answerText: string,
      options?: {
        regenerate?: boolean;
        confirmLong?: boolean;
        longAnswerOverride?: LongAnswerMode;
        preferFastVoice?: boolean;
      },
    ) => {
      stopAll();
      setActiveMessageId(messageId);
      setPlaybackState('preparing');
      setStatusMessage('Preparing Benson’s voice…');

      try {
        const res = await fetch(clientApiUrl('/api/voice/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId,
            answerText,
            regenerate: options?.regenerate,
            confirmLong: options?.confirmLong,
            longAnswerOverride: options?.longAnswerOverride,
            preferFastVoice: options?.preferFastVoice,
            playbackSpeed: settingsRef.current.playbackSpeed,
          }),
        });
        const parsed = await parseApiJsonResponse<{
          ok?: boolean;
          error?: string;
          cached?: boolean;
          audioIds?: string[];
          fallbackRecommended?: boolean;
          statusMessage?: string;
          needsConfirmation?: boolean;
          studioAvailable?: boolean;
        }>(res);

        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        const json = parsed.data;

        if (json.ok === false) {
          throw new Error(json.error ?? VOICE_UNAVAILABLE_MESSAGE);
        }

        if (json.needsConfirmation) {
          pendingLongConfirmRef.current = messageId;
          setPlaybackState('ready');
          setStatusMessage(json.statusMessage ?? 'Long answer — tap Listen again to generate');
          return;
        }

        pendingLongConfirmRef.current = null;

        if (!json.studioAvailable) {
          setPlaybackState('device');
          setStatusMessage('Using device voice — studio voice is warming up.');
          deviceSpeech.speak(messageId, speechTextFromAnswer(answerText));
          return;
        }

        const cachedIds = (json.audioIds ?? []).filter(Boolean);
        if (json.cached && cachedIds.length > 0) {
          setPlaybackState('playing');
          setStatusMessage('Playing');
          for (const audioId of cachedIds) {
            await playAudioUrl(clientApiUrl(`/api/voice/audio/${audioId}`), settingsRef.current.playbackSpeed);
          }
          setPlaybackState('idle');
          setActiveMessageId(null);
          return;
        }

        await playChunksAsTheyComplete(messageId);
        setPlaybackState('idle');
        setActiveMessageId(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : VOICE_UNAVAILABLE_MESSAGE;
        setPlaybackState('failed');
        setStatusMessage(message.includes('temporarily unavailable') ? message : VOICE_UNAVAILABLE_MESSAGE);
        setPlaybackState('device');
        setStatusMessage('Using device voice');
        deviceSpeech.speak(messageId, speechTextFromAnswer(answerText));
      }
    },
    [deviceSpeech, playAudioUrl, playChunksAsTheyComplete, stopAll],
  );

  const listen = useCallback(
    (
      messageId: string,
      answerText: string,
      options?: {
        regenerate?: boolean;
        confirmLong?: boolean;
        longAnswerOverride?: LongAnswerMode;
        preferFastVoice?: boolean;
      },
    ) => {
      const mode = settingsRef.current.voiceMode;
      if (mode === 'text_only') return;
      if (mode === 'device') {
        stopAll();
        setActiveMessageId(messageId);
        setPlaybackState('device');
        deviceSpeech.speak(messageId, speechTextFromAnswer(answerText));
        return;
      }
      const confirmLong =
        options?.confirmLong ?? (pendingLongConfirmRef.current === messageId ? true : undefined);
      void speakWithStudio(messageId, answerText, { ...options, confirmLong });
    },
    [deviceSpeech, speakWithStudio, stopAll],
  );

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlaybackState('paused');
      return;
    }
    window.speechSynthesis?.pause();
    setPlaybackState('paused');
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current?.paused) {
      void audioRef.current.play();
      setPlaybackState('playing');
      return;
    }
    window.speechSynthesis?.resume();
    setPlaybackState('playing');
  }, []);

  const restart = useCallback(
    (messageId: string, answerText: string) => {
      listen(messageId, answerText, { regenerate: false });
    },
    [listen],
  );

  const updateSettings = useCallback(async (patch: Partial<VoiceSettings>) => {
    const res = await fetch(clientApiUrl('/api/voice/settings'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const parsed = await parseApiJsonResponse<{ ok?: boolean; settings?: VoiceSettings }>(res);
    if (parsed.ok && parsed.data.ok && parsed.data.settings) setSettings(parsed.data.settings);
    void fetch(clientApiUrl('/api/voice/prewarm'), { method: 'POST' }).catch(() => {});
    return parsed.ok && parsed.data.settings ? parsed.data.settings : settingsRef.current;
  }, []);

  const toggleVoiceMuted = useCallback(() => {
    setVoiceMuted((prev) => {
      const next = !prev;
      setBensonVoiceMuted(next);
      if (next) stopAll();
      return next;
    });
  }, [stopAll]);

  const maybeAutoPlay = useCallback(
    (messageId: string, answerText: string, _usedVoiceInput: boolean) => {
      if (voiceMutedRef.current) return;
      if (settingsRef.current.voiceMode === 'text_only') return;
      const longAnswerOverride =
        isLongAnswer(answerText) && settingsRef.current.longAnswerMode === 'ask'
          ? ('summary' as const)
          : undefined;
      listen(messageId, answerText, { longAnswerOverride, preferFastVoice: true });
    },
    [listen],
  );

  return {
    settings,
    voiceMuted,
    toggleVoiceMuted,
    playbackState,
    statusMessage,
    activeMessageId,
    isSpeaking: playbackState === 'playing' || deviceSpeech.speakingId != null,
    speakingId: activeMessageId ?? deviceSpeech.speakingId,
    listen,
    pause,
    resume,
    restart,
    stop: stopAll,
    regenerate: (messageId: string, answerText: string) =>
      listen(messageId, answerText, { regenerate: true }),
    useDeviceVoice: (messageId: string, answerText: string) => {
      stopAll();
      setActiveMessageId(messageId);
      setPlaybackState('device');
      deviceSpeech.speak(messageId, speechTextFromAnswer(answerText));
    },
    updateSettings,
    loadSettings,
    maybeAutoPlay,
    deviceSpeechSupported: deviceSpeech.supported,
    playbackSpeed: settings.playbackSpeed,
    setPlaybackSpeed: (speed: PlaybackSpeed) => void updateSettings({ playbackSpeed: speed }),
  };
}
