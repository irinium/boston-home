/**
 * "A woman is a shelter for a woman" (zhinka zhintsi prytulok): a warm, calm, safe palette: warm beige, muted sage, terracotta accent.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2F2A26',
    textSecondary: '#6E655D',
    background: '#FAF6F0',
    backgroundElement: '#F1E9DE',
    backgroundSelected: '#E6DACA',
    accent: '#C4714F',
    onAccent: '#FFFFFF',
    sage: '#8FA58C',
    border: '#E2D6C6',
    danger: '#B3261E',
  },
  dark: {
    text: '#F3ECE4',
    textSecondary: '#BDB2A6',
    background: '#1E1B18',
    backgroundElement: '#2A2622',
    backgroundSelected: '#3A342E',
    accent: '#E0906E',
    onAccent: '#1E1B18',
    sage: '#A7BCA3',
    border: '#3A342E',
    danger: '#F2B8B5',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 10, medium: 16, large: 24 } as const;

export const MaxContentWidth = 800;
