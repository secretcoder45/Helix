import { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useDatabases } from './lib/api'
import { useDarkMode } from './hooks/useDarkMode'
import { AppShell } from './app/AppShell'
import { CommandPalette } from './components/CommandPalette'
import { EntityPage } from './pages/EntityPage'
import { ChatPage } from './pages/ChatPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SearchPage } from './pages/SearchPage'
import { LogoMark } from './components/Logo'

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

function App() {
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

  if (isLoading) {
    return (
      <Splash>
        <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-accent text-accent-contrast">
          <LogoMark size={22} />
        </span>
        <p className="text-[13px] text-ink-3">Loading workspace…</p>
      </Splash>
    )
  }

  if (isError || !databases) {
    return (
      <Splash>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
          <AlertCircle size={20} />
        </span>
        <p className="font-display text-[16px] font-semibold text-ink">
          Can’t reach the backend
        </p>
        <p className="max-w-sm text-[13px] leading-relaxed text-ink-2">
          Nothing is responding at{' '}
          <code className="font-mono text-[12px] text-ink">
            {import.meta.env.VITE_API_URL || 'http://localhost:8000'}
          </code>
          . Start the FastAPI server with{' '}
          <code className="font-mono text-[12px] text-ink">uvicorn main:app --reload</code>.
        </p>
      </Splash>
    )
  }

  return (
    <>
      <AppShell
        databases={databases}
        dark={dark}
        setDark={setDark}
        collapsed={collapsed}
        setCollapsed={setRail}
        onOpenPalette={() => setPaletteOpen(true)}
      >
        <Routes>
          <Route path="/" element={<EntityPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/db/:database" element={<SearchPage databases={databases} />} />
          <Route path="*" element={<EntityPage />} />
        </Routes>
      </AppShell>

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

export default App
