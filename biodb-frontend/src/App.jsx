import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { LogoMark } from './components/Logo'

/**
 * Two halves with different jobs and different weights.
 *
 * The landing page is the first thing a visitor sees, so it's in the main
 * bundle and has no backend dependency — it renders instantly even while the
 * free-tier server is asleep. Everything else is the workspace, fetched as a
 * separate chunk only when someone actually goes in.
 */
const Workspace = lazy(() => import('./app/Workspace'))

function WorkspaceLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-paper">
      <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-accent text-accent-contrast">
        <LogoMark size={22} />
      </span>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/*"
        element={
          <Suspense fallback={<WorkspaceLoading />}>
            <Workspace />
          </Suspense>
        }
      />
    </Routes>
  )
}
