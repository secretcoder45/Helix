import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Loader2, SearchX, AlertCircle } from 'lucide-react'
import { useSearch } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { DetailPanel } from '../components/DetailPanel'
import { iconFor } from '../lib/databaseMeta'
import { Card, EmptyState, PageHeader, Scroller, Skeleton, SourceBadge } from '../components/ui'

const RECENT_KEY = 'helix-recent-searches'

function pushRecent(entry) {
  try {
    const existing = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const deduped = [
      entry,
      ...existing.filter((e) => e.query !== entry.query || e.database !== entry.database),
    ]
    localStorage.setItem(RECENT_KEY, JSON.stringify(deduped.slice(0, 8)))
  } catch {
    /* storage unavailable */
  }
}

export function SearchPage({ databases }) {
  const { database } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || ''

  const [input, setInput] = useState(urlQuery)
  const debounced = useDebounce(input, 350)
  const [selected, setSelected] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (debounced) next.set('q', debounced)
    else next.delete('q')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    setInput(urlQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database])

  const { data: results, isLoading, isFetching, isError } = useSearch(database, debounced)

  useEffect(() => {
    if (debounced && debounced.trim().length > 1) pushRecent({ database, query: debounced })
  }, [debounced, database])

  if (!databases[database]) {
    return <Navigate to="/" replace />
  }

  const db = databases[database]
  const Icon = iconFor(database)
  const hasQuery = debounced.trim().length > 1

  return (
    <>
      <PageHeader
        eyebrow={db.apis?.join(' · ')}
        title={db.name}
        description={db.description}
      />

      <div className="shrink-0 border-b border-line bg-surface px-8 py-4">
        <div className="relative mx-auto max-w-4xl">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Search ${db.name.toLowerCase()}…`}
            className="h-10 w-full rounded-lg border border-line bg-paper pl-10 pr-10 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          {isFetching && (
            <Loader2
              size={14}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-accent"
            />
          )}
        </div>
      </div>

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {!hasQuery && (
            <EmptyState
              icon={Icon}
              title={`Search ${db.name.toLowerCase()}`}
              description={`Queries run live against ${db.apis?.join(' and ')}. Results are cached briefly so repeated searches return instantly.`}
            />
          )}

          {hasQuery && isLoading && (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-[68px] rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <Card className="border-warn/30 bg-warn-soft p-4">
              <div className="flex gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">Search failed</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    The source APIs may be slow or unavailable. Try again shortly.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {hasQuery && !isLoading && results?.length === 0 && (
            <EmptyState
              icon={SearchX}
              title={`No results for “${debounced}”`}
              description="Try a different spelling, an official symbol, or a broader term."
            />
          )}

          {results?.length > 0 && (
            <>
              <p className="mb-3 text-[11px] text-ink-3">
                <span className="tnum">{results.length}</span> results
              </p>
              <ul className="space-y-2">
                {results.map((r, idx) => {
                  const isSelected = selected?.id === r.id && selected?.database === r.database
                  return (
                    <motion.li
                      key={`${r.database}-${r.id}-${idx}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.14, delay: Math.min(idx * 0.02, 0.2) }}
                    >
                      <button
                        onClick={() => {
                          setSelected(r)
                          setPanelOpen(true)
                        }}
                        className={`w-full rounded-xl border bg-surface px-4 py-3.5 text-left transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent-soft'
                            : 'border-line hover:border-line-strong hover:bg-surface-2/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[13px] font-medium text-ink">
                                {r.name}
                              </span>
                              <span className="font-mono text-[11px] text-ink-3">{r.id}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-2">
                              {r.description}
                            </p>
                          </div>
                          <SourceBadge source={r.database} />
                        </div>
                      </button>
                    </motion.li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </Scroller>

      <DetailPanel result={selected} open={panelOpen} onOpenChange={setPanelOpen} />
    </>
  )
}
