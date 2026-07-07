'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BensonDancer } from './benson-dancer';
import { clientApiUrl } from '../lib/client-api';
import {
  FOLLOWERS_5000_GIF_LIST,
  FOLLOWERS_5000_HEADLINE,
  FOLLOWERS_5000_MESSAGE,
  MILESTONE_CONFETTI,
} from '../lib/milestone-celebration-content';

type CelebrationData = {
  id: string;
  followerCount: number;
  headline: string;
  message: string;
  gifs?: string[];
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

const COLORS = ['#c084fc', '#ec4899', '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#ffffff'];

function spawnFirework(width: number, height: number, particles: Particle[]) {
  const x = width * (0.15 + Math.random() * 0.7);
  const y = height * (0.15 + Math.random() * 0.35);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]!;
  const count = 40 + Math.floor(Math.random() * 30);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

function FireworksCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let raf = 0;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      frame += 1;
      ctx.fillStyle = 'rgba(7, 7, 13, 0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (frame % 14 === 0) spawnFirework(canvas.width, canvas.height, particles);
      if (frame % 22 === 7) spawnFirework(canvas.width, canvas.height, particles);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045;
        p.life -= 0.012;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[100] opacity-90"
      aria-hidden
    />
  );
}

function ConfettiRain() {
  const pieces = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    emoji: MILESTONE_CONFETTI[i % MILESTONE_CONFETTI.length],
    left: `${(i * 17) % 100}%`,
    delay: `${(i * 0.35) % 4}s`,
    duration: `${4 + (i % 5)}s`,
  }));

  return (
    <div className="pointer-events-none fixed inset-0 z-[98] overflow-hidden" aria-hidden>
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="milestone-confetti-piece absolute text-2xl sm:text-3xl"
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
          }}
        >
          {piece.emoji}
        </span>
      ))}
    </div>
  );
}

function CelebrationGifs({ gifs }: { gifs: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % gifs.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [gifs.length]);

  return (
    <div className="relative mx-auto w-full max-w-xs">
      <div className="milestone-gif-glow absolute -inset-3 rounded-2xl bg-gradient-to-r from-purple-500/40 via-pink-500/40 to-amber-400/40 blur-xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-black/40 shadow-2xl">
        {gifs.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden={index !== activeIndex}
            className={`h-40 w-full object-cover transition-opacity duration-700 ${
              index === activeIndex ? 'opacity-100' : 'absolute inset-0 opacity-0'
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {gifs.map((src, index) => (
          <span
            key={`dot-${src}`}
            className={`h-1.5 w-1.5 rounded-full transition-all ${
              index === activeIndex ? 'w-4 bg-purple-400' : 'bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function MilestoneCelebrationOverlay({
  celebration,
  onDismiss,
}: {
  celebration: CelebrationData;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const gifs = celebration.gifs?.length ? celebration.gifs : [...FOLLOWERS_5000_GIF_LIST];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    window.dispatchEvent(new CustomEvent('benson-celebration', { detail: { open: true } }));
    return () => {
      document.body.style.overflow = '';
      window.dispatchEvent(new CustomEvent('benson-celebration', { detail: { open: false } }));
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    onDismiss();
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[99] flex items-center justify-center p-4">
      <FireworksCanvas active />
      <ConfettiRain />
      <button
        type="button"
        aria-label="Dismiss celebration"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={dismiss}
      />
      <div
        className="milestone-celebration-card relative z-[101] w-full max-w-lg glass-panel-strong gradient-border p-6 sm:p-8 text-center space-y-5"
        role="dialog"
        aria-labelledby="milestone-headline"
      >
        <div className="flex justify-center">
          <BensonDancer size={64} variant="compact" forceDance />
        </div>

        <CelebrationGifs gifs={gifs} />

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-purple-300/90">
            Milestone unlocked
          </p>
          <h2 id="milestone-headline" className="milestone-headline-pulse text-3xl sm:text-4xl font-bold gradient-text">
            {celebration.headline}
          </h2>
          <p className="text-5xl sm:text-6xl font-bold stat-mono text-paper-ink tabular-nums milestone-count-pop">
            {celebration.followerCount.toLocaleString()}
          </p>
        </div>

        <p className="text-sm leading-relaxed text-paper-soft">{celebration.message}</p>
        <p className="text-xs text-paper-muted italic">
          Benson saved this one. Kansas City creator studio — the whole city showed up.
        </p>
        <button type="button" onClick={dismiss} className="btn-primary w-full text-base py-3">
          Let&apos;s go 🎉
        </button>
      </div>
    </div>
  );
}

export function MilestoneCelebrationShell() {
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramCelebrate = params.get('celebrate');

    async function loadPending() {
      try {
        const res = await fetch(clientApiUrl('/api/push/celebration/pending'), {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { celebration: CelebrationData | null };
        if (json.celebration) {
          setCelebration(json.celebration);
        }
      } catch {
        /* optional */
      }
    }

    if (paramCelebrate === 'followers-5000') {
      setCelebration({
        id: 'followers_5000',
        followerCount: 5000,
        headline: FOLLOWERS_5000_HEADLINE,
        message: FOLLOWERS_5000_MESSAGE,
        gifs: [...FOLLOWERS_5000_GIF_LIST],
      });
      const url = new URL(window.location.href);
      url.searchParams.delete('celebrate');
      window.history.replaceState({}, '', url.pathname + url.search);
    } else {
      void loadPending();
    }
  }, []);

  if (!celebration) return null;

  return (
    <MilestoneCelebrationOverlay
      celebration={celebration}
      onDismiss={() => {
        void fetch(clientApiUrl('/api/push/celebration/ack'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestone: celebration.id }),
        }).catch(() => {});
        setCelebration(null);
      }}
    />
  );
}
