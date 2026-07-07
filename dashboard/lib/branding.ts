import 'server-only';

import { featureFlags } from './feature-flags.server';

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
  metadataTitle: 'Benson',
  metadataDescription: "Benson — Kellie's KC creator studio",
  footerCommand: 'Benson · Kansas City creator studio',
  footerLinkLabel: 'Kellie Assistant',
  footerLinkHref: 'https://github.com/anthonyonazure/social-agent',
  overviewGreeting: 'Good morning, Kellie.',
  overviewSubline: 'What to film, who to pitch, and what to do next.',
};

export function getBranding(): DashboardBranding {
  return isBensonBranding ? bensonBranding : legacyBranding;
}
