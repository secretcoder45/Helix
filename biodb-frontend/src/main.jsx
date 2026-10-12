import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SequenceTrayProvider } from './context/SequenceTray'

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
