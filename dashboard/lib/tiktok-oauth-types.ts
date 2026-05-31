export type TikTokConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'expired'
  | 'error'
  | 'credentials_missing';

export type TikTokConnectionStatusResponse = {
  platform: 'tiktok';
  status: TikTokConnectionStatus;
  credentialsConfigured: boolean;
  credentialsMissing: string[];
  demoMode: boolean;
  connection: {
    id: string;
    platformUsername: string | null;
    platformUserId: string | null;
    scopes: string[];
    connectedAt: string | null;
    expiresAt: string | null;
    lastError: string | null;
  } | null;
  setupInstructions: string | null;
};

export function statusLabel(status: TikTokConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'disconnected':
      return 'not connected';
    case 'expired':
      return 'token expired';
    case 'error':
      return 'connection error';
    case 'credentials_missing':
      return 'credentials not configured';
    default:
      return status;
  }
}
