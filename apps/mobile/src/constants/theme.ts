/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#25231F',
    background: '#F8F5EE',
    backgroundElement: '#EFE9DC',
    backgroundSelected: '#E2EBDD',
    textSecondary: '#6D695F',
    primary: '#42624C',
    primarySoft: '#DCE8DD',
    accent: '#AE5744',
    border: '#E1DACD',
    card: '#FFFCF6',
    warning: '#9A6A2F',
    inverse: '#FFFFFF',
    overlay: 'rgba(37, 35, 31, 0.08)',
  },
  dark: {
    text: '#F6F1E8',
    background: '#171815',
    backgroundElement: '#272923',
    backgroundSelected: '#334438',
    textSecondary: '#B9B3A8',
    primary: '#9FC1A7',
    primarySoft: '#2E4033',
    accent: '#D8836C',
    border: '#393A34',
    card: '#20211E',
    warning: '#D5A360',
    inverse: '#171815',
    overlay: 'rgba(0, 0, 0, 0.28)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
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

export const Radius = {
  small: 12,
  medium: 18,
  large: 24,
  xlarge: 30,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: 88 }) ?? 0;
export const MaxContentWidth = 800;
