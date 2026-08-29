'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Theme state, stored per browser.
 *
 * Three values, not two: "system" is a real choice that keeps following the OS,
 * which is different from having picked light or dark and pinned it.
 *
 * The resolved theme is applied as a `.dark` class on <html>, matching the
 * `@custom-variant dark (&:is(.dark *))` in globals.css. Everything — app
 * tokens and chart tokens alike — hangs off that one class.
 */

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'wallet-theme';

interface ThemeContextValue {
  /** What the user chose. */
  theme: Theme;
  /** What that actually resolves to right now. */
  resolved: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: Theme): 'light' | 'dark' {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts as 'system' on the server; the inline script has already applied the
  // stored value to <html>, so the paint is correct before React hydrates.
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let stored: Theme | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    } catch {
      // Private mode, or site data blocked. Fall through to system.
    }
    const initial: Theme = stored === 'light' || stored === 'dark' ? stored : 'system';
    setThemeState(initial);
    setResolved(applyTheme(initial));
  }, []);

  // Keep following the OS while the choice is "system".
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolved(applyTheme(next));
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Non-fatal: the theme still applies for this page view.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return ctx;
}

/**
 * Runs before first paint, so a dark-mode user never sees a white flash.
 * Inlined in <head> deliberately — anything deferred is already too late.
 */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored === 'dark' ||
      (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;
