import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BusinessApp } from './business/BusinessApp.tsx'
import { isBusinessHost } from './business/host.ts'

const RootApp = isBusinessHost(window.location.hostname, window.location.search)
  ? BusinessApp
  : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is progressive enhancement; the app works without it.
    })
  })
}
