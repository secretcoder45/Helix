import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SequenceTrayProvider } from './context/SequenceTray'

// Chunk filenames are content-hashed, so a deploy removes the previous ones.
// A tab opened before the deploy then fails to load the next page it visits;
// reload once to pick up the new build instead of showing a broken page. The
// timestamp guard stops a genuinely missing chunk from reloading forever.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'helix-chunk-reload'
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 10_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return // without the guard a reload could loop; let the error surface
  }
  event.preventDefault()
  window.location.reload()
})

// The react-query client lives in the workspace chunk, not here, so the
// landing page doesn't pay for it.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SequenceTrayProvider>
        <App />
      </SequenceTrayProvider>
    </BrowserRouter>
  </StrictMode>,
)
