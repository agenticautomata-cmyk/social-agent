'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientApiLongRunningUrl } from './client-api';

export type BensonMicMode = 'webspeech' | 'whisper' | 'keyboard';

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function mediaRecorderSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
}

function preferredAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/mpeg'];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function resolveBensonMicMode(): BensonMicMode {
  if (typeof window === 'undefined') return 'keyboard';
  if (isIosDevice() && mediaRecorderSupported()) return 'whisper';
  if (speechRecognitionSupported()) return 'webspeech';
  if (mediaRecorderSupported() && preferredAudioMimeType()) return 'whisper';
  return 'keyboard';
}

const WHISPER_MAX_MS = 90_000;

function sectionBody(content: string, label: string): string | null {
  const pattern = new RegExp(
    `${label}:\\s*([\\s\\S]*?)(?=\\n\\n(?:Summary:|What's Working:|What's Not Working:|Recommended Action:|Benson Observation:)|$)`,
    'i',
  );
  const match = content.match(pattern);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/^[•\-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shorter text for read-aloud — headline + actions, not every bullet. */
export function textForReadAloud(content: string): string {
  const parts: string[] = [];

  const summary = sectionBody(content, 'Summary');
  const actions = sectionBody(content, 'Recommended Action');
  const observation = sectionBody(content, 'Benson Observation');

  if (summary) parts.push(summary);
  else {
    const fallback = content
      .replace(/^Summary:\s*/gim, '')
      .replace(/^What's Working:\s*/gim, '')
      .replace(/^What's Not Working:\s*/gim, '')
      .replace(/^Recommended Action:\s*/gim, '')
      .replace(/^Benson Observation:\s*/gim, '')
      .replace(/^[•\-*]\s+/gm, '')
      .split(/\n{2,}/)[0]
      ?.replace(/\s+/g, ' ')
      .trim();
    if (fallback) parts.push(fallback);
  }

  if (actions) parts.push(actions);
  if (observation) parts.push(observation);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Plain speech text — strips markdown and uses briefing sections when present. */
export function speechTextFromAnswer(content: string): string {
  const structured = textForReadAloud(content);
  const raw = structured || content.split(/\n{2,}/)[0] || content;
  return raw.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

const STORAGE_KEY_SPEAK_VOICE = 'benson-speak-voice-pref';
const STORAGE_KEY_AUTO_READ_AFTER_VOICE = 'benson-auto-read-after-voice';

export type BensonSpeakVoicePref = 'male' | 'female';

export function getBensonAutoReadAfterVoice(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY_AUTO_READ_AFTER_VOICE);
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function setBensonAutoReadAfterVoice(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_READ_AFTER_VOICE, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getBensonSpeakVoicePref(): BensonSpeakVoicePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY_SPEAK_VOICE);
    if (v === 'female') return 'female';
  } catch {
    /* ignore */
  }
  return 'male';
}

export function setBensonSpeakVoicePref(pref: BensonSpeakVoicePref): void {
  try {
    localStorage.setItem(STORAGE_KEY_SPEAK_VOICE, pref);
  } catch {
    /* ignore */
  }
}

const FEMALE_VOICE =
  /samantha|aria|jenny|zira|karen|moira|victoria|susan|joanna|ivy|kendra|kimberly|allison|ava|nicky|sara|tessa|fiona|kate|serena|female|siri.*female/i;
const MALE_VOICE =
  /daniel|aaron|fred|james|gordon|nathan|david|tom|arthur|eddie|oliver|lee|alex|martin|michael|rishi|male|evan|tyler|chris|nick|jorge|yuri|siri.*male|enhanced.*male/i;

function pickSpeechVoice(pref: BensonSpeakVoicePref): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const en = voices.filter((v) => v.lang.startsWith('en'));

  if (pref === 'female') {
    return (
      en.find((v) => FEMALE_VOICE.test(v.name)) ??
      en.find((v) => /google.*english.*female/i.test(v.name)) ??
      en.find((v) => v.lang === 'en-US') ??
      en[0] ??
      null
    );
  }

  return (
    en.find((v) => MALE_VOICE.test(v.name) && !FEMALE_VOICE.test(v.name)) ??
    en.find((v) => v.name.includes('Daniel')) ??
    en.find((v) => !FEMALE_VOICE.test(v.name) && (v.lang === 'en-US' || v.lang === 'en-GB')) ??
    en.find((v) => !FEMALE_VOICE.test(v.name)) ??
    en[0] ??
    null
  );
}

export function useBensonSpeechRecognition(options: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onListeningChange?: (listening: boolean) => void;
}) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [supported] = useState(() => speechRecognitionSupported());
  const [listening, setListening] = useState(false);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      optionsRef.current.onError?.('Use your phone keyboard microphone to dictate.');
      return;
    }

    stopListening();

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const chunk = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += chunk;
        else interim += chunk;
      }
      if (finalText) optionsRef.current.onTranscript(finalText.trim(), true);
      else if (interim) optionsRef.current.onTranscript(interim.trim(), false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      optionsRef.current.onListeningChange?.(false);
      if (event.error === 'aborted' || event.error === 'no-speech') {
        setListening(false);
        return;
      }
      setListening(false);
      if (event.error === 'not-allowed') {
        optionsRef.current.onError?.(
          'Microphone permission denied. Use your phone keyboard microphone to dictate.',
        );
      } else {
        optionsRef.current.onError?.(
          'Voice input unavailable. Use your phone keyboard microphone to dictate.',
        );
      }
    };

    recognition.onend = () => {
      optionsRef.current.onListeningChange?.(false);
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      optionsRef.current.onListeningChange?.(true);
      recognition.start();
      setListening(true);
    } catch {
      optionsRef.current.onListeningChange?.(false);
      setListening(false);
      optionsRef.current.onError?.(
        'Voice input unavailable. Use your phone keyboard microphone to dictate.',
      );
    }
  }, [stopListening]);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const stopListeningWithCallback = useCallback(() => {
    optionsRef.current.onListeningChange?.(false);
    stopListening();
  }, [stopListening]);

  return {
    supported,
    listening,
    toggleListening,
    stopListening: stopListeningWithCallback,
  };
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}

