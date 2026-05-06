import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paper aesthetic — cream base, hard ink, single deep accent.
        paper: {
          DEFAULT: '#f5f1e8',     // page bg — cream
          tint:    '#efe9da',     // sidebars / alt rows
          edge:    '#d6cdb8',     // soft border
          ink:     '#0a0a0a',     // primary text + hard borders
          muted:   '#737373',     // secondary text
          dim:     '#a8a29e',     // tertiary
        },
        ink: {
          DEFAULT: '#0a0a0a',
          soft:    '#262626',
          muted:   '#737373',
          dim:     '#a8a29e',
        },
        // Accent — deep emerald, bookish
        accent: {
          DEFAULT: '#166534',
          soft:    '#22863a',
          tint:    '#dcfce7',
        },
        signal: {
          warn:  '#a16207',  // mustard / awaiting
          warn_tint: '#fef3c7',
          alert: '#991b1b',  // oxblood / failed
          alert_tint: '#fee2e2',
          rest:  '#737373',  // neutral / scheduled
        },
      },
      fontFamily: {
        // Mono everywhere — JetBrains Mono primary, system fallback
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Numbers in lining tabular figures already via JetBrains Mono
      },
      fontSize: {
        // Tighter scale — denser, more info per screen
        '2xs': ['10px', { lineHeight: '14px' }],
        xs:    ['11px', { lineHeight: '16px' }],
        sm:    ['12px', { lineHeight: '18px' }],
        base:  ['13px', { lineHeight: '20px' }],
        lg:    ['15px', { lineHeight: '22px' }],
        xl:    ['18px', { lineHeight: '24px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['28px', { lineHeight: '32px' }],
        '4xl': ['38px', { lineHeight: '40px' }],
        '5xl': ['56px', { lineHeight: '56px' }],
        '6xl': ['72px', { lineHeight: '72px' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.02em',
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
