'use client';

import { useEffect } from 'react';

const STUDIO_UI_VERSION = '2026-07-07-home-pulse-mobile-v1';
const VERSION_KEY = 'benson-studio-ui-version';

/** Reload once when the studio UI bundle version changes (PWA cache bust). */
export function StudioUiFreshness() {
  useEffect(() => {
    try {
      const seen = localStorage.getItem(VERSION_KEY);
      if (seen !== STUDIO_UI_VERSION) {
        localStorage.setItem(VERSION_KEY, STUDIO_UI_VERSION);
        window.location.reload();
      }
    } catch {
      /* ignore */
    }
  }, []);

  return null;
}
