import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import { getBranding } from '../lib/branding';
import { getNavGroups, getNavItems, isOpportunitiesUiEnabled } from '../lib/opportunities-ui';
import { getRuntimeStatus } from '../lib/runtime-status.server';
import { PreAlphaStatusBanner } from '../components/pre-alpha-status-banner';
import { LegacyTopNav, StudioMobileNav, StudioSidebar } from '../components/studio-nav';
import { StudioBreadcrumb, StudioQuickLinks } from '../components/studio-header';
import { PreAlphaFeedbackFooter } from '../components/pre-alpha-shell';
import { AskBensonShell } from '../components/ask-benson-shell';
import { BensonAmbience } from '../components/benson-ambience';
import { StudioUiFreshness } from '../components/studio-ui-freshness';
import { StudioUpdateAnnouncement } from '../components/studio-update-announcement';
import { MilestoneCelebrationShell } from '../components/milestone-celebration';
import { PushPermissionPromptShell } from '../components/push-permission-prompt';
import { PushServiceWorkerRegistrar } from '../components/push-service-worker-registrar';
import { BensonStudioProvider } from '../lib/benson-studio-context';
import { BensonDataRefreshProvider } from '../lib/benson-data-refresh';

export async function generateMetadata(): Promise<Metadata> {
  const branding = getBranding();
  const base: Metadata = {
    title: branding.metadataTitle,
    description: branding.metadataDescription,
    applicationName: branding.productName,
    manifest: '/manifest.webmanifest',
    icons: {
      icon: '/favicon.ico',
      apple: '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      title: branding.productName,
      statusBarStyle: 'black-translucent',
    },
    formatDetection: { telephone: false },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  };

  if (branding.productName === 'Benson') {
    return {
      ...base,
      openGraph: {
        title: 'Benson',
        description: branding.metadataDescription,
        images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Benson' }],
      },
      twitter: {
        card: 'summary',
        title: 'Benson',
        description: branding.metadataDescription,
        images: ['/icons/icon-512.png'],
      },
    };
  }

  return base;
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07070d',
};

function AppChrome({
  children,
  branding,
  navGroups,
  navItems,
  bensonMode,
  showPreAlphaBanner,
}: {
  children: React.ReactNode;
  branding: ReturnType<typeof getBranding>;
  navGroups: ReturnType<typeof getNavGroups>;
  navItems: ReturnType<typeof getNavItems>;
  bensonMode: boolean;
  showPreAlphaBanner: boolean;
}) {
  return (
    <div className="relative z-10 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden lg:min-h-screen lg:h-auto lg:max-h-none lg:overflow-visible lg:flex-row">
      {bensonMode && <StudioSidebar groups={navGroups} />}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-h-screen lg:overflow-visible">
        {bensonMode && showPreAlphaBanner && <PreAlphaStatusBanner />}
        {bensonMode && <StudioUpdateAnnouncement />}

        <header className="sticky top-0 z-40 shrink-0 border-b border-white/10 bg-black/40 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 md:px-6 lg:px-8">
            <Link
              href={bensonMode ? '/home' : '/'}
              className="flex shrink-0 items-center gap-2.5 font-bold tracking-tight transition hover:opacity-90"
            >
              {branding.productName === 'Benson' ? (
                <>
                  <Image
                    src="/icons/benson-logo.png"
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-xl object-contain ring-1 ring-white/10"
                    priority
                  />
                  <span className="hidden sm:inline text-lg gradient-text">Benson</span>
                </>
              ) : (
                <span className="text-lg">{branding.productName}</span>
              )}
            </Link>

            {bensonMode ? (
              <>
                <div className="min-w-0 flex-1 hidden sm:block">
                  <StudioBreadcrumb groups={navGroups} />
                </div>
                <StudioQuickLinks />
              </>
            ) : (
              <div className="ml-auto">
                <LegacyTopNav items={navItems} />
              </div>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:contents">
          <main className="studio-main-scroll mx-auto w-full min-w-0 max-w-[1200px] flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-6 pb-[calc(var(--studio-tab-bar-height)+1.5rem)] md:px-6 md:py-8 lg:flex-none lg:overflow-visible lg:pb-10 lg:px-8">
            {children}
            {bensonMode && <PreAlphaFeedbackFooter />}
          </main>

          <footer className="mt-auto hidden border-t border-white/10 bg-black/20 lg:block">
            <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-2 px-4 py-4 text-xs text-paper-muted sm:flex-row md:px-6 lg:px-8">
              <span>{branding.footerCommand}</span>
              <a href={branding.footerLinkHref} className="link">
                {branding.footerLinkLabel}
              </a>
            </div>
          </footer>
        </div>

        {bensonMode && (
          <>
            <StudioMobileNav groups={navGroups} />
            <AskBensonShell />
          </>
        )}
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = getBranding();
  const navGroups = getNavGroups();
  const navItems = getNavItems();
  const runtime = getRuntimeStatus();
  const bensonMode = isOpportunitiesUiEnabled;

  return (
    <html lang="en">
      <body className="font-sans antialiased h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col bg-paper text-paper-ink relative lg:min-h-screen lg:h-auto lg:max-h-none lg:overflow-visible">
        {bensonMode ? (
          <BensonStudioProvider>
            <BensonDataRefreshProvider>
            <StudioUiFreshness />
            <BensonAmbience />
            <AppChrome
              branding={branding}
              navGroups={navGroups}
              navItems={navItems}
              bensonMode={bensonMode}
              showPreAlphaBanner={runtime.showPreAlphaBanner}
            >
              {children}
            </AppChrome>
            <MilestoneCelebrationShell />
            <PushServiceWorkerRegistrar />
            <PushPermissionPromptShell />
            </BensonDataRefreshProvider>
          </BensonStudioProvider>
        ) : (
          <AppChrome
            branding={branding}
            navGroups={navGroups}
            navItems={navItems}
            bensonMode={bensonMode}
            showPreAlphaBanner={runtime.showPreAlphaBanner}
          >
            {children}
          </AppChrome>
        )}
      </body>
    </html>
  );
}
