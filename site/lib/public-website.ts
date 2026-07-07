export type PublicWebsiteItem = {
  id: string;
  sectionId: string;
  caption: string | null;
  altText: string | null;
  headline: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  sortOrder: number;
  publishedAt: string;
  media: {
    kind: 'image' | 'video';
    url: string | null;
    thumbnailUrl: string | null;
    mimeType: string | null;
  } | null;
};

export type PublicWebsiteSection = {
  id: string;
  label: string;
  description: string | null;
  sectionType: string;
  sortOrder: number;
  items: PublicWebsiteItem[];
};

export type PublicWebsitePayload = {
  generatedAt: string;
  settings: {
    siteTitle: string;
    siteTagline: string | null;
    heroHeadline: string | null;
    heroSubheadline: string | null;
    contactEmail: string | null;
    bookingHref: string | null;
    mediaKitHref: string | null;
  };
  sections: PublicWebsiteSection[];
};

export function publicApiBase(): string {
  return (
    process.env.PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
}

export async function fetchPublicWebsite(): Promise<PublicWebsitePayload> {
  const res = await fetch(`${publicApiBase()}/api/public/website`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Public website API ${res.status}`);
  const data = (await res.json()) as { ok: boolean } & PublicWebsitePayload;
  return data;
}

export function sectionById(
  sections: PublicWebsiteSection[],
  id: string,
): PublicWebsiteSection | undefined {
  return sections.find((s) => s.id === id);
}
