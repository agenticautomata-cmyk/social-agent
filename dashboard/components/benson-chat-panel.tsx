'use client';

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import Link from 'next/link';
import {
  ASK_BENSON_IMAGE_ACCEPT,
  ASK_BENSON_IMAGE_MAX_BYTES,
  ASK_BENSON_MEDIA_ACCEPT,
  ASK_BENSON_STARTER_QUESTIONS,
  formatAskBensonCost,
  formatAskBensonMediaLimit,
  maxBytesForAskBensonMedia,
  resolveAskBensonMediaKind,
  type AskBensonMediaKind,
  type AskBensonResponse,
  type BensonChatMessage,
  type ConciergePick,
  type ShareIntakeUploadResponse,
  userFacingAskBensonError,
} from '../lib/ask-benson-types';
import {
  isAndroidDevice,
  isIosDevice,
  useBensonMicInput,
} from '../lib/use-benson-voice';
import { useBensonAnswerVoice } from '../lib/use-benson-studio-voice';
import { useBensonStudio } from '../lib/benson-studio-context';
import { BensonDancer } from './benson-dancer';

import { clientApiUploadUrl, clientApiUrl, parseApiJsonResponse } from '../lib/client-api';

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

function VideoAttachIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M16 10.5l5-3v9l-5-3v-3Z"
        stroke="currentColor"
        strokeWidth="1.75"
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

function SpeakerMutedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 10v4h3.5L12 18V6L8.5 10H5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

