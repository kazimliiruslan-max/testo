/**
 * Theme tokens for EasYum. Both light and dark palettes share the same shape.
 * The default `theme` export is the LIGHT theme — many existing StyleSheet.create
 * calls captured its values at module load. For dark mode we swap the mutable
 * `theme.colors` values in-place via `applyThemeMode()` AND force a full app
 * remount (see ThemeContext) so the module-level StyleSheets are recomputed.
 */

export type ThemeMode = 'light' | 'dark';

export const lightColors = {
  surface: '#FFFFFF',
  onSurface: '#1A1A1A',
  surfaceSecondary: '#F5F5F5',
  onSurfaceSecondary: '#4A4A4A',
  surfaceTertiary: '#EBEBEB',
  onSurfaceTertiary: '#7A7A7A',
  brand: '#2ECC71',
  brandSecondary: '#58D68D',
  brandTertiary: '#D5F5E3',
  brandDark: '#1E9E5C',
  onBrand: '#FFFFFF',
  accent: '#F1C40F',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  border: '#E5E5EA',
  borderStrong: '#C7C7CC',
  divider: '#F2F2F7',
  inverse: '#1A1A1A',
  onInverse: '#FFFFFF',
};

export const darkColors = {
  surface: '#101418',
  onSurface: '#F2F4F7',
  surfaceSecondary: '#1B1F24',
  onSurfaceSecondary: '#C7CBD1',
  surfaceTertiary: '#252A31',
  onSurfaceTertiary: '#8A8F98',
  brand: '#3EE07F',
  brandSecondary: '#65E8A0',
  brandTertiary: '#1B3626',
  brandDark: '#2ECC71',
  onBrand: '#0B0F13',
  accent: '#FFD93B',
  success: '#3EE07F',
  warning: '#FFAA33',
  error: '#FF6259',
  border: '#2C333B',
  borderStrong: '#3E4650',
  divider: '#1B1F24',
  inverse: '#F2F4F7',
  onInverse: '#0B0F13',
};

export const theme = {
  colors: { ...lightColors },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
};

let currentMode: ThemeMode = 'light';

/** Swap `theme.colors` in-place. Combine with a full app remount to refresh StyleSheets. */
export function applyThemeMode(mode: ThemeMode) {
  currentMode = mode;
  const palette = mode === 'dark' ? darkColors : lightColors;
  // Mutate keys of the existing object so live references (spread into
  // StyleSheets) update at least for newly-created sheets.
  Object.keys(theme.colors).forEach((k) => {
    (theme.colors as any)[k] = (palette as any)[k];
  });
}

export function getThemeMode(): ThemeMode { return currentMode; }
