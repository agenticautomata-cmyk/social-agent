'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BensonChatMessage } from '../lib/ask-benson-types';
import { clientApiUrl, parseApiJsonResponse } from '../lib/client-api';
import { BensonChatPanel } from './benson-chat-panel';

const LAST_CONVERSATION_KEY = 'bensonWorkspaceLastConversation';
const RETURN_TO_KEY = 'bensonWorkspaceReturnTo';

type WorkspaceConversation = {
  id: string;
  title: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

type UnknownRecord = Record<string, unknown>;

function value(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
}

function asRecord(input: unknown): UnknownRecord {
  return input && typeof input === 'object' ? (input as UnknownRecord) : {};
}

function conversationFrom(input: unknown): WorkspaceConversation | null {
  const record = asRecord(input);
  const id = value(record, 'id', 'conversationId', 'conversation_id');
  if (typeof id !== 'string' || !id) return null;
  const title = value(record, 'title');
  const preview = value(record, 'lastMessagePreview', 'last_message_preview');
  const lastMessageAt = value(record, 'lastMessageAt', 'last_message_at');
  return {
    id,
    title: typeof title === 'string' && title.trim() ? title : 'New conversation',
    lastMessagePreview: typeof preview === 'string' ? preview : null,
    lastMessageAt: typeof lastMessageAt === 'string' ? lastMessageAt : null,
  };
}

function messageFrom(input: unknown): BensonChatMessage | null {
  const record = asRecord(input);
  const output = asRecord(value(record, 'output', 'outputJson', 'output_json'));
  const snapshot = asRecord(value(record, 'inputSnapshot', 'input_snapshot'));
  const roleValue = value(record, 'role');
  const role = roleValue === 'user' ? 'user' : roleValue === 'assistant' ? 'assistant' : null;
  const id = value(record, 'id', 'messageId', 'message_id');
  if (!role || typeof id !== 'string') return null;

  const rawContent =
    value(record, 'content', 'message') ??
    (role === 'assistant' ? value(output, 'answer', 'content') : value(snapshot, 'message', 'content'));
  const collection = value(output, 'collection');
  const decisionBrief =
    value(output, 'decisionBrief') ?? asRecord(collection).decisionBrief ?? null;

  return {
    id,
    role,
    content: typeof rawContent === 'string' ? rawContent : '',
    evidence: Array.isArray(value(output, 'evidence'))
      ? (value(output, 'evidence') as string[])
      : undefined,
    suggestedActions: Array.isArray(value(output, 'suggestedActions'))
      ? (value(output, 'suggestedActions') as string[])
      : undefined,
    confidence:
      typeof value(output, 'confidence') === 'number'
        ? (value(output, 'confidence') as number)
        : undefined,
    cached: typeof value(output, 'cached') === 'boolean' ? (value(output, 'cached') as boolean) : undefined,
    estimatedCost:
      typeof value(output, 'estimatedCost') === 'number'
        ? (value(output, 'estimatedCost') as number)
        : null,
    collection: collection && typeof collection === 'object'
      ? (collection as BensonChatMessage['collection'])
      : null,
    partnershipId:
      typeof value(output, 'partnershipId') === 'string'
        ? (value(output, 'partnershipId') as string)
        : null,
    researchRunId:
      typeof value(output, 'researchRunId') === 'string'
        ? (value(output, 'researchRunId') as string)
        : null,
    researchStatus:
      typeof value(output, 'researchStatus') === 'string'
        ? (value(output, 'researchStatus') as string)
        : typeof value(asRecord(collection), 'partnershipResearchStatus') === 'string'
          ? (value(asRecord(collection), 'partnershipResearchStatus') as string)
          : null,
    providerStatus:
      value(output, 'providerStatus') && typeof value(output, 'providerStatus') === 'object'
        ? (value(output, 'providerStatus') as BensonChatMessage['providerStatus'])
        : value(asRecord(collection), 'providerStatus') &&
            typeof value(asRecord(collection), 'providerStatus') === 'object'
          ? (value(asRecord(collection), 'providerStatus') as BensonChatMessage['providerStatus'])
          : null,
    decisionBrief: decisionBrief && typeof decisionBrief === 'object'
      ? (decisionBrief as BensonChatMessage['decisionBrief'])
      : null,
    conciergePicks: Array.isArray(value(output, 'conciergePicks'))
      ? (value(output, 'conciergePicks') as BensonChatMessage['conciergePicks'])
      : undefined,
    conciergeSaveResult:
      value(output, 'conciergeSaveResult') && typeof value(output, 'conciergeSaveResult') === 'object'
        ? (value(output, 'conciergeSaveResult') as BensonChatMessage['conciergeSaveResult'])
        : null,
  };
}

export function BensonWorkspace() {
  const router = useRouter();
  const [conversations, setConversations] = useState<WorkspaceConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BensonChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations],
  );

  const loadMessages = useCallback(async (conversationId: string) => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await fetch(
        clientApiUrl(`/api/ask-benson/conversations/${encodeURIComponent(conversationId)}/messages`),
        { cache: 'no-store' },
      );
      const parsed = await parseApiJsonResponse<UnknownRecord>(response);
      if (!parsed.ok) throw new Error(parsed.error);
      const rawMessages = value(parsed.data, 'messages', 'items');
      setMessages(
        (Array.isArray(rawMessages) ? rawMessages : []).flatMap((entry) => {
          const message = messageFrom(entry);
          return message ? [message] : [];
        }),
      );
      setActiveId(conversationId);
      localStorage.setItem(LAST_CONVERSATION_KEY, conversationId);
      void fetch(clientApiUrl(`/api/ask-benson/conversations/${encodeURIComponent(conversationId)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastOpened: true }),
      });
    } catch (error) {
      setMessages([]);
      setHistoryError(error instanceof Error ? error.message : 'Could not load this conversation.');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setHistoryError(null);
    try {
      const response = await fetch(clientApiUrl('/api/ask-benson/conversations?limit=30'), {
        cache: 'no-store',
      });
      const parsed = await parseApiJsonResponse<UnknownRecord>(response);
      if (!parsed.ok) throw new Error(parsed.error);
      const rawConversations = value(parsed.data, 'conversations', 'items');
      const next = (Array.isArray(rawConversations) ? rawConversations : []).flatMap((entry) => {
        const conversation = conversationFrom(entry);
        return conversation ? [conversation] : [];
      });
      setConversations(next);

      const params = new URLSearchParams(window.location.search);
      const requested = params.get('conversation');
      const remembered = localStorage.getItem(LAST_CONVERSATION_KEY);
      const initialId =
        (requested && next.some((entry) => entry.id === requested) ? requested : null) ??
        (remembered && next.some((entry) => entry.id === remembered) ? remembered : null) ??
        next[0]?.id ??
        null;
      if (initialId) await loadMessages(initialId);
      else setLoadingHistory(false);
    } catch (error) {
      setLoadingHistory(false);
      setHistoryError(error instanceof Error ? error.message : 'Could not load recent conversations.');
    }
  }, [loadMessages]);

  useEffect(() => {
    document.body.classList.add('benson-workspace-active');
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    if (returnTo?.startsWith('/') && !returnTo.startsWith('/ask-benson')) {
      sessionStorage.setItem(RETURN_TO_KEY, returnTo);
    }
    void loadConversations();
    return () => document.body.classList.remove('benson-workspace-active');
  }, [loadConversations]);

  const goBack = useCallback(() => {
    const stored = sessionStorage.getItem(RETURN_TO_KEY);
    if (stored?.startsWith('/') && !stored.startsWith('/ask-benson')) {
      router.push(stored);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/home');
  }, [router]);

  const startConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setHistoryError(null);
    setLoadingHistory(false);
    setMobileHistoryOpen(false);
    localStorage.removeItem(LAST_CONVERSATION_KEY);
  }, []);

  const selectConversation = useCallback(
    (conversationId: string) => {
      setMobileHistoryOpen(false);
      void loadMessages(conversationId);
    },
    [loadMessages],
  );

  const handleConversationChange = useCallback(
    (conversationId: string) => {
      setActiveId(conversationId);
      localStorage.setItem(LAST_CONVERSATION_KEY, conversationId);
      void loadConversations();
    },
    [loadConversations],
  );

  return (
    <section className="benson-workspace" aria-label="Benson workspace">
      <RecentConversations
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((value) => !value)}
        onNew={startConversation}
        onSelect={selectConversation}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-[3.75rem] shrink-0 items-center gap-2 border-b border-white/10 bg-black/20 px-3 sm:px-4">
          <button
            type="button"
            onClick={goBack}
            className="min-h-[44px] rounded-lg px-2 text-sm text-paper-soft hover:bg-white/[0.06]"
            aria-label="Back to previous page"
          >
            ← <span className="hidden sm:inline">Back</span>
          </button>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="truncate text-sm font-bold text-white">
              {activeConversation?.title ?? 'Ask Benson'}
            </h1>
            <p className="hidden text-2xs text-paper-muted sm:block">Your persistent workspace</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileHistoryOpen(true)}
            className="min-h-[44px] rounded-lg px-2 text-sm text-paper-soft hover:bg-white/[0.06] lg:hidden"
          >
            Recent
          </button>
          <button
            type="button"
            onClick={startConversation}
            className="hidden min-h-[40px] rounded-lg border border-white/10 px-3 text-xs font-bold sm:block"
          >
            New chat
          </button>
        </header>

        <div className="min-h-0 flex-1">
          {loadingHistory ? (
            <div className="flex h-full items-center justify-center text-sm text-paper-muted">
              Loading conversation…
            </div>
          ) : (
            <BensonChatPanel
              key={activeId ?? 'new'}
              variant="workspace"
              pageContext="/ask-benson"
              initialConversationId={activeId}
              initialMessages={messages}
              onConversationChange={handleConversationChange}
            />
          )}
        </div>
        {historyError && (
          <p className="shrink-0 border-t border-red-300/20 bg-red-500/5 px-4 py-2 text-xs text-red-200">
            {historyError}
          </p>
        )}
      </div>

      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-[10020] bg-black/70 lg:hidden" role="presentation">
          <div
            className="ml-auto flex h-[100dvh] w-[min(88vw,22rem)] flex-col border-l border-white/10 bg-[#0b0b13] pt-[env(safe-area-inset-top)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Recent conversations"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-3">
              <h2 className="font-bold">Recent</h2>
              <button
                type="button"
                onClick={() => setMobileHistoryOpen(false)}
                className="min-h-[44px] min-w-[44px] rounded-lg text-xl"
                aria-label="Close recent conversations"
              >
                ×
              </button>
            </div>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onSelect={selectConversation}
            />
            <button
              type="button"
              onClick={startConversation}
              className="m-3 min-h-[44px] rounded-xl bg-accent/15 px-3 text-sm font-bold text-accent"
            >
              New conversation
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function RecentConversations({
  conversations,
  activeId,
  open,
  onToggle,
  onNew,
  onSelect,
}: {
  conversations: WorkspaceConversation[];
  activeId: string | null;
  open: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-white/10 bg-black/20 transition-[width] lg:flex ${
        open ? 'w-64' : 'w-14'
      }`}
    >
      <div className="flex min-h-[3.75rem] items-center justify-between border-b border-white/10 p-2">
        {open && <h2 className="px-2 text-sm font-bold">Recent</h2>}
        <button
          type="button"
          onClick={onToggle}
          className="min-h-[40px] min-w-[40px] rounded-lg text-paper-muted hover:bg-white/[0.06]"
          aria-label={open ? 'Collapse recent conversations' : 'Expand recent conversations'}
        >
          {open ? '‹' : '›'}
        </button>
      </div>
      {open && (
        <>
          <button
            type="button"
            onClick={onNew}
            className="m-3 min-h-[40px] rounded-xl bg-accent/15 px-3 text-left text-xs font-bold text-accent"
          >
            + New conversation
          </button>
          <ConversationList conversations={conversations} activeId={activeId} onSelect={onSelect} />
        </>
      )}
    </aside>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: WorkspaceConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return <p className="p-4 text-xs text-paper-muted">No conversations yet.</p>;
  }
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Recent Benson conversations">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation.id)}
          className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left ${
            conversation.id === activeId
              ? 'bg-accent/15 text-white'
              : 'text-paper-soft hover:bg-white/[0.05]'
          }`}
        >
          <span className="block truncate text-xs font-semibold">{conversation.title}</span>
          {conversation.lastMessagePreview && (
            <span className="mt-1 block truncate text-2xs text-paper-muted">
              {conversation.lastMessagePreview}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
