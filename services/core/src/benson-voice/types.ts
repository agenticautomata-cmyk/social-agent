export type VoiceMode = 'studio' | 'device' | 'text_only';
export type AutoPlayMode = 'off' | 'short_only' | 'all';
export type LongAnswerMode = 'full' | 'summary' | 'ask';
export type PlaybackSpeed = 0.75 | 1.0 | 1.25 | 1.5;

export type VoiceJobStatus =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'normalizing'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type VoiceServiceStatus = 'healthy' | 'warming' | 'degraded' | 'unavailable' | 'restarting';
export type VoiceModelStatus = 'not_installed' | 'downloading' | 'loading' | 'ready' | 'failed';
export type VoiceQueueStatus = 'healthy' | 'delayed' | 'blocked';

export type VoiceSettings = {
  voiceMode: VoiceMode;
  voiceboxProfileId: string | null;
  autoPlay: AutoPlayMode;
  playbackSpeed: PlaybackSpeed;
  longAnswerMode: LongAnswerMode;
  fallbackEnabled: boolean;
};

export type VoiceGenerationJob = {
  id: string;
  requestId: string;
  messageId: string | null;
  creatorId: string;
  voiceProfile: string;
  engine: string;
  textHash: string;
  spokenText: string;
  speechTransformVersion: number;
  playbackSpeed: number;
  status: VoiceJobStatus;
  queueTimestamp: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  retryCount: number;
  sanitizedError: string | null;
  generatedAudioId: string | null;
  durationSeconds: number | null;
  modelVersion: string | null;
  chunkIndex: number;
  chunkTotal: number;
  voiceboxGenerationId: string | null;
};

export type GeneratedVoiceAudio = {
  id: string;
  messageId: string | null;
  creatorId: string;
  jobId: string | null;
  textHash: string;
  voiceProfile: string;
  engine: string;
  modelVersion: string | null;
  speechTransformVersion: number;
  playbackSpeed: number;
  durationSeconds: number | null;
  fileFormat: string;
  fileSizeBytes: number;
  chunkIndex: number;
  chunkTotal: number;
  createdAt: string;
  lastPlayedAt: string | null;
  expiresAt: string;
  deletedAt: string | null;
};

export type VoiceServiceHealthSnapshot = {
  serviceStatus: VoiceServiceStatus;
  modelStatus: VoiceModelStatus;
  queueStatus: VoiceQueueStatus;
  activeEngine: string | null;
  modelVersion: string | null;
  voiceboxProfileId: string | null;
  voiceboxUpstreamTag: string | null;
  voiceboxUpstreamCommit: string | null;
  lastHeartbeat: string | null;
  lastSuccessfulGeneration: string | null;
  lastFailedGeneration: string | null;
  averageGenerationMs: number | null;
  currentQueueDepth: number;
  sanitizedLatestError: string | null;
  generationPaused: boolean;
  storageBytes: number;
};

export type VoiceGenerateRequest = {
  messageId: string;
  answerText: string;
  regenerate?: boolean;
  playbackSpeed?: PlaybackSpeed;
  longAnswerOverride?: LongAnswerMode;
};

export type VoiceGenerateResponse = {
  ok: true;
  jobs: VoiceGenerationJob[];
  cached: boolean;
  audioIds: string[];
  spokenText: string;
  studioAvailable: boolean;
  fallbackRecommended: boolean;
  statusMessage: string;
  needsConfirmation?: boolean;
};

export type VoiceboxGenerationResponse = {
  id: string;
  status: string;
  error?: string | null;
};

export type VoiceboxGenerationStatus = {
  id: string;
  status: 'generating' | 'completed' | 'failed';
  progress?: number | null;
  error?: string | null;
  audio_path?: string | null;
};
