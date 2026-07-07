import { asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { equipmentItems, equipmentReferenceVideos } from '../schema.js';
import { resolveEquipmentSlugs } from './search.js';

export type EquipmentReferenceVideoRecord = {
  id: string;
  slug: string;
  title: string;
  equipmentSlug: string | null;
  equipmentName: string | null;
  sourceChannel: string;
  referenceUrl: string;
  referenceKind: 'youtube' | 'web';
  youtubeVideoId: string | null;
  topicTags: string[];
  notes: string | null;
  priority: number;
  watchedByKellie: boolean;
  usefulForChecklist: boolean;
  usefulForTroubleshooting: boolean;
  usefulForTraining: boolean;
};

type ReferenceVideoSeed = {
  slug: string;
  title: string;
  equipmentSlug: string;
  sourceChannel: string;
  referenceUrl: string;
  referenceKind: 'youtube' | 'web';
  youtubeVideoId?: string | null;
  topicTags: string[];
  notes: string;
  priority: number;
  watchedByKellie?: boolean;
  usefulForChecklist?: boolean;
  usefulForTroubleshooting?: boolean;
  usefulForTraining?: boolean;
};

export const REFERENCE_VIDEO_SEEDS: ReferenceVideoSeed[] = [
  {
    slug: 'osmo-otto-julian-beginners-setup',
    title: 'DJI Osmo Mobile 8 TUTORIAL Guide for Beginners: How to Use and Setup',
    equipmentSlug: 'dji-osmo-mobile-8',
    sourceChannel: 'Otto Julian',
    referenceUrl: 'https://www.youtube.com/watch?v=6b44imrq0vQ',
    referenceKind: 'youtube',
    youtubeVideoId: '6b44imrq0vQ',
    topicTags: ['setup', 'beginner', 'dji mimo', 'multifunction module', 'tracking', 'gimbal modes', 'apple dockkit'],
    notes: 'Step-by-step OM8 setup, Mimo app, tracking module, trigger buttons, and gimbal modes. Practical walkthrough — verify button names against the official manual.',
    priority: 10,
    usefulForTraining: true,
    usefulForChecklist: true,
  },
  {
    slug: 'osmo-mountmedia-ultimate-beginners',
    title: "DJI Osmo Mobile 8 The Ultimate Beginner's Guide",
    equipmentSlug: 'dji-osmo-mobile-8',
    sourceChannel: 'MountMedia',
    referenceUrl: 'https://www.youtube.com/watch?v=e0m7i0qLC1A',
    referenceKind: 'youtube',
    youtubeVideoId: 'e0m7i0qLC1A',
    topicTags: ['beginner', 'setup', 'follow modes', 'activetrack', 'gesture control', 'multifunction module', 'dockkit'],
    notes: 'Deep beginner guide covering stabilization modes, tracking, gestures, fill light, and DockKit. Good for learning the full feature set.',
    priority: 15,
    usefulForTraining: true,
  },
  {
    slug: 'osmo-simon-horrocks-master-guide',
    title: 'Master your DJI Osmo Mobile 8 - BEST Full Guide & Tutorial',
    equipmentSlug: 'dji-osmo-mobile-8',
    sourceChannel: 'Simon Horrocks',
    referenceUrl: 'https://www.youtube.com/watch?v=k_JGvkA0WFg',
    referenceKind: 'youtube',
    youtubeVideoId: 'k_JGvkA0WFg',
    topicTags: ['full guide', 'mobile filmmaking', 'tracking', 'mimo', 'walking shots', 'low angle'],
    notes: 'Mobile-videography focused full OM8 guide from Simon Horrocks. Use for creative shooting moves and workflow tips.',
    priority: 12,
    usefulForTraining: true,
  },
  {
    slug: 'osmo-dji-official-tutorials',
    title: 'Official DJI Osmo Mobile 8 Tutorials',
    equipmentSlug: 'dji-osmo-mobile-8',
    sourceChannel: 'DJI',
    referenceUrl: 'https://www.dji.com/osmo-mobile-8/video',
    referenceKind: 'web',
    topicTags: ['official', 'first use', 'buttons', 'follow modes', 'activetrack', 'dockkit', 'multifunction module'],
    notes: 'Official DJI tutorial hub linked from the user manual. Short clips for first use, buttons, follow modes, ActiveTrack, DockKit, and the multifunction module.',
    priority: 5,
    usefulForTraining: true,
    usefulForChecklist: true,
    usefulForTroubleshooting: true,
  },
  {
    slug: 'lark-hollyland-all-in-one-button',
    title: 'LARK M2 TUTORIAL | All in One Button',
    equipmentSlug: 'hollyland-lark-m2',
    sourceChannel: 'Hollyland Technology',
    referenceUrl: 'https://www.youtube.com/watch?v=gaNfn0HGLy8',
    referenceKind: 'youtube',
    youtubeVideoId: 'gaNfn0HGLy8',
    topicTags: ['official', 'pairing', 'noise cancellation', 'tx', 'rx', 'plug and play', 'led indicators'],
    notes: 'Official Hollyland walkthrough of TX/RX pairing, LED states, noise cancellation toggle, and phone recording control.',
    priority: 5,
    usefulForTraining: true,
    usefulForTroubleshooting: true,
    usefulForChecklist: true,
  },
  {
    slug: 'lark-tech-on-how-to-use',
    title: 'HOLLYLAND LARK M2 HOW TO USE',
    equipmentSlug: 'hollyland-lark-m2',
    sourceChannel: 'Tech On Oficial',
    referenceUrl: 'https://www.youtube.com/watch?v=MChHHgS8-Ns',
    referenceKind: 'youtube',
    youtubeVideoId: 'MChHHgS8-Ns',
    topicTags: ['how to use', 'setup', 'pairing', 'mobile receiver', 'portuguese'],
    notes: 'Practical third-party setup demo (Portuguese). Good visual walkthrough for unboxing, pairing, and daily use.',
    priority: 25,
    usefulForTraining: true,
  },
  {
    slug: 'lark-iphone-pairing-connect',
    title: 'How to Pair Hollyland Lark M2 Microphones to an iPhone',
    equipmentSlug: 'hollyland-lark-m2',
    sourceChannel: 'Research Rocks',
    referenceUrl: 'https://www.youtube.com/watch?v=57g1CVwt0JY',
    referenceKind: 'youtube',
    youtubeVideoId: '57g1CVwt0JY',
    topicTags: ['iphone', 'pairing', 'usb-c', 'lightning', 'mobile receiver', 'connect'],
    notes: 'iPhone connection guide for Lightning and USB-C receivers. Covers plug-in pairing and manual re-pair if lights flash blue.',
    priority: 18,
    usefulForTraining: true,
    usefulForTroubleshooting: true,
    usefulForChecklist: true,
  },
  {
    slug: 'lark-noise-cancellation-toggle',
    title: 'How To Turn Noise Cancellation On / Off On Hollyland Lark M2 Wireless Microphone',
    equipmentSlug: 'hollyland-lark-m2',
    sourceChannel: 'WebPro Education',
    referenceUrl: 'https://www.youtube.com/watch?v=rC8aeMVsTZg',
    referenceKind: 'youtube',
    youtubeVideoId: 'rC8aeMVsTZg',
    topicTags: ['noise cancellation', 'enc', 'tx button', 'rx button', 'green light', 'restaurant'],
    notes: 'Short demo of toggling ENC on TX/RX (green = on, blue = off). Cross-check LED behavior with the LARK M2 manual.',
    priority: 20,
    usefulForTroubleshooting: true,
    usefulForTraining: true,
  },
];

function mapRow(
  row: typeof equipmentReferenceVideos.$inferSelect,
  item: { slug: string; name: string } | null | undefined,
): EquipmentReferenceVideoRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    equipmentSlug: item?.slug ?? null,
    equipmentName: item?.name ?? null,
    sourceChannel: row.sourceChannel,
    referenceUrl: row.referenceUrl,
    referenceKind: row.referenceKind as 'youtube' | 'web',
    youtubeVideoId: row.youtubeVideoId,
    topicTags: row.topicTags as string[],
    notes: row.notes,
    priority: row.priority,
    watchedByKellie: row.watchedByKellie,
    usefulForChecklist: row.usefulForChecklist,
    usefulForTroubleshooting: row.usefulForTroubleshooting,
    usefulForTraining: row.usefulForTraining,
  };
}

