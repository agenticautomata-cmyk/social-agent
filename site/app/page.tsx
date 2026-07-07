import { CtaBlock, MediaCard } from '@/components/sections';
import { fetchPublicWebsite, sectionById } from '@/lib/public-website';

export const revalidate = 60;

export default async function HomePage() {
  let payload;
  try {
    payload = await fetchPublicWebsite();
  } catch {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-semibold">KC Kellie</h1>
        <p className="mt-3 text-stone-600">Site content is updating — check back soon.</p>
      </main>
    );
  }

  const { settings, sections } = payload;
  const hero = sectionById(sections, 'homepage_hero')?.items[0];
  const featured = sectionById(sections, 'featured_content')?.items ?? [];
  const latest = sectionById(sections, 'latest_posts')?.items ?? [];
  const kcFinds = sectionById(sections, 'kc_finds')?.items ?? [];
  const sponsors = sectionById(sections, 'sponsor_highlights')?.items ?? [];
  const mediaKit = sectionById(sections, 'media_kit_cta')?.items[0];
  const contact = sectionById(sections, 'contact_cta')?.items[0];

  const heroImage = hero?.media?.thumbnailUrl ?? hero?.media?.url;
  const heroHeadline = hero?.headline ?? settings.heroHeadline ?? settings.siteTitle;
  const heroSub = hero?.caption ?? settings.heroSubheadline ?? settings.siteTagline;

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">{settings.siteTitle}</p>
            {settings.siteTagline ? (
              <p className="text-sm text-stone-500">{settings.siteTagline}</p>
            ) : null}
          </div>
          {settings.bookingHref ? (
            <a
              href={settings.bookingHref}
              className="hidden rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white sm:inline-block"
            >
              Book Kellie
            </a>
          ) : null}
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-stone-900 text-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-2 md:items-center md:py-24">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-rose-300">Kansas City creator</p>
              <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-5xl">
                {heroHeadline}
              </h1>
              {heroSub ? <p className="mt-4 max-w-lg text-lg text-stone-300">{heroSub}</p> : null}
              {(hero?.ctaLabel && hero.ctaHref) || settings.bookingHref ? (
                <a
                  href={hero?.ctaHref ?? settings.bookingHref ?? '#'}
                  className="mt-8 inline-block rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold hover:bg-rose-400"
                >
                  {hero?.ctaLabel ?? 'Get in touch'}
                </a>
              ) : null}
            </div>
            {heroImage ? (
              <div className="overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroImage}
                  alt={hero?.altText ?? heroHeadline ?? settings.siteTitle}
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            ) : null}
          </div>
        </section>

        {featured.length > 0 ? (
          <Section title="Featured" subtitle="Highlights from Kellie's world">
            <Grid items={featured} />
          </Section>
        ) : null}

        {latest.length > 0 ? (
          <Section title="Latest" subtitle="Fresh content">
            <Grid items={latest} />
          </Section>
        ) : null}

        {kcFinds.length > 0 ? (
          <Section title="KC finds" subtitle="Local gems around Kansas City">
            <Grid items={kcFinds} />
          </Section>
        ) : null}

        {sponsors.length > 0 ? (
          <Section title="Sponsor highlights" subtitle="Brand partnerships">
            <Grid items={sponsors} columns="2" />
          </Section>
        ) : null}

        <section className="mx-auto max-w-6xl space-y-8 px-6 py-16">
          <CtaBlock
            headline={mediaKit?.headline ?? 'Work with Kellie'}
            caption={
              mediaKit?.caption ??
              'Download the media kit for rates, audience stats, and partnership options.'
            }
            ctaLabel={mediaKit?.ctaLabel ?? 'Media kit'}
            ctaHref={mediaKit?.ctaHref ?? settings.mediaKitHref ?? '#'}
          />
          <CtaBlock
            headline={contact?.headline ?? 'Book Kellie'}
            caption={
              contact?.caption ??
              settings.contactEmail ??
              'Collabs, events, and sponsored content across Kansas City.'
            }
            ctaLabel={contact?.ctaLabel ?? 'Contact'}
            ctaHref={
              contact?.ctaHref ??
              (settings.contactEmail ? `mailto:${settings.contactEmail}` : settings.bookingHref ?? '#')
            }
          />
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white py-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} {settings.siteTitle}
      </footer>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="mb-8">
        <h2 className="font-display text-3xl font-semibold">{title}</h2>
        <p className="mt-1 text-stone-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Grid({
  items,
  columns = '3',
}: {
  items: import('@/lib/public-website').PublicWebsiteItem[];
  columns?: '2' | '3';
}) {
  const cols = columns === '2' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';
  return (
    <div className={`grid gap-6 ${cols}`}>
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}
