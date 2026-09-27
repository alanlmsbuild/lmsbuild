import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/tokens.css'
import './index.css'
import Shell from './shell/Shell.jsx'
import { areaOf } from './shell/navigation'

// Rarebit is one app: the landing page at /, Warren at /app and Burrow at
// /burrow, all in the shell (shell/Shell.jsx), which moves between them
// without reloading. The area is set here as well as by the shell, so the
// first paint already has the right colours.
document.documentElement.dataset.area = areaOf(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
