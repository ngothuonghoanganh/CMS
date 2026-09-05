'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type CmsThemePreference = 'dark' | 'light' | 'system';

const themeStorageKey = 'cms.theme.preference';
const CmsThemeContext = createContext<{
  preference: CmsThemePreference;
  setPreference: (preference: CmsThemePreference) => void;
}>({
  preference: 'dark',
  setPreference: () => undefined,
});

function isThemePreference(value: string | null): value is CmsThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

function applyTheme(preference: CmsThemePreference) {
  const root = document.documentElement;
  root.dataset.cmsTheme = preference;
  if (preference === 'system') root.style.removeProperty('color-scheme');
  else root.style.colorScheme = preference;
}

export function CmsThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<CmsThemePreference>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (isThemePreference(stored)) {
      setPreferenceState(stored);
      applyTheme(stored);
    }
  }, []);

  useEffect(() => {
    applyTheme(preference);
    window.localStorage.setItem(themeStorageKey, preference);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      setPreference: (next: CmsThemePreference) => setPreferenceState(next),
    }),
    [preference],
  );

  return <CmsThemeContext.Provider value={value}>{children}</CmsThemeContext.Provider>;
}

export function useCmsTheme() {
  return useContext(CmsThemeContext);
}

export function ThemeSwitcher() {
  const { preference, setPreference } = useCmsTheme();
  return (
    <label className="theme-switcher">
      <span className="sr-only">Appearance</span>
      <select
        aria-label="Appearance"
        className="theme-switcher-control"
        onChange={(event) => setPreference(event.target.value as CmsThemePreference)}
        value={preference}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
