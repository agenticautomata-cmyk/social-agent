'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApiUrl } from './client-api';
import {
  speechTextFromAnswer,
  useBensonSpeechSynthesis,
  getBensonAutoReadAfterVoice,
} from './use-benson-voice';

export type VoiceMode = 'studio' | 'device' | 'text_only';
export type AutoPlayMode = 'off' | 'short_only' | 'all';
export type LongAnswerMode = 'full' | 'summary' | 'ask';
export type PlaybackSpeed = 0.75 | 1.0 | 1.25 | 1.5;

export type VoiceSettings = {
  voiceMode: VoiceMode;
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

const DEFAULT_SETTINGS: VoiceSettings = {
  voiceMode: 'studio',
  autoPlay: 'off',
  playbackSpeed: 1.0,
  longAnswerMode: 'ask',
  fallbackEnabled: true,
};

export function useBensonAnswerVoice() {
  const deviceSpeech = useBensonSpeechSynthesis();
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  const [playbackState, setPlaybackState] = useState<VoicePlaybackState>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunkQueueRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const pollRef = useRef<number | null>(null);
  const pendingLongConfirmRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(clientApiUrl('/api/voice/settings'));
      const json = (await res.json()) as { ok?: boolean; settings?: VoiceSettings };
      if (json.ok && json.settings) setSettings(json.settings);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    void loadSettings();
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
    chunkQueueRef.current = [];
    chunkIndexRef.current = 0;
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

  const playNextChunk = useCallback(async () => {
    const nextId = chunkQueueRef.current[chunkIndexRef.current];
    if (!nextId) {
      setPlaybackState('idle');
      setActiveMessageId(null);
      return;
    }
    const speed = settingsRef.current.playbackSpeed;
    await playAudioUrl(clientApiUrl(`/api/voice/audio/${nextId}`), speed);
    chunkIndexRef.current += 1;
    if (chunkIndexRef.current < chunkQueueRef.current.length) {
      await playNextChunk();
    } else {
      setPlaybackState('idle');
      setActiveMessageId(null);
    }
  }, [playAudioUrl]);

  const pollJobsUntilReady = useCallback(
    async (messageId: string): Promise<string[]> => {
      for (let attempt = 0; attempt < 120; attempt++) {
        const res = await fetch(clientApiUrl(`/api/voice/messages/${messageId}/jobs`));
        const json = (await res.json()) as { ok?: boolean; jobs?: VoiceJob[] };
        const jobs = (json.jobs ?? []).sort((a, b) => a.chunkIndex - b.chunkIndex);
        if (jobs.length === 0) return [];
        const failed = jobs.find((j) => j.status === 'failed');
        if (failed) throw new Error(failed.sanitizedError ?? 'Generation failed');
        const allComplete = jobs.every((j) => j.status === 'complete' && j.generatedAudioId);
        if (allComplete) return jobs.map((j) => j.generatedAudioId!);
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw new Error('Generation timed out');
    },
    [],
  );

  const speakWithStudio = useCallback(
    async (messageId: string, answerText: string, options?: { regenerate?: boolean; confirmLong?: boolean }) => {
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
            playbackSpeed: settingsRef.current.playbackSpeed,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          cached?: boolean;
          audioIds?: string[];
          fallbackRecommended?: boolean;
          statusMessage?: string;
          needsConfirmation?: boolean;
          studioAvailable?: boolean;
        };

        if (!res.ok || json.ok === false) {
          throw new Error(json.error ?? 'Studio Voice unavailable');
        }

        if (json.needsConfirmation) {
          pendingLongConfirmRef.current = messageId;
          setPlaybackState('ready');
          setStatusMessage(json.statusMessage ?? 'Long answer — tap Listen again to generate');
          return;
        }

        pendingLongConfirmRef.current = null;

        if (!json.studioAvailable && json.fallbackRecommended) {
          setPlaybackState('studio_unavailable');
          setStatusMessage("Benson's Studio Voice is temporarily unavailable. Device voice is ready.");
          if (settingsRef.current.fallbackEnabled) {
            setPlaybackState('device');
            deviceSpeech.speak(messageId, speechTextFromAnswer(answerText));
          }
          return;
        }

        let audioIds = json.audioIds ?? [];
        if (!json.cached || audioIds.length === 0) {
          audioIds = await pollJobsUntilReady(messageId);
        }

        if (audioIds.length === 0) throw new Error('No audio generated');

        chunkQueueRef.current = audioIds;
        chunkIndexRef.current = 0;
        setPlaybackState('playing');
        setStatusMessage(json.cached ? 'Ready to play' : 'Playing');
        await playNextChunk();
      } catch (err) {
        setPlaybackState('failed');
        setStatusMessage(err instanceof Error ? err.message : 'Generation failed — retry available');
        if (settingsRef.current.fallbackEnabled) {
          setPlaybackState('device');
          setStatusMessage("Using device voice");
          deviceSpeech.speak(messageId, speechTextFromAnswer(answerText));
        }
      }
    },
    [deviceSpeech, playNextChunk, pollJobsUntilReady, stopAll],
  );

  const listen = useCallback(
    (messageId: string, answerText: string, options?: { regenerate?: boolean; confirmLong?: boolean }) => {
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
    const json = (await res.json()) as { ok?: boolean; settings?: VoiceSettings };
    if (json.ok && json.settings) setSettings(json.settings);
    return json.settings ?? settingsRef.current;
  }, []);

  const maybeAutoPlay = useCallback(
    (messageId: string, answerText: string, usedVoiceInput: boolean) => {
      const { autoPlay, voiceMode } = settingsRef.current;
      if (voiceMode === 'text_only') return;
      const words = answerText.trim().split(/\s+/).filter(Boolean).length;
      const should =
        autoPlay === 'all' ||
        (autoPlay === 'short_only' && words <= 40) ||
        (usedVoiceInput && getBensonAutoReadAfterVoice());
      if (should) listen(messageId, answerText);
    },
    [listen],
  );

  return {
    settings,
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
