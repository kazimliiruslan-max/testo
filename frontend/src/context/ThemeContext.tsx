import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { applyThemeMode, lightColors, darkColors, ThemeMode } from '@/src/theme';

interface ThemeCtx {
  mode: ThemeMode;
  colors: typeof lightColors;
  setMode: (m: ThemeMode | 'system') => void;
  preference: 'light' | 'dark' | 'system';
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'easyum.themePref';

/**
 * Provides theme mode (light/dark) with three preferences: 'light', 'dark', 'system'.
 * The provider mutates the theme.colors object in-place AND forces its children
 * to re-mount via a key change, which is enough to refresh StyleSheet.create
 * snapshots that captured light-theme values at module load time.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<'light' | 'dark' | 'system'>('system');
  const [systemMode, setSystemMode] = useState<ThemeMode>(
    (Appearance.getColorScheme() as ThemeMode) || 'light',
  );

  // Load persisted preference
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (v === 'light' || v === 'dark' || v === 'system') setPreference(v);
      } catch {}
    })();
  }, []);

  // Watch system appearance changes
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemMode((colorScheme as ThemeMode) || 'light');
    });
    return () => sub.remove();
  }, []);

  const mode: ThemeMode = preference === 'system' ? systemMode : preference;

  // Apply the mode to the shared `theme` object
  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode | 'system') => {
    setPreference(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const colors = useMemo(() => (mode === 'dark' ? darkColors : lightColors), [mode]);

  return (
    <Ctx.Provider value={{ mode, colors, setMode, preference }}>
      {/* key remounts children when mode changes so StyleSheet snapshots refresh */}
      <React.Fragment key={mode}>{children}</React.Fragment>
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be inside ThemeProvider');
  return v;
}
