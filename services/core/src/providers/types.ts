// Provider interfaces. Each external service has a real implementation and
// a mock implementation; selection is driven by env.DEMO_MODE + presence of API keys.

import type { ContentType, Language } from '../schema.js';

// ----------------------------------------------------------------------------
// LLM
// ----------------------------------------------------------------------------

export interface ScriptInput {
  type: ContentType;
  industryName: string;
  industrySeeds: string[];
  language: Language;
  brandVoice: string | null;
  brandCta: string | null;
  recentTopics: string[]; // last N topics for dedup awareness
  rejectionReason?: string | null; // when regenerating after rejection
}

export interface ScriptOutput {
  topic: string;
  hook: string;
  script: string;
  cta: string;
  durationSeconds: number;
}

export interface CaptionInput {
  script: string;
  hook: string;
  industry: string;
  type: ContentType;
  language: Language;
  brandCta: string | null;
}

export interface CaptionOutput {
  instagram: { caption: string; hashtags: string[] };
  tiktok: { caption: string; hashtags: string[] };
}

export interface LlmProvider {
  readonly mode: 'real' | 'mock';
  generateScript(input: ScriptInput): Promise<ScriptOutput>;
  generateCaptions(input: CaptionInput): Promise<CaptionOutput>;
  embed(text: string): Promise<number[]>; // 1536-dim
}

// ----------------------------------------------------------------------------
// Image (persona portraits)
// ----------------------------------------------------------------------------

export interface ImageInput {
  prompt: string;
  width?: number;
  height?: number;
}

export interface ImageOutput {
  url: string;
  prompt: string;
}

export interface ImageProvider {
  readonly mode: 'real' | 'mock';
  generatePortrait(input: ImageInput): Promise<ImageOutput>;
}

// ----------------------------------------------------------------------------
// Avatar video (HeyGen)
// ----------------------------------------------------------------------------

export interface AvatarRenderInput {
  avatarId: string;
  voiceId: string;
  script: string;
  width?: number;
  height?: number;
  background?: { type: 'color' | 'image'; value: string };
}

export interface AvatarRenderJob {
  videoId: string;
}

export type AvatarRenderStatus =
  | { status: 'processing'; progress?: number }
  | { status: 'completed'; videoUrl: string; durationSeconds: number }
  | { status: 'failed'; error: string };

export interface AvatarProvider {
  readonly mode: 'real' | 'mock';
  startRender(input: AvatarRenderInput): Promise<AvatarRenderJob>;
  pollRender(videoId: string): Promise<AvatarRenderStatus>;
}

// ----------------------------------------------------------------------------
// Publishing
// ----------------------------------------------------------------------------

export interface PublishInput {
  videoUrl: string;
  caption: string;
  hashtags: string[];
}

export interface PublishResult {
  remotePostId: string;
  remotePostUrl: string | null;
}

export interface PublishProvider {
  readonly mode: 'real' | 'mock';
  readonly platform: 'instagram' | 'tiktok';
  publish(input: PublishInput): Promise<PublishResult>;
}
