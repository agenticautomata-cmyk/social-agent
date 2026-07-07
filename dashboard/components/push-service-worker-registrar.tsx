'use client';

import { useEffect } from 'react';
import { ensureServiceWorkerRegistered, isStandalonePwa, isPushSupported } from '../lib/push-subscribe';

/** Pre-register SW when Benson runs as an installed PWA so iOS push subscribe is ready. */
export function PushServiceWorkerRegistrar() {
  useEffect(() => {
    if (!isPushSupported() || !isStandalonePwa()) return;
    void ensureServiceWorkerRegistered();
  }, []);

  return null;
}
