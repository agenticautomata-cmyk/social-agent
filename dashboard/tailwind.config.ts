import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Remapped from "paper" tokens — keeps existing class names, new look.
        paper: {
          DEFAULT: '#07070d',
          tint: 'rgba(255,255,255,0.04)',
          edge: 'rgba(255,255,255,0.1)',
          ink: '#f8fafc',
          muted: '#94a3b8',
          dim: '#64748b',
        },
        ink: {
          DEFAULT: '#f8fafc',
          soft: '#e2e8f0',
          muted: '#94a3b8',
          dim: '#64748b',
        },
        accent: {
          DEFAULT: '#c084fc',
          soft: '#e879f9',
          tint: 'rgba(192,132,252,0.14)',
        },
        glow: {
          violet: '#8b5cf6',
          pink: '#ec4899',
          cyan: '#22d3ee',
        },
        signal: {
          warn: '#fbbf24',
          warn_tint: 'rgba(251,191,36,0.12)',
          alert: '#f87171',
          alert_tint: 'rgba(248,113,113,0.12)',
          rest: '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['var(--font-display)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '24px' }],
        lg: ['17px', { lineHeight: '26px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['32px', { lineHeight: '38px' }],
        '4xl': ['40px', { lineHeight: '44px' }],
        '5xl': ['56px', { lineHeight: '56px' }],
        '6xl': ['72px', { lineHeight: '72px' }],
      },
      letterSpacing: {
        tightest: '-0.03em',
        tighter: '-0.02em',
      },
      borderRadius: {
        none: '0',
        sm: '0.5rem',
        DEFAULT: '0.75rem',
        md: '0.875rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        glow: '0 0 40px rgba(139,92,246,0.25)',
        card: '0 8px 32px rgba(0,0,0,0.35)',
      },
      backgroundImage: {
        'studio-gradient':
          'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139,92,246,0.35), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(236,72,153,0.18), transparent), radial-gradient(ellipse 50% 30% at 0% 100%, rgba(34,211,238,0.12), transparent)',
      },
      animation: {
        'pulse-slow': 'pulse-slow 8s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
