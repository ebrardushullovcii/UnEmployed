import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppearanceTheme } from '@unemployed/contracts'
import {
  applyAppearancePreference,
  DARK_QUERY,
  resolveAppearanceTheme,
  STORAGE_KEY,
  type ResolvedTheme
} from '@renderer/lib/theme'

interface ThemeProviderProps {
  children: ReactNode
  preference: AppearanceTheme
}

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  return window.matchMedia(DARK_QUERY).matches
}

export function ThemeProvider({ children, preference }: ThemeProviderProps) {
  const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQuery = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }

    setSystemPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', onChange)

    return () => {
      mediaQuery.removeEventListener('change', onChange)
    }
  }, [])

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => resolveAppearanceTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  )

  useEffect(() => {
    applyAppearancePreference(preference, systemPrefersDark)
    window.localStorage.setItem(STORAGE_KEY, preference)
  }, [preference, systemPrefersDark])

  return <div data-appearance-theme={preference} data-resolved-theme={resolvedTheme} className="contents">{children}</div>
}
