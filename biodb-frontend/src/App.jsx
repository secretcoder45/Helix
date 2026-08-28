import { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useDatabases } from './lib/api'
import { useDarkMode } from './hooks/useDarkMode'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { SearchPage } from './pages/SearchPage'
import { ChatPage } from './pages/ChatPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { EntityPage } from './pages/EntityPage'

const RECENT_KEY = 'biodb-recent-searches'

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function App() {
  const { data: databases, isLoading, isError } = useDatabases()
  const [dark, setDark] = useDarkMode()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-slate-400">
        Loading Bio Database…
      </div>
    )
  }

  if (isError || !databases) {
    return (
      <div className="flex h-screen items-center justify-center px-6 text-center text-sm text-rose-500">
        Couldn't reach the backend at {import.meta.env.VITE_API_URL || 'http://localhost:8000'}.
        <br />
        Make sure the FastAPI server is running.
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        databases={databases}
        dark={dark}
        setDark={setDark}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<EntityPage />} />
          <Route path="/entity" element={<EntityPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/:database" element={<SearchPage databases={databases} />} />
        </Routes>
      </main>

      <CommandPalette
        open={paletteOpen}
        setOpen={setPaletteOpen}
        databases={databases}
        recentSearches={getRecent()}
        onRecentSelect={(item) => navigate(`/${item.database}?q=${encodeURIComponent(item.query)}`)}
      />
    </div>
  )
}

export default App