export async function listEquipmentReferenceVideos(options?: {
  equipmentSlug?: string | null;
}): Promise<EquipmentReferenceVideoRecord[]> {
  const rows = await db
    .select({
      video: equipmentReferenceVideos,
      item: equipmentItems,
    })
    .from(equipmentReferenceVideos)
    .leftJoin(equipmentItems, eq(equipmentReferenceVideos.equipmentId, equipmentItems.id))
    .orderBy(asc(equipmentReferenceVideos.priority), asc(equipmentReferenceVideos.title));

  const filtered = options?.equipmentSlug
    ? rows.filter(({ item }) => item?.slug === options.equipmentSlug)
    : rows;

  return filtered.map(({ video, item }) => mapRow(video, item));
}

export async function searchReferenceVideosForQuestion(input: {
  question: string;
  equipmentSlug?: string | null;
  mode?: 'general' | 'troubleshoot' | 'setup';
  limit?: number;
}): Promise<EquipmentReferenceVideoRecord[]> {
  const limit = input.limit ?? 4;
  const scopedSlugs = resolveEquipmentSlugs(input.question, input.equipmentSlug);
  const q = input.question.toLowerCase();

  const rows = await db
    .select({
      video: equipmentReferenceVideos,
      item: equipmentItems,
    })
    .from(equipmentReferenceVideos)
    .leftJoin(equipmentItems, eq(equipmentReferenceVideos.equipmentId, equipmentItems.id))
    .orderBy(asc(equipmentReferenceVideos.priority));

  const scored = rows
    .map(({ video, item }) => {
      let score = 100 - video.priority;
      if (scopedSlugs?.length && item && scopedSlugs.includes(item.slug)) score += 40;
      if (input.equipmentSlug && item?.slug === input.equipmentSlug) score += 30;

      const tags = video.topicTags as string[];
      for (const tag of tags) {
        const t = tag.toLowerCase();
        if (q.includes(t) || t.split(/\s+/).some((word) => word.length > 3 && q.includes(word))) {
          score += 12;
        }
      }

      if (input.mode === 'troubleshoot' && video.usefulForTroubleshooting) score += 15;
      if (input.mode === 'setup' && (video.usefulForChecklist || video.usefulForTraining)) score += 12;
      if (input.mode === 'general' && video.usefulForTraining) score += 5;

      return { video, item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ video, item }) => mapRow(video, item));
}

