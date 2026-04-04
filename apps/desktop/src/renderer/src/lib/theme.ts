import type { AppearanceTheme } from '@unemployed/contracts'

export const STORAGE_KEY = 'unemployed.appearance-theme'
export const DARK_QUERY = '(prefers-color-scheme: dark)'

export type ResolvedTheme = 'dark' | 'light'

export function readStoredAppearanceTheme(): AppearanceTheme | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storedValue = window.localStorage.getItem(STORAGE_KEY)

  if (storedValue === 'dark' || storedValue === 'light' || storedValue === 'system') {
    return storedValue
  }

  return null
}

export function resolveAppearanceTheme(preference: AppearanceTheme, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light'
  }

  return preference
}

export function applyResolvedTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

export function applyAppearancePreference(preference: AppearanceTheme, prefersDark: boolean) {
  applyResolvedTheme(resolveAppearanceTheme(preference, prefersDark))
}