export function useBensonWhisperRecording(options: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  onTranscribingChange?: (transcribing: boolean) => void;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');
  const stopTimerRef = useRef<number | null>(null);
  const [supported] = useState(
    () => mediaRecorderSupported() && Boolean(preferredAudioMimeType()),
  );
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current != null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob, mimeType: string) => {
    setTranscribing(true);
    optionsRef.current.onTranscribingChange?.(true);
    try {
      const form = new FormData();
      const ext = extensionForMime(mimeType);
      form.append('audio', blob, `voice-note.${ext}`);
      const res = await fetch(clientApiLongRunningUrl('/api/ask-benson/transcribe'), {
        method: 'POST',
        body: form,
      });
      const json = (await res.json()) as { ok?: boolean; text?: string; error?: string };
      if (!res.ok || !json.ok || !json.text?.trim()) {
        throw new Error(json.error ?? `Transcription failed (${res.status})`);
      }
      optionsRef.current.onTranscript(json.text.trim(), true);
    } catch (err) {
      optionsRef.current.onError?.(
        err instanceof Error ? err.message : 'Could not transcribe your voice. Try again.',
      );
    } finally {
      setTranscribing(false);
      optionsRef.current.onTranscribingChange?.(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearStopTimer();
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false);
      optionsRef.current.onRecordingChange?.(false);
      return;
    }
    recorder.stop();
  }, [clearStopTimer]);

  const startRecording = useCallback(async () => {
    const mimeType = preferredAudioMimeType();
    if (!mimeType) {
      optionsRef.current.onError?.('Voice recording is not supported in this browser.');
      return;
    }

    stopRecording();
    chunksRef.current = [];
    mimeTypeRef.current = mimeType;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        optionsRef.current.onRecordingChange?.(false);
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        chunksRef.current = [];
        if (blob.size > 0) {
          void transcribeBlob(blob, mimeTypeRef.current);
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        optionsRef.current.onRecordingChange?.(false);
        optionsRef.current.onError?.('Recording failed. Check microphone permission and try again.');
      };

      recorder.start(250);
      setRecording(true);
      optionsRef.current.onRecordingChange?.(true);
      clearStopTimer();
      stopTimerRef.current = window.setTimeout(() => stopRecording(), WHISPER_MAX_MS);
    } catch (err) {
      setRecording(false);
      optionsRef.current.onRecordingChange?.(false);
      const denied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      optionsRef.current.onError?.(
        denied
          ? 'Microphone permission denied. Allow mic access for Benson in Settings.'
          : 'Could not start recording. Try again or type your question.',
      );
    }
  }, [clearStopTimer, stopRecording, transcribeBlob]);

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      clearStopTimer();
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    };
  }, [clearStopTimer]);

  return {
    supported,
    recording,
    transcribing,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}

