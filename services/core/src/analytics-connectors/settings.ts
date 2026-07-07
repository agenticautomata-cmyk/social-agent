import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { analyticsConnectors } from '../schema.js';
import {
  ANALYTICS_CONNECTOR_PROVIDERS,
  type AnalyticsConnectorProvider,
} from './constants.js';

export type AnalyticsConnectorSettings = {
  tiktok: { enabled: boolean };
  facebook: { enabled: boolean };
  instagram: { enabled: boolean };
  youtube: { enabled: boolean };
};

const TOGGLEABLE: AnalyticsConnectorProvider[] = ['facebook', 'instagram', 'youtube'];

export async function ensureConnectorSettingsRows(): Promise<void> {
  for (const provider of ANALYTICS_CONNECTOR_PROVIDERS) {
    await db
      .insert(analyticsConnectors)
      .values({ provider })
      .onConflictDoNothing();
  }
}

export async function getAnalyticsConnectorSettings(): Promise<AnalyticsConnectorSettings> {
  await ensureConnectorSettingsRows();
  const rows = await db.select().from(analyticsConnectors);
  const byProvider = new Map(rows.map((r) => [r.provider, r.enabled]));

  return {
    tiktok: { enabled: byProvider.get('tiktok') ?? true },
    facebook: { enabled: byProvider.get('facebook') ?? false },
    instagram: { enabled: byProvider.get('instagram') ?? false },
    youtube: { enabled: byProvider.get('youtube') ?? false },
  };
}

export async function isConnectorEnabled(provider: AnalyticsConnectorProvider): Promise<boolean> {
  const settings = await getAnalyticsConnectorSettings();
  return settings[provider]?.enabled ?? true;
}

export async function setConnectorEnabled(
  provider: AnalyticsConnectorProvider,
  enabled: boolean,
): Promise<AnalyticsConnectorSettings> {
  if (!TOGGLEABLE.includes(provider)) {
    throw new Error(`Connector ${provider} cannot be toggled from settings`);
  }

  await ensureConnectorSettingsRows();
  await db
    .update(analyticsConnectors)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(analyticsConnectors.provider, provider));

  return getAnalyticsConnectorSettings();
}

export async function updateAnalyticsConnectorSettings(patch: {
  facebook?: boolean;
  instagram?: boolean;
  youtube?: boolean;
}): Promise<AnalyticsConnectorSettings> {
  if (patch.facebook !== undefined) {
    await setConnectorEnabled('facebook', patch.facebook);
  }
  if (patch.instagram !== undefined) {
    await setConnectorEnabled('instagram', patch.instagram);
  }
  if (patch.youtube !== undefined) {
    await setConnectorEnabled('youtube', patch.youtube);
  }
  return getAnalyticsConnectorSettings();
}

export async function listEnabledProviders(
  providers: AnalyticsConnectorProvider[],
): Promise<AnalyticsConnectorProvider[]> {
  const settings = await getAnalyticsConnectorSettings();
  return providers.filter((p) => settings[p]?.enabled ?? true);
}
