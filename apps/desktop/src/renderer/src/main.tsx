import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/app'
import { applyAppearancePreference, getSystemPrefersDark, readStoredAppearanceTheme } from './lib/theme'
import './styles/globals.css'

applyAppearancePreference(readStoredAppearanceTheme() ?? 'system', getSystemPrefersDark())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