/** Unified mic input — Web Speech on desktop, Whisper recording on iPhone. */
export function useBensonMicInput(options: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
}) {
  const [mode] = useState<BensonMicMode>(() => resolveBensonMicMode());
  const webSpeech = useBensonSpeechRecognition({
    onTranscript: options.onTranscript,
    onError: options.onError,
  });
  const whisper = useBensonWhisperRecording({
    onTranscript: options.onTranscript,
    onError: options.onError,
  });

  if (mode === 'whisper' && whisper.supported) {
    return {
      mode,
      supported: true,
      listening: whisper.recording,
      transcribing: whisper.transcribing,
      toggleListening: whisper.toggleRecording,
      stopListening: whisper.stopRecording,
      hintWhenUnsupported: null as string | null,
    };
  }

  if (mode === 'webspeech' && webSpeech.supported) {
    return {
      mode,
      supported: true,
      listening: webSpeech.listening,
      transcribing: false,
      toggleListening: webSpeech.toggleListening,
      stopListening: webSpeech.stopListening,
      hintWhenUnsupported: null as string | null,
    };
  }

  return {
    mode: 'keyboard' as const,
    supported: false,
    listening: false,
    transcribing: false,
    toggleListening: () => undefined,
    stopListening: () => undefined,
    hintWhenUnsupported: isIosDevice()
      ? 'Tap the text box, then tap the microphone on your iPhone keyboard to dictate.'
      : 'Voice input is unavailable here — type your question or use keyboard dictation.',
  };
}

export function useBensonSpeechSynthesis() {
  const [supported] = useState(() => speechSynthesisSupported());
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voicePref, setVoicePrefState] = useState<BensonSpeakVoicePref>('male');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voicePrefRef = useRef<BensonSpeakVoicePref>('male');

  const applyVoicePref = useCallback((pref: BensonSpeakVoicePref) => {
    voicePrefRef.current = pref;
    voiceRef.current = pickSpeechVoice(pref);
    setVoicePrefState(pref);
    setBensonSpeakVoicePref(pref);
  }, []);

  useEffect(() => {
    if (!speechSynthesisSupported()) return;
    applyVoicePref(getBensonSpeakVoicePref());
    const loadVoices = () => {
      voiceRef.current = pickSpeechVoice(voicePrefRef.current);
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [applyVoicePref]);

  const toggleVoicePref = useCallback(() => {
    applyVoicePref(voicePrefRef.current === 'male' ? 'female' : 'male');
  }, [applyVoicePref]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    utteranceRef.current = null;
  }, []);

  const speak = useCallback(
    (messageId: string, text: string) => {
      if (!speechSynthesisSupported() || !text.trim()) return;

      stopSpeaking();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
      const pref = voicePrefRef.current;
      utterance.rate = pref === 'male' ? 1.05 : 1.12;
      utterance.pitch = pref === 'male' ? 0.92 : 1.02;
      const voice = voiceRef.current ?? pickSpeechVoice(pref);
      if (voice) utterance.voice = voice;

      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);

      utteranceRef.current = utterance;
      setSpeakingId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [stopSpeaking],
  );

  useEffect(() => {
    return () => stopSpeaking();
  }, [stopSpeaking]);

  return {
    supported,
    speakingId,
    speak,
    stopSpeaking,
    voicePref,
    toggleVoicePref,
    voiceLabel: voiceRef.current?.name ?? (voicePref === 'male' ? 'Male voice' : 'Female voice'),
  };
}
