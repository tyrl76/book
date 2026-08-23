/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemeSelection } from '@/features/theme/theme-provider';

export function useTheme() {
  const { resolvedScheme } = useThemeSelection();
  return Colors[resolvedScheme];
}
