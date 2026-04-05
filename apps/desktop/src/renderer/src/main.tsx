import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/app'
import { applyAppearancePreference, readStoredAppearanceTheme } from './lib/theme'
import './styles/globals.css'

applyAppearancePreference(readStoredAppearanceTheme() ?? 'system', window.matchMedia('(prefers-color-scheme: dark)').matches)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
