import { featureFlags } from '@social-agent/core/feature-flags';

export const isBensonBranding = featureFlags.enableBensonBranding;

export type DashboardBranding = {
  productName: string;
  metadataTitle: string;
  metadataDescription: string;
  footerCommand: string;
  footerLinkLabel: string;
  footerLinkHref: string;
  overviewGreeting: string;
  overviewSubline?: string;
};

export const legacyBranding: DashboardBranding = {
  productName: 'social-agent',
  metadataTitle: 'social-agent · autonomous social-video pipeline',
  metadataDescription:
    'Self-running AI content agent for short-form social video. State-machine in Postgres, TypeScript workers, n8n orchestration.',
  footerCommand: '$ pnpm dev:all  ·  127.0.0.1:3000',
  footerLinkLabel: 'github.com/anthonyonazure/social-agent',
  footerLinkHref: 'https://github.com/anthonyonazure/social-agent',
  overviewGreeting: '// pipeline health across all campaigns',
};

export const bensonBranding: DashboardBranding = {
  productName: 'Benson',
  metadataTitle: 'Benson · Kansas City content opportunity assistant',
  metadataDescription:
    'Benson watches Kansas City and surfaces content opportunities worth your attention. Kellie reviews; Benson discovers and explains.',
  footerCommand: '$ pnpm dev:all  ·  Benson  ·  127.0.0.1:3000',
  footerLinkLabel: 'Kellie Assistant',
  footerLinkHref: 'https://github.com/anthonyonazure/social-agent',
  overviewGreeting: '// Good morning, Kellie.',
  overviewSubline: 'Benson watches Kansas City — pipeline health at a glance.',
};

export function getBranding(): DashboardBranding {
  return isBensonBranding ? bensonBranding : legacyBranding;
}
