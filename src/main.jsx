import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './components/ui/BorderGlow.css'
import { applyCachedTheme, bootstrapThemeFromStorage } from './lib/theme'
import { installGlobalErrorLogging } from './lib/siteLogs'
import { enforceCanonicalHost } from './lib/siteDomain'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Apex → www in production. Requires clean DNS so apex actually loads the SPA.
if (enforceCanonicalHost()) {
  // Hard navigation in progress — do not mount React on the wrong host.
} else {
  bootstrapThemeFromStorage()
  applyCachedTheme()
  installGlobalErrorLogging()

  const savedLang = typeof localStorage !== 'undefined' && localStorage.getItem('echocore-lang') === 'en' ? 'en' : 'ar'

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <ErrorBoundary lang={savedLang}>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </StrictMode>,
  )
}