export async function seedEquipmentReferenceVideos(): Promise<{ inserted: number; updated: number }> {
  const items = await db.query.equipmentItems.findMany();
  const bySlug = new Map(items.map((i) => [i.slug, i.id]));

  let inserted = 0;
  let updated = 0;

  for (const seed of REFERENCE_VIDEO_SEEDS) {
    const equipmentId = bySlug.get(seed.equipmentSlug) ?? null;
    const existing = await db.query.equipmentReferenceVideos.findFirst({
      where: eq(equipmentReferenceVideos.slug, seed.slug),
    });

    const values = {
      title: seed.title,
      equipmentId,
      sourceChannel: seed.sourceChannel,
      referenceUrl: seed.referenceUrl,
      referenceKind: seed.referenceKind,
      youtubeVideoId: seed.youtubeVideoId ?? null,
      topicTags: seed.topicTags,
      notes: seed.notes,
      priority: seed.priority,
      watchedByKellie: seed.watchedByKellie ?? false,
      usefulForChecklist: seed.usefulForChecklist ?? false,
      usefulForTroubleshooting: seed.usefulForTroubleshooting ?? false,
      usefulForTraining: seed.usefulForTraining ?? false,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(equipmentReferenceVideos)
        .set(values)
        .where(eq(equipmentReferenceVideos.slug, seed.slug));
      updated += 1;
    } else {
      await db.insert(equipmentReferenceVideos).values({ slug: seed.slug, ...values });
      inserted += 1;
    }
  }

  return { inserted, updated };
}

export async function markReferenceVideoWatched(
  slug: string,
  watched: boolean,
): Promise<EquipmentReferenceVideoRecord | null> {
  const [row] = await db
    .update(equipmentReferenceVideos)
    .set({ watchedByKellie: watched, updatedAt: new Date() })
    .where(eq(equipmentReferenceVideos.slug, slug))
    .returning();

  if (!row) return null;
  const item = row.equipmentId
    ? await db.query.equipmentItems.findFirst({ where: eq(equipmentItems.id, row.equipmentId) })
    : null;
  return mapRow(row, item);
}

export function formatReferenceVideosForPrompt(videos: EquipmentReferenceVideoRecord[]): string {
  if (videos.length === 0) return '(No reference videos matched this question.)';
  return videos
    .map((v, i) => {
      const useful = [
        v.usefulForChecklist ? 'checklist' : null,
        v.usefulForTroubleshooting ? 'troubleshooting' : null,
        v.usefulForTraining ? 'training' : null,
      ]
        .filter(Boolean)
        .join(', ');
      return `[${i + 1}] ${v.equipmentName ?? 'Gear'} — ${v.title} (${v.sourceChannel})
URL: ${v.referenceUrl}
Tags: ${v.topicTags.join(', ')}${useful ? ` · Useful for: ${useful}` : ''}${v.notes ? `\nNote: ${v.notes}` : ''}`;
    })
    .join('\n\n');
}