function MicInputButton({
  listening,
  transcribing,
  disabled,
  onClick,
  title,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
}: {
  listening: boolean;
  transcribing: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  'aria-label': string;
  'aria-pressed'?: boolean;
}) {
  const active = listening || transcribing;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      title={title}
      className={cn(
        'relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-xl',
        'border transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? listening
            ? 'benson-mic-listening border-rose-400/70 bg-rose-500/20 text-rose-300'
            : 'benson-mic-transcribing border-amber-400/60 bg-amber-500/15 text-amber-200'
          : 'border-white/10 bg-white/[0.06] text-paper-soft hover:border-white/20 hover:bg-white/10 hover:text-white',
      )}
    >
      {listening && (
        <>
          <span
            className="benson-mic-ring absolute inset-0 rounded-xl border-2 border-rose-400/50"
            aria-hidden
          />
          <span
            className="benson-mic-ring benson-mic-ring-delay absolute inset-0 rounded-xl border-2 border-rose-400/35"
            aria-hidden
          />
        </>
      )}
      <MicIcon className={cn('relative h-[18px] w-[18px]', listening && 'benson-mic-icon-pulse')} />
    </button>
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
  variant?: 'page' | 'floating' | 'embedded';
  /** When true, panel is positioned by a draggable parent shell. */
  docked?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  pageContext?: string;
  mediaKitId?: string;
  draftAssetId?: string;
  contentItemId?: string;
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
  draftAssetId,
  contentItemId,
  seedMessage,
}: BensonChatPanelProps) {
  const [messages, setMessages] = useState<BensonChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<'data' | 'image' | 'media'>('data');
  const [error, setError] = useState<string | null>(null);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<File | null>(null);
  const [pendingMediaKind, setPendingMediaKind] = useState<AskBensonMediaKind | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const dictationBaseRef = useRef('');
  const voiceInputForNextSendRef = useRef(false);
  const seedSentRef = useRef(false);
  const { setBensonWorking } = useBensonStudio();

  const clearPendingMedia = useCallback(() => {
    setPendingMedia(null);
    setPendingMediaKind(null);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  }, []);

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
    setImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const attachImageFile = useCallback(
    (file: File | null) => {
      clearPendingMedia();
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
    [clearPendingImage, clearPendingMedia],
  );

  const attachMediaFile = useCallback(
    (file: File | null) => {
      clearPendingImage();
      clearPendingMedia();
      if (!file) return;

      const kind = resolveAskBensonMediaKind(file);
      if (!kind) {
        setError('Unsupported format — use MP4, MOV, WebM, M4A, or MP3.');
        return;
      }

      const maxBytes = maxBytesForAskBensonMedia(kind);
      if (file.size > maxBytes) {
        setError(
          `${kind === 'video' ? 'Video' : 'Audio'} exceeds ${maxBytes / (1024 * 1024)}MB limit.`,
        );
        return;
      }

      setPendingMedia(file);
      setPendingMediaKind(kind);
      setError(null);
      inputRef.current?.focus();
    },
    [clearPendingImage, clearPendingMedia],
  );

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

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

  const voice = useBensonAnswerVoice();
  const mic = useBensonMicInput({
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
        const parsed = await parseApiJsonResponse<{ ok: boolean; error?: string }>(res);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        if (!parsed.data.ok) {
          throw new Error(userFacingAskBensonError(parsed.data.error));
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
      const media = pendingMedia;
      const mediaKind = pendingMediaKind;
      if ((!trimmed && !image && !media) || loading) return;

      setError(null);
      setLoading(true);
      setBensonWorking(true);
      setLoadingMode(image ? 'image' : media ? 'media' : 'data');
      const usedVoiceInput = voiceInputForNextSendRef.current;
      voiceInputForNextSendRef.current = false;
      setInput('');
      dictationBaseRef.current = '';
      const previewForMessage = imagePreviewUrl;
      const imageName = image?.name;

      const userMessage: BensonChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed || (image ? '(image)' : mediaKind === 'audio' ? '(audio)' : '(video)'),
        imagePreviewUrl: previewForMessage ?? undefined,
        imageName,
        mediaName: media?.name,
        mediaKind: mediaKind ?? undefined,
      };
      setMessages((prev) => [...prev, userMessage]);
      clearPendingImage();
      clearPendingMedia();

      try {
        if (media && mediaKind) {
          const body = new FormData();
          body.set(mediaKind, media);
          if (trimmed) body.set('notes', trimmed);
          body.set('submittedBy', 'ask-benson');

          const res = await fetch(clientApiUploadUrl('/api/intake/share'), { method: 'POST', body });
          const raw = await res.text();
          let json: ShareIntakeUploadResponse;
          try {
            json = JSON.parse(raw) as ShareIntakeUploadResponse;
          } catch {
            throw new Error(`Upload failed (${res.status})`);
          }
          if (!res.ok) {
            throw new Error(json.error ?? json.message ?? `Upload failed (${res.status})`);
          }

          const draftUrl = json.draftId ? `/drafts/${json.draftId}` : '/drafts';
          const assistantText =
            json.message ??
            (mediaKind === 'video'
              ? 'Benson is reading your video — check your draft inbox in a moment.'
              : 'Benson is listening to your audio — check your draft inbox in a moment.');

          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: assistantText,
              draftUrl,
              suggestedActions: [
                'Open draft inbox',
                mediaKind === 'video' ? 'Ask about hook and caption' : 'Ask about key moments',
              ],
            },
          ]);
          return;
        }

        let res: Response;
        if (image) {
          const body = new FormData();
          if (trimmed) body.set('message', trimmed);
          body.set('pageContext', pageContext ?? '');
          if (conversationId) body.set('conversationId', conversationId);
          if (mediaKitId) body.set('mediaKitId', mediaKitId);
          if (draftAssetId) body.set('draftAssetId', draftAssetId);
          if (contentItemId) body.set('contentItemId', contentItemId);
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
              draftAssetId,
              contentItemId,
            }),
          });
        }

        const parsed = await parseApiJsonResponse<AskBensonResponse>(res);
        if (!parsed.ok) {
          throw new Error(userFacingAskBensonError(parsed.error, parsed.status));
        }
        const json = parsed.data;
        if (!json.ok) {
          throw new Error(userFacingAskBensonError(json.error, parsed.response.status));
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
        if (!image && !media && json.answer.trim()) {
          voice.maybeAutoPlay(assistantId, json.answer, usedVoiceInput);
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : 'Failed to reach Benson';
        setError(userFacingAskBensonError(raw));
      } finally {
        setLoading(false);
        setBensonWorking(false);
      }
    },
    [
      clearPendingImage,
      clearPendingMedia,
      conversationId,
      contentItemId,
      draftAssetId,
      imagePreviewUrl,
      loading,
      mediaKitId,
      pageContext,
      pendingImage,
      pendingMedia,
      pendingMediaKind,
      setBensonWorking,
      voice,
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
    <div className={panelClass} role="dialog" aria-label="Ask Benson chat" data-benson-chat-panel>
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
              Quick takes or deep dives — trends, sponsors, posting times. Attach a flyer image
              or upload an unposted video for draft intelligence.
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
            speechSupported={voice.settings.voiceMode !== 'text_only'}
            voiceStatus={
              voice.activeMessageId === msg.id ? voice.statusMessage : null
            }
            playbackState={voice.activeMessageId === msg.id ? voice.playbackState : 'idle'}
            isSpeaking={voice.speakingId === msg.id}
            onSpeak={() => voice.listen(msg.id, msg.content)}
            onPause={voice.pause}
            onResume={voice.resume}
            onRestart={() => voice.restart(msg.id, msg.content)}
            onStopSpeak={voice.stop}
            onRegenerate={() => voice.regenerate(msg.id, msg.content)}
            onDeviceVoice={() => voice.useDeviceVoice(msg.id, msg.content)}
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
                : loadingMode === 'media'
                  ? 'benson is receiving your video…'
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
          if (mic.listening) voiceInputForNextSendRef.current = true;
          mic.stopListening();
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
        {pendingMedia && (
          <div className="mb-2 flex items-start gap-2 border border-paper-edge p-2 bg-paper-tint">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-paper-edge bg-black/30">
              <VideoAttachIcon className="h-7 w-7 text-paper-muted" />
            </div>
            <div className="min-w-0 flex-1 text-2xs">
              <p className="font-bold">video draft attached</p>
              <p className="text-paper-muted">
                {pendingMediaKind === 'audio'
                  ? 'Benson will listen and analyze'
                  : 'Benson will watch and analyze'}
              </p>
            </div>
            <button
              type="button"
              onClick={clearPendingMedia}
              className="text-xs font-bold border border-paper-edge px-2 py-1 shrink-0"
              aria-label="Remove video"
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
        <input
          ref={mediaInputRef}
          type="file"
          accept={ASK_BENSON_MEDIA_ACCEPT}
          className="sr-only"
          onChange={(e) => attachMediaFile(e.target.files?.[0] ?? null)}
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
                if (mic.listening) voiceInputForNextSendRef.current = true;
                mic.stopListening();
                void sendMessage(input);
              }
            }}
            rows={2}
            placeholder="Ask Benson…"
            disabled={loading || mic.transcribing}
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            enterKeyHint="send"
            inputMode="text"
            className="w-full min-h-[44px] px-3 py-2.5 text-base sm:text-sm bg-transparent resize-none disabled:opacity-50 focus:outline-none touch-auto select-text"
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
                onClick={() => mediaInputRef.current?.click()}
                disabled={loading}
                aria-label="Upload video or audio"
                title={`Upload unposted video or audio (MP4, MOV, WebM, M4A, MP3 — up to ${formatAskBensonMediaLimit('video')} video)`}
              >
                <VideoAttachIcon className="h-[18px] w-[18px]" />
              </ChatIconButton>
              <MicInputButton
                listening={mic.listening}
                transcribing={mic.transcribing}
                onClick={() => {
                  if (!mic.supported) {
                    setVoiceHint(mic.hintWhenUnsupported ?? 'Type your question or use keyboard dictation.');
                    inputRef.current?.focus();
                    return;
                  }
                  if (!mic.listening) {
                    dictationBaseRef.current = input;
                  }
                  setVoiceHint(
                    mic.mode === 'whisper' && !mic.listening
                      ? isIosDevice()
                        ? 'Tap the mic, speak, then tap again when done.'
                        : 'Tap again when you finish speaking.'
                      : null,
                  );
                  mic.toggleListening();
                }}
                disabled={loading || mic.transcribing}
                aria-label={
                  mic.transcribing
                    ? 'Transcribing voice'
                    : mic.listening
                      ? 'Stop voice input'
                      : 'Start voice input'
                }
                aria-pressed={mic.listening}
                title={
                  mic.supported
                    ? mic.transcribing
                      ? 'Transcribing…'
                      : mic.listening
                        ? mic.mode === 'whisper'
                          ? 'Tap to finish and transcribe'
                          : 'Stop listening'
                        : mic.mode === 'whisper'
                          ? isAndroidDevice()
                            ? 'Tap and speak — tap again when done'
                            : 'Tap and speak — Benson uses Whisper on iPhone'
                          : 'Dictate your question'
                    : 'Voice input not supported in this browser'
                }
              />
              {voice.settings.voiceMode !== 'text_only' && (
                <ChatIconButton
                  active={!voice.voiceMuted}
                  onClick={voice.toggleVoiceMuted}
                  aria-label={voice.voiceMuted ? 'Unmute Benson voice' : 'Mute Benson voice'}
                  aria-pressed={!voice.voiceMuted}
                  title={
                    voice.voiceMuted
                      ? 'Unmute — Benson will read replies aloud'
                      : 'Mute — Benson will not read replies aloud'
                  }
                >
                  {voice.voiceMuted ? (
                    <SpeakerMutedIcon className="h-[18px] w-[18px]" />
                  ) : (
                    <SpeakerIcon className="h-[18px] w-[18px]" />
                  )}
                </ChatIconButton>
              )}
              <Link
                href="/ask-benson/settings"
                className="inline-flex h-9 items-center rounded-lg border border-white/10 px-2 text-2xs text-paper-soft hover:border-white/20"
              >
                Voice
              </Link>
            </div>
            <button
              type="submit"
              disabled={loading || (!input.trim() && !pendingImage && !pendingMedia)}
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
        {mic.transcribing && (
          <p className="text-2xs text-paper-muted mt-2 lowercase">transcribing your voice…</p>
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
  voiceStatus,
  playbackState,
  isSpeaking,
  onSpeak,
  onPause,
  onResume,
  onRestart,
  onStopSpeak,
  onRegenerate,
  onDeviceVoice,
  onConciergePicksChange,
  onFeedback,
}: {
  message: BensonChatMessage;
  speechSupported: boolean;
  voiceStatus: string | null;
  playbackState: string;
  isSpeaking: boolean;
  onSpeak: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onStopSpeak: () => void;
  onRegenerate: () => void;
  onDeviceVoice: () => void;
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
        {message.mediaName && (
          <p className="mb-2 text-2xs text-paper-muted border border-paper-edge px-2 py-1 bg-paper-tint">
            {message.mediaKind === 'audio' ? 'audio draft' : 'video draft'} — shared with Benson
          </p>
        )}
        {message.content !== '(image)' &&
          message.content !== '(video)' &&
          message.content !== '(audio)' && (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        {!isUser && message.draftUrl && (
          <p className="mt-2 text-2xs">
            <Link href={message.draftUrl} className="link font-bold">
              open draft inbox →
            </Link>
          </p>
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
                : message.collection.source === 'link'
                  ? message.collection.urlIntakeDiagnostics?.[0]?.summary ??
                    'nothing extracted from link — try a screenshot or a direct /events subpage'
                  : 'nothing extracted from image — try a sharper photo or clearer screenshot'}
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
              {message.suggestedActions.slice(0, MAX_SUGGESTED_ACTIONS).map((item) => {
                const routeMatch = item.match(/→\s*(\/[^\s]+)/);
                const href = routeMatch?.[1];
                const label = href ? item.replace(/\s*→\s*\/[^\s]+/, '').trim() : item;
                return (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-accent mt-0.5" aria-hidden>
                      →
                    </span>
                    {href ? (
                      <Link href={href} className="hover:text-accent underline-offset-2 hover:underline">
                        {label || href}
                      </Link>
                    ) : (
                      <span>{item}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!isUser && (speechSupported || canFeedback || message.feedbackSentiment) && (
          <div className="mt-3 pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5">
            {speechSupported && (
              <>
                {isSpeaking ? (
                  <>
                    <ChatIconButton active onClick={onStopSpeak} aria-label="Stop" title="Stop" className="h-9 w-9">
                      <StopIcon className="h-4 w-4" />
                    </ChatIconButton>
                    {playbackState === 'paused' ? (
                      <ChatIconButton onClick={onResume} aria-label="Resume" title="Resume" className="h-9 w-9">
                        <SpeakerIcon className="h-4 w-4" />
                      </ChatIconButton>
                    ) : (
                      <ChatIconButton onClick={onPause} aria-label="Pause" title="Pause" className="h-9 w-9">
                        <StopIcon className="h-4 w-4 opacity-70" />
                      </ChatIconButton>
                    )}
                    <ChatIconButton onClick={onRestart} aria-label="Restart" title="Restart" className="h-9 px-2 text-2xs">
                      ↺
                    </ChatIconButton>
                  </>
                ) : (
                  <ChatIconButton onClick={onSpeak} aria-label="Listen" title="Listen" className="h-9 w-9">
                    <SpeakerIcon className="h-4 w-4" />
                  </ChatIconButton>
                )}
                <ChatIconButton onClick={onRegenerate} aria-label="Regenerate audio" title="Regenerate audio" className="h-9 px-2 text-2xs">
                  ↻
                </ChatIconButton>
                <ChatIconButton onClick={onDeviceVoice} aria-label="Device voice" title="Device voice" className="h-9 px-2 text-2xs">
                  📱
                </ChatIconButton>
              </>
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
            {voiceStatus && (
              <p className="text-2xs text-paper-muted basis-full">{voiceStatus}</p>
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
        {!isUser && (message.cached || (message.estimatedCost != null && message.estimatedCost > 0)) && (
          <p className="text-2xs text-paper-muted mt-2 tabular-nums">
            {message.cached ? 'cached reply' : `~$${message.estimatedCost!.toFixed(4)}`}
          </p>
        )}
      </div>
    </div>
  );
}
