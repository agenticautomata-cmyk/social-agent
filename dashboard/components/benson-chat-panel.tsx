'use client';

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import {
  ASK_BENSON_IMAGE_ACCEPT,
  ASK_BENSON_IMAGE_MAX_BYTES,
  ASK_BENSON_STARTER_QUESTIONS,
  formatAskBensonCost,
  type AskBensonResponse,
  type BensonChatMessage,
  type ConciergePick,
} from '../lib/ask-benson-types';
import {
  getBensonAutoReadAfterVoice,
  speechTextFromAnswer,
  useBensonSpeechRecognition,
  useBensonSpeechSynthesis,
} from '../lib/use-benson-voice';
import { useBensonStudio } from '../lib/benson-studio-context';
import { BensonDancer } from './benson-dancer';

import { clientApiUrl } from '../lib/client-api';

const MAX_SUGGESTED_ACTIONS = 2;

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function ImageAttachIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="8.5" cy="10" r="1.75" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6.5 17l4.2-4.2a1.2 1.2 0 0 1 1.7 0L16 16.5M14 14l1.8-1.8a1.2 1.2 0 0 1 1.7 0L20.5 17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 10v4h3.5L12 18V6L8.5 10H5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 12h12M13 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIconButton({
  active = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        'border border-white/10 bg-white/[0.06] text-paper-soft',
        'transition-all duration-150',
        'hover:border-white/20 hover:bg-white/10 hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:pointer-events-none disabled:opacity-40',
        active &&
          'border-accent/45 bg-accent/15 text-accent shadow-[0_0_14px_rgba(192,132,252,0.22)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

type BensonChatPanelProps = {
  variant?: 'page' | 'floating';
  /** When true, panel is positioned by a draggable parent shell. */
  docked?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  pageContext?: string;
  mediaKitId?: string;
  /** Auto-send once when the panel mounts (e.g. media kit review). */
  seedMessage?: string;
};

export function BensonChatPanel({
  variant = 'page',
  docked = false,
  isOpen = true,
  onClose,
  pageContext,
  mediaKitId,
  seedMessage,
}: BensonChatPanelProps) {
  const [messages, setMessages] = useState<BensonChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'data' | 'image'>('data');
  const [error, setError] = useState<string | null>(null);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dictationBaseRef = useRef('');
  const voiceInputForNextSendRef = useRef(false);
  const seedSentRef = useRef(false);
  const { setBensonWorking } = useBensonStudio();

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const attachImageFile = useCallback(
    (file: File | null) => {
      clearPendingImage();
      if (!file) return;

      if (file.size > ASK_BENSON_IMAGE_MAX_BYTES) {
        setError(`Image exceeds ${ASK_BENSON_IMAGE_MAX_BYTES / (1024 * 1024)}MB limit.`);
        return;
      }

      setPendingImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      setError(null);
      inputRef.current?.focus();
    },
    [clearPendingImage],
  );

  const appendTranscript = useCallback((text: string, isFinal: boolean) => {
    if (!text) return;
    if (isFinal) {
      voiceInputForNextSendRef.current = true;
      const base = dictationBaseRef.current.trimEnd();
      dictationBaseRef.current = base ? `${base} ${text}` : text;
      setInput(dictationBaseRef.current);
      setVoiceHint(null);
    } else {
      const base = dictationBaseRef.current.trimEnd();
      setInput(base ? `${base} ${text}` : text);
    }
    inputRef.current?.focus();
  }, []);

  const speech = useBensonSpeechSynthesis();
  const recognition = useBensonSpeechRecognition({
    onTranscript: appendTranscript,
    onError: (message) => setVoiceHint(message),
  });

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    if (variant === 'floating' && isOpen) {
      inputRef.current?.focus();
    }
  }, [variant, isOpen]);

  const submitFeedback = useCallback(
    async (messageId: string, sentiment: 'up' | 'down', reasonCode?: string) => {
      try {
        const res = await fetch(clientApiUrl('/api/ask-benson/feedback'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, sentiment, reasonCode }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `Feedback failed (${res.status})`);
        }
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === messageId ? { ...entry, feedbackSentiment: sentiment } : entry,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Feedback failed');
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string, imageFile?: File | null) => {
      const trimmed = text.trim();
      const image = imageFile ?? pendingImage;
      if ((!trimmed && !image) || loading) return;

      setError(null);
      setLoading(true);
      setBensonWorking(true);
      setLoadingMode(image ? 'image' : 'data');
      const shouldAutoReadAloud =
        !image &&
        getBensonAutoReadAfterVoice() &&
        voiceInputForNextSendRef.current &&
        speech.supported;
      voiceInputForNextSendRef.current = false;
      setInput('');
      dictationBaseRef.current = '';
      const previewForMessage = imagePreviewUrl;
      const imageName = image?.name;

      const userMessage: BensonChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed || '(image)',
        imagePreviewUrl: previewForMessage ?? undefined,
        imageName,
      };
      setMessages((prev) => [...prev, userMessage]);
      clearPendingImage();

      try {
        let res: Response;
        if (image) {
          const body = new FormData();
          if (trimmed) body.set('message', trimmed);
          body.set('pageContext', pageContext ?? '');
          if (conversationId) body.set('conversationId', conversationId);
          if (mediaKitId) body.set('mediaKitId', mediaKitId);
          body.set('image', image);
          res = await fetch(clientApiUrl('/api/ask-benson'), { method: 'POST', body });
        } else {
          res = await fetch(clientApiUrl('/api/ask-benson'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: trimmed,
              pageContext,
              conversationId: conversationId ?? undefined,
              mediaKitId,
            }),
          });
        }

        const raw = await res.text();
        let json: AskBensonResponse;
        try {
          json = JSON.parse(raw) as AskBensonResponse;
        } catch (parseErr) {
          throw parseErr;
        }
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }

        setConversationId(json.conversationId);
        const assistantId = json.messageId ?? `assistant-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: json.answer,
            evidence: json.evidence,
            suggestedActions: json.suggestedActions,
            confidence: json.confidence,
            cached: json.cached,
            estimatedCost: json.estimatedCost,
            collection: json.collection ?? null,
            conciergePicks: json.conciergePicks,
            conciergeSaveResult: json.conciergeSaveResult ?? null,
          },
        ]);
        if (shouldAutoReadAloud && json.answer.trim()) {
          speech.speak(assistantId, speechTextFromAnswer(json.answer));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reach Benson');
      } finally {
        setLoading(false);
        setBensonWorking(false);
      }
    },
    [
      clearPendingImage,
      conversationId,
      imagePreviewUrl,
      loading,
      mediaKitId,
      pageContext,
      pendingImage,
      setBensonWorking,
      speech,
    ],
  );

  useEffect(() => {
    if (!seedMessage?.trim() || seedSentRef.current || loading) return;
    seedSentRef.current = true;
    void sendMessage(seedMessage);
  }, [loading, seedMessage, sendMessage]);

  if (variant === 'floating' && !isOpen) return null;

  const panelClass =
    variant === 'floating'
      ? docked
        ? 'w-[min(100vw-2rem,24rem)] max-h-[min(70dvh,32rem)] flex flex-col glass-panel-strong shadow-glow overflow-hidden'
        : 'fixed z-50 inset-x-0 bottom-0 h-[88dvh] max-h-[88dvh] sm:inset-x-auto sm:right-4 sm:bottom-20 sm:h-auto sm:w-[min(100vw-2rem,24rem)] sm:max-h-[min(70vh,32rem)] flex flex-col glass-panel-strong shadow-glow overflow-hidden'
      : 'flex flex-col glass-panel-strong min-h-[32rem] max-h-[calc(100dvh-12rem)] overflow-hidden';

  return (
    <div className={panelClass} role="dialog" aria-label="Ask Benson chat">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 shrink-0 bg-white/5 backdrop-blur-md">
        <BensonDancer size={52} variant="full" forceDance={loading} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold gradient-text">Ask Benson</h2>
          <p className="text-2xs text-paper-muted truncate">
            analytics · sponsors · posting times
          </p>
        </div>
        {variant === 'floating' && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] border-2 border-paper-edge text-sm font-bold"
            aria-label="Close chat"
          >
            ×
          </button>
        )}
        {variant === 'page' && (
          <Link
            href="/strategist"
            className="text-2xs font-bold border border-paper-edge px-2 py-1 hidden sm:inline"
          >
            strategist →
          </Link>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 min-h-0 [-webkit-overflow-scrolling:touch]"
      >
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-paper-muted lowercase leading-relaxed">
              Quick takes or deep dives — trends, sponsors, posting times. Follow-ups stay in
              context.
            </p>
            <div className="flex flex-col gap-2">
              {ASK_BENSON_STARTER_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(question)}
                  className="text-left text-sm rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 hover:bg-white/[0.08] hover:border-white/15 transition min-h-[44px]"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            speechSupported={speech.supported}
            isSpeaking={speech.speakingId === msg.id}
            onSpeak={() => speech.speak(msg.id, speechTextFromAnswer(msg.content))}
            onStopSpeak={speech.stopSpeaking}
            onConciergePicksChange={(picks) => {
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === msg.id ? { ...entry, conciergePicks: picks } : entry,
                ),
              );
            }}
            onFeedback={(sentiment, reasonCode) =>
              void submitFeedback(msg.id, sentiment, reasonCode)
            }
          />
        ))}

        {loading && (
          <div className="flex items-start gap-2 text-sm text-paper-muted lowercase">
            <BensonDancer size={40} variant="full" forceDance />
            <span>
              {loadingMode === 'image'
                ? 'benson is extracting opportunities from your image…'
                : 'benson is working…'}
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 py-2 text-sm text-red-700 border-t border-paper-edge lowercase">
          // {error}
        </p>
      )}

      <form
        className="border-t border-white/10 p-3 shrink-0 bg-black/20 backdrop-blur-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (recognition.listening) voiceInputForNextSendRef.current = true;
          recognition.stopListening();
          void sendMessage(input);
        }}
      >
        {imagePreviewUrl && (
          <div className="mb-2 flex items-start gap-2 border border-paper-edge p-2 bg-paper-tint">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreviewUrl}
              alt=""
              className="h-16 w-16 object-cover border border-paper-edge shrink-0"
            />
            <div className="min-w-0 flex-1 text-2xs">
              <p className="font-bold truncate">{pendingImage?.name ?? 'image'}</p>
              <p className="text-paper-muted">attached — add a question or send</p>
            </div>
            <button
              type="button"
              onClick={clearPendingImage}
              className="text-xs font-bold border border-paper-edge px-2 py-1 shrink-0"
              aria-label="Remove image"
            >
              ×
            </button>
          </div>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept={ASK_BENSON_IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => attachImageFile(e.target.files?.[0] ?? null)}
        />
        <div className="rounded-xl border border-white/10 bg-white/[0.04] focus-within:border-white/20 focus-within:ring-2 focus-within:ring-accent/30 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              dictationBaseRef.current = e.target.value;
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (recognition.listening) voiceInputForNextSendRef.current = true;
                recognition.stopListening();
                void sendMessage(input);
              }
            }}
            rows={2}
            placeholder="Ask Benson…"
            disabled={loading}
            className="w-full min-h-[44px] px-3 py-2.5 text-sm bg-transparent resize-none disabled:opacity-50 focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-2">
            <div className="flex items-center gap-1.5">
              <ChatIconButton
                onClick={() => imageInputRef.current?.click()}
                disabled={loading}
                aria-label="Upload image"
                title="Upload image (JPG, PNG, WebP, GIF — max 5MB)"
              >
                <ImageAttachIcon className="h-[18px] w-[18px]" />
              </ChatIconButton>
              <ChatIconButton
                active={recognition.listening}
                onClick={() => {
                  if (!recognition.supported) {
                    setVoiceHint('Use your phone keyboard microphone to dictate.');
                    inputRef.current?.focus();
                    return;
                  }
                  if (!recognition.listening) {
                    dictationBaseRef.current = input;
                  }
                  setVoiceHint(null);
                  recognition.toggleListening();
                }}
                disabled={loading}
                aria-label={recognition.listening ? 'Stop voice input' : 'Start voice input'}
                aria-pressed={recognition.listening}
                title={
                  recognition.supported
                    ? recognition.listening
                      ? 'Stop listening'
                      : 'Dictate your question'
                    : 'Voice input not supported in this browser'
                }
              >
                <MicIcon className="h-[18px] w-[18px]" />
              </ChatIconButton>
              {speech.supported && (
                <ChatIconButton
                  active={speech.voicePref === 'male'}
                  onClick={speech.toggleVoicePref}
                  disabled={loading}
                  aria-label={
                    speech.voicePref === 'male'
                      ? 'Read-aloud voice: male (Benson). Tap to switch to female.'
                      : 'Read-aloud voice: female. Tap to switch to male (Benson).'
                  }
                  title={
                    speech.voicePref === 'male'
                      ? 'Read-aloud: male voice (Benson)'
                      : 'Read-aloud: female voice'
                  }
                >
                  <span className="text-[11px] font-bold leading-none">
                    {speech.voicePref === 'male' ? 'M' : 'F'}
                  </span>
                </ChatIconButton>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || (!input.trim() && !pendingImage)}
              aria-label="Send message"
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold',
                'bg-gradient-to-r from-glow-violet to-glow-pink text-white',
                'shadow-[0_0_16px_rgba(192,132,252,0.25)]',
                'transition hover:brightness-110',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                'disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed',
              )}
            >
              <span className="hidden sm:inline">Send</span>
              <SendIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
        {voiceHint && (
          <p className="text-2xs text-paper-muted mt-2 lowercase">{voiceHint}</p>
        )}
      </form>
    </div>
  );
}

function ConciergePicksSection({
  picks,
  onChange,
}: {
  picks: ConciergePick[];
  onChange: (picks: ConciergePick[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSave(action: 'save' | 'plan_today', pick: ConciergePick) {
    setBusy(`${pick.pickId}:${action}`);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/ask-benson/save-pick'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pick, action }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        contentItemId?: string;
        reviewUrl?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Save failed (${res.status})`);
      }
      onChange(
        picks.map((entry) =>
          entry.pickId === pick.pickId
            ? {
                ...entry,
                contentItemId: json.contentItemId ?? entry.contentItemId,
                reviewUrl: json.reviewUrl ?? entry.reviewUrl,
                plannerState: action === 'plan_today' ? 'planned_today' : 'saved',
              }
            : entry,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 pt-2 border-t border-dashed border-paper-edge space-y-2">
      <p className="text-2xs uppercase tracking-wider text-paper-muted">
        save picks · or say &quot;save for later&quot; / &quot;add to today&quot;
      </p>
      <ul className="space-y-2">
        {picks.map((pick) => (
          <li key={pick.pickId} className="border border-paper-edge p-2 bg-paper-tint space-y-2">
            <div>
              {pick.reviewUrl ? (
                <Link href={pick.reviewUrl} className="font-bold hover:text-accent text-xs">
                  {pick.title}
                </Link>
              ) : pick.sourceUrl ? (
                <a
                  href={pick.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold hover:text-accent text-xs"
                >
                  {pick.title}
                </a>
              ) : (
                <p className="font-bold text-xs">{pick.title}</p>
              )}
              <p className="text-2xs text-paper-muted mt-1">
                {pick.eventDateLabel ?? (pick.location ? pick.location : pick.origin === 'web' ? 'web find' : 'inventory')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy || pick.plannerState === 'saved' || pick.plannerState === 'planned_today'}
                onClick={() => void runSave('save', pick)}
                className="border border-paper-edge px-2 py-1 text-2xs hover:border-paper-ink disabled:opacity-40"
              >
                {busy === `${pick.pickId}:save`
                  ? '…'
                  : pick.plannerState === 'saved' || pick.plannerState === 'planned_today'
                    ? 'saved ✓'
                    : 'save for later'}
              </button>
              <button
                type="button"
                disabled={!!busy || pick.plannerState === 'planned_today'}
                onClick={() => void runSave('plan_today', pick)}
                className="border border-paper-edge px-2 py-1 text-2xs hover:border-paper-ink disabled:opacity-40"
              >
                {busy === `${pick.pickId}:plan_today`
                  ? '…'
                  : pick.plannerState === 'planned_today'
                    ? 'on today ✓'
                    : 'add to today'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-2xs text-accent">{error}</p>}
      <p className="text-2xs text-paper-muted">
        saved items show in{' '}
        <Link href="/planner" className="link">
          planner
        </Link>{' '}
        and{' '}
        <Link href="/actions" className="link">
          things to do now
        </Link>
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  speechSupported,
  isSpeaking,
  onSpeak,
  onStopSpeak,
  onConciergePicksChange,
  onFeedback,
}: {
  message: BensonChatMessage;
  speechSupported: boolean;
  isSpeaking: boolean;
  onSpeak: () => void;
  onStopSpeak: () => void;
  onConciergePicksChange: (picks: ConciergePick[]) => void;
  onFeedback: (sentiment: 'up' | 'down', reasonCode?: string) => void;
}) {
  const isUser = message.role === 'user';
  const canFeedback =
    !isUser && /^[0-9a-f-]{36}$/i.test(message.id) && message.feedbackSentiment == null;
  const [showDownReasons, setShowDownReasons] = useState(false);

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <BensonDancer size={28} variant="compact" className="mt-0.5" />
      )}
      <div
        className={`max-w-[85%] min-w-0 rounded-2xl border px-3 py-2.5 text-sm break-words ${
          isUser
            ? 'border-white/15 bg-white/[0.08]'
            : 'border-white/10 bg-white/[0.04]'
        }`}
      >
        {message.imagePreviewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.imagePreviewUrl}
            alt={message.imageName ?? 'Uploaded'}
            className="mb-2 max-h-40 w-auto border border-paper-edge object-contain"
          />
        )}
        {message.content !== '(image)' && (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        {!isUser && message.conciergePicks && message.conciergePicks.length > 0 && (
          <ConciergePicksSection
            picks={message.conciergePicks}
            onChange={onConciergePicksChange}
          />
        )}
        {!isUser && message.conciergeSaveResult && (
          <p className="mt-2 text-2xs text-paper-muted">
            added to {message.conciergeSaveResult.plannerListName.toLowerCase()} ·{' '}
            <Link href={message.conciergeSaveResult.reviewUrl} className="link">
              open in inventory
            </Link>
          </p>
        )}
        {!isUser && message.collection && message.collection.items.length > 0 && (
          <div className="mt-3 pt-2 border-t border-dashed border-paper-edge">
            <p className="text-2xs uppercase tracking-wider text-paper-muted mb-1">
              {message.collection.source === 'link'
                ? 'from link'
                : message.collection.source === 'lookup'
                  ? 'from lookup'
                  : message.collection.source === 'enrich'
                    ? 'enriched'
                    : 'from image'}{' '}
              · {message.collection.created} new · {message.collection.updated} updated
              {message.collection.scoredCount
                ? ` · ${message.collection.scoredCount} scored`
                : ''}
            </p>
            <ul className="text-xs space-y-2">
              {message.collection.items.slice(0, 8).map((item) => (
                <li key={item.contentItemId} className="border border-paper-edge p-2 bg-paper-tint">
                  <Link
                    href={`/review/inventory?id=${item.contentItemId}`}
                    className="font-bold hover:text-accent"
                  >
                    {item.title}
                  </Link>
                  <p className="text-2xs text-paper-muted mt-1">
                    relevance {(item.relevanceScore * 100).toFixed(0)}% · urgency{' '}
                    {(item.urgencyScore * 100).toFixed(0)}%
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            {message.collection.items.length > 8 && (
              <p className="text-2xs text-paper-muted mt-2">
                +{message.collection.items.length - 8} more in{' '}
                <Link href="/review/inventory" className="link">
                  inventory
                </Link>
              </p>
            )}
          </div>
        )}
        {!isUser &&
          message.collection &&
          message.collection.items.length === 0 &&
          (message.collection.source === 'image' || message.collection.source === 'link') && (
            <p className="mt-2 text-2xs text-paper-muted">
              {message.collection.intakeError
                ? `couldn't auto-add from ${message.collection.source === 'image' ? 'image' : 'link'} — try again with a clearer upload`
                : `nothing extracted from ${message.collection.source === 'image' ? 'image' : 'link'} — try a sharper photo or paste a link`}
            </p>
          )}
        {!isUser && message.evidence && message.evidence.length > 0 && (
          <div className="mt-3 pt-2 border-t border-dashed border-paper-edge">
            <p className="text-2xs uppercase tracking-wider text-paper-muted mb-1">evidence</p>
            <ul className="text-xs space-y-1 list-disc list-inside text-paper-soft">
              {message.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {!isUser && message.suggestedActions && message.suggestedActions.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-white/10">
            <ul className="text-xs space-y-1.5 text-paper-soft">
              {message.suggestedActions.slice(0, MAX_SUGGESTED_ACTIONS).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-accent mt-0.5" aria-hidden>
                    →
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!isUser && (speechSupported || canFeedback || message.feedbackSentiment) && (
          <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5">
            {speechSupported && (
              isSpeaking ? (
                <ChatIconButton
                  active
                  onClick={onStopSpeak}
                  aria-label="Stop reading aloud"
                  title="Stop reading aloud"
                  className="h-9 w-9"
                >
                  <StopIcon className="h-4 w-4" />
                </ChatIconButton>
              ) : (
                <ChatIconButton
                  onClick={onSpeak}
                  aria-label="Read answer aloud"
                  title="Read answer aloud"
                  className="h-9 w-9"
                >
                  <SpeakerIcon className="h-4 w-4" />
                </ChatIconButton>
              )
            )}
            {canFeedback && !message.feedbackSentiment && (
              <>
                <ChatIconButton
                  onClick={() => onFeedback('up')}
                  aria-label="Helpful answer"
                  title="Helpful"
                  className="h-9 w-9 text-base"
                >
                  👍
                </ChatIconButton>
                <ChatIconButton
                  onClick={() => setShowDownReasons((v) => !v)}
                  aria-label="Not helpful"
                  title="Not helpful"
                  className="h-9 w-9 text-base"
                >
                  👎
                </ChatIconButton>
              </>
            )}
            {message.feedbackSentiment && (
              <p className="text-2xs text-paper-muted pl-1">
                {message.feedbackSentiment === 'up' ? 'thanks — noted ✓' : 'got it — will improve ✓'}
              </p>
            )}
          </div>
        )}
        {showDownReasons && canFeedback && !message.feedbackSentiment && (
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ['wrong_timing', 'wrong timing'],
              ['missing_context', 'missing context'],
              ['low_confidence', 'not confident'],
              ['other', 'other'],
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => onFeedback('down', code)}
                className="rounded-lg border border-white/10 px-2 py-1 text-2xs hover:border-white/20 hover:bg-white/[0.06]"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onFeedback('down')}
              className="rounded-lg border border-white/10 px-2 py-1 text-2xs hover:border-white/20 hover:bg-white/[0.06]"
            >
              skip
            </button>
          </div>
        )}
        {!isUser && message.confidence != null && message.confidence < 60 && (
          <p className="text-2xs text-paper-muted mt-2 tabular-nums">
            low confidence ({message.confidence}%)
          </p>
        )}
      </div>
    </div>
  );
}
