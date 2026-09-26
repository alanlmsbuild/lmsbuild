import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Two pages, chosen by path: the Warren learner app at /app, and the
// Rarebit landing page at / (and anything else). Moving between them is a
// normal full page load, so no router is needed. Each page is loaded on
// demand, which also keeps the app's global form and table styles
// (App.css) off the landing page.
const isApp = /^\/app(\/|$)/.test(window.location.pathname)
const Page = isApp ? lazy(() => import('./App.jsx')) : lazy(() => import('./Landing.jsx'))
document.title = isApp ? 'Warren by Rarebit' : 'Rarebit: learning and e-portfolio systems'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
