import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: {
    figma: '#3b82f6', illustrator: '#f97316', capcut: '#22d3ee', premiere: '#a855f7',
    ink: '#07090f', panel: '#0d111b',
  } } },
  plugins: [],
} satisfies Config;
