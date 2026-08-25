import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Navigate } from 'react-router-dom'
import { useDatabases, useSearch } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { SearchBar } from '../components/SearchBar'
import { ResultsList } from '../components/ResultsList'
import { DetailPanel } from '../components/DetailPanel'

const RECENT_KEY = 'biodb-recent-searches'

function pushRecent(entry) {
  try {
    const existing = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const deduped = [entry, ...existing.filter((e) => e.query !== entry.query || e.database !== entry.database)]
    localStorage.setItem(RECENT_KEY, JSON.stringify(deduped.slice(0, 8)))
  } catch {
    // ignore storage errors
  }
}

export function SearchPage({ databases }) {
  const { database } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || ''

  const [input, setInput] = useState(urlQuery)
  const debouncedQuery = useDebounce(input, 350)
  const [selected, setSelected] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Keep the URL in sync with what's actually being searched (shareable links).
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (debouncedQuery) next.set('q', debouncedQuery)
    else next.delete('q')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  useEffect(() => {
    setInput(urlQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database])

  const { data: results, isLoading, isFetching, isError } = useSearch(database, debouncedQuery)

  useEffect(() => {
    if (debouncedQuery && debouncedQuery.trim().length > 1) {
      pushRecent({ database, query: debouncedQuery })
    }
  }, [debouncedQuery, database])

  if (!databases[database]) {
    const first = Object.keys(databases)[0]
    return first ? <Navigate to={`/${first}`} replace /> : null
  }

  const db = databases[database]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{db.name}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{db.description}</p>
      </div>

      <SearchBar
        value={input}
        onChange={setInput}
        placeholder={`Search ${db.name.toLowerCase()}... e.g. "insulin"`}
        isFetching={isFetching}
      />

      <div className="mt-6 flex-1 overflow-y-auto pb-8">
        <ResultsList
          results={results}
          isLoading={isLoading}
          isError={isError}
          query={debouncedQuery}
          database={database}
          selectedId={selected ? `${selected.database}-${selected.id}` : null}
          onSelect={(r) => {
            setSelected({ ...r, _database: database })
            setPanelOpen(true)
          }}
        />
      </div>

      <DetailPanel result={selected} open={panelOpen} onOpenChange={setPanelOpen} />
    </div>
  )
}
