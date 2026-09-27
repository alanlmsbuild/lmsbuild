import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/tokens.css'
import './index.css'

// Three pages, chosen by path: the Warren learner app at /app, Burrow (the
// learner e-portfolio) at /burrow, and the Rarebit landing page at / (and
// anything else). Moving between them is a normal full page load, so no
// router is needed. Each page is loaded on demand, which also keeps each
// one's global styles (like Warren's App.css) off the others.
const path = window.location.pathname
const isApp = /^\/app(\/|$)/.test(path)
const isBurrow = /^\/burrow(\/|$)/.test(path)
const Page = isApp
  ? lazy(() => import('./App.jsx'))
  : isBurrow
    ? lazy(() => import('./burrow/BurrowApp.jsx'))
    : lazy(() => import('./Landing.jsx'))
// Which area's accent colour the design tokens use (src/ui/tokens.css).
document.documentElement.dataset.area = isApp ? 'warren' : isBurrow ? 'burrow' : 'rarebit'
document.title = isApp
  ? 'Warren by Rarebit'
  : isBurrow
    ? 'Burrow by Rarebit'
    : 'Rarebit: learning and e-portfolio systems'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  </StrictMode>,
)
