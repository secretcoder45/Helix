import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { useDatabases } from '../lib/api'
import { API_URL } from '../lib/config'
import { useDarkMode } from '../hooks/useDarkMode'
import { AppShell } from './AppShell'
import { CommandPalette } from '../components/CommandPalette'
import { LogoMark } from '../components/Logo'
import { AuthProvider } from '../context/Auth'

/**
 * The application proper — everything behind the landing page.
 *
 * Loaded as its own chunk, and each tool page inside it as a further chunk:
 * someone looking up one gene should not download the phylogenetics,
 * restriction-gel and primer-design code to do it. Before this split the
 * whole app shipped as a single 679 KB bundle on first visit.
 */

// Pages are named exports; React.lazy wants a default.
function page(loader, name) {
  return lazy(() => loader().then((m) => ({ default: m[name] })))
}

const EntityPage = page(() => import('../pages/EntityPage'), 'EntityPage')
const BatchPage = page(() => import('../pages/BatchPage'), 'BatchPage')
const BlastPage = page(() => import('../pages/BlastPage'), 'BlastPage')
const AlignPage = page(() => import('../pages/AlignPage'), 'AlignPage')
const PropertiesPage = page(() => import('../pages/PropertiesPage'), 'PropertiesPage')
const DnaPage = page(() => import('../pages/DnaPage'), 'DnaPage')
const ComparePage = page(() => import('../pages/ComparePage'), 'ComparePage')
const PhyloPage = page(() => import('../pages/PhyloPage'), 'PhyloPage')
const RestrictionPage = page(() => import('../pages/RestrictionPage'), 'RestrictionPage')
const VariantPage = page(() => import('../pages/VariantPage'), 'VariantPage')
const PrimerPage = page(() => import('../pages/PrimerPage'), 'PrimerPage')
const ChatPage = page(() => import('../pages/ChatPage'), 'ChatPage')
const ProjectsPage = page(() => import('../pages/ProjectsPage'), 'ProjectsPage')
const SearchPage = page(() => import('../pages/SearchPage'), 'SearchPage')
const ValidationPage = page(() => import('../pages/ValidationPage'), 'ValidationPage')
const SignInPage = page(() => import('../pages/SignInPage'), 'SignInPage')
const SharedProjectPage = page(() => import('../pages/SharedProjectPage'), 'SharedProjectPage')

// Created at module scope so it survives re-renders; it lives here rather
// than in main.jsx so the landing page doesn't ship react-query.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
})

const RECENT_KEY = 'helix-recent-searches'
const RAIL_KEY = 'helix-rail-collapsed'

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function Splash({ children }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      {children}
    </div>
  )
}

/**
 * The backend runs on a free tier that sleeps when idle, and the first
 * request afterwards takes up to a minute. A spinner that silently runs for
 * fifty seconds reads as broken; after a few seconds, say what's happening.
 */
function WakingSplash() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3500)
    return () => clearTimeout(t)
  }, [])
  return (
    <Splash>
      <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-accent text-accent-contrast">
        <LogoMark size={22} />
      </span>
      <p className="text-[13px] text-ink-3">Loading workspace…</p>
      {slow && (
        <p className="max-w-xs text-[12px] leading-relaxed text-ink-3">
          The server sleeps when nobody is using it. The first request after a quiet spell can
          take up to a minute — after that it's quick.
        </p>
      )}
    </Splash>
  )
}

/** Shown in the content area while a tool's chunk downloads. */
function PageFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  )
}

function WorkspaceInner() {
  const { data: databases, isLoading, isError } = useDatabases()
  const [dark, setDark] = useDarkMode()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === 'true'
    } catch {
      return false
    }
  })
  const navigate = useNavigate()

  const setRail = (value) => {
    const next = typeof value === 'function' ? value(collapsed) : value
    setCollapsed(next)
    try {
      localStorage.setItem(RAIL_KEY, String(next))
    } catch {
      /* storage unavailable */
    }
  }

  if (isLoading) return <WakingSplash />

  if (isError || !databases) {
    return (
      <Splash>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <AlertCircle size={20} />
        </span>
        <p className="font-display text-[16px] font-semibold text-ink">Can’t reach the server</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">
          Nothing is responding at{' '}
          <code className="font-mono text-[12px] text-ink">{API_URL}</code>. If it was asleep, wait
          a moment and reload. Running locally? Start it with{' '}
          <code className="font-mono text-[12px] text-ink">uvicorn main:app --reload</code>.
        </p>
      </Splash>
    )
  }

  const app = (
    <AppShell
      databases={databases}
      dark={dark}
      setDark={setDark}
      collapsed={collapsed}
      setCollapsed={setRail}
      onOpenPalette={() => setPaletteOpen(true)}
    >
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="lookup" element={<EntityPage />} />
          <Route path="batch" element={<BatchPage />} />
          <Route path="blast" element={<BlastPage />} />
          <Route path="align" element={<AlignPage />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="dna" element={<DnaPage />} />
          <Route path="compare" element={<ComparePage />} />
          <Route path="phylo" element={<PhyloPage />} />
          <Route path="restriction" element={<RestrictionPage />} />
          <Route path="variant" element={<VariantPage />} />
          <Route path="primers" element={<PrimerPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="validation" element={<ValidationPage />} />
          <Route path="shared/:token" element={<SharedProjectPage />} />
          <Route path="db/:database" element={<SearchPage databases={databases} />} />
          <Route path="*" element={<Navigate to="/lookup" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )

  return (
    <>
      {/* Sign-in is a full page, outside the app shell; everything else is inside it. */}
      <Suspense fallback={<WakingSplash />}>
        <Routes>
          <Route path="signin" element={<SignInPage />} />
          <Route path="*" element={app} />
        </Routes>
      </Suspense>

      <CommandPalette
        open={paletteOpen}
        setOpen={setPaletteOpen}
        databases={databases}
        recentSearches={getRecent()}
        onRecentSelect={(item) =>
          navigate(`/db/${item.database}?q=${encodeURIComponent(item.query)}`)
        }
      />
    </>
  )
}

export default function Workspace() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceInner />
      </AuthProvider>
    </QueryClientProvider>
  )
}
