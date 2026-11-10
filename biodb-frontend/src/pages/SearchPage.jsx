import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, Loader2, SearchX, AlertCircle, Box } from 'lucide-react'
import clsx from 'clsx'
import { errorMessage, useSearch } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { DetailPanel } from '../components/DetailPanel'
import { iconFor } from '../lib/databaseMeta'
import { Card, EmptyState, PageHeader, Scroller, Skeleton, SourceBadge, SourceNotice } from '../components/ui'

/**
 * Database search, one column per source.
 *
 * Results from different databases are different kinds of thing — a UniProt
 * entry is a protein, a PDB entry is one experimental structure of it — so
 * they sit side by side rather than interleaved in one list. Each column
 * answers for its own source: results, "no matches", or "not responding".
 */

const RECENT_KEY = 'helix-recent-searches'

// What each source's results are, shown under its column heading.
const SOURCE_META = {
  UniProt: { what: 'Protein entries' },
  PDB: { what: 'Experimental structures' },
  'NCBI Gene': { what: 'Human gene records' },
  KEGG: { what: 'Pathway maps' },
}

// /databases names sources the way they're cited; results label them shorter.
const API_TO_LABEL = { 'RCSB PDB': 'PDB' }

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

function ResultCard({ result, index, selected, onOpen }) {
  const isPdb = result.database === 'PDB'
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, delay: Math.min(index * 0.03, 0.2) }}
    >
      <button
        onClick={() => onOpen(result)}
        className={clsx(
          'w-full rounded-xl border bg-surface px-3.5 py-3 text-left transition-colors',
          selected ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-surface-2/50',
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {isPdb ? (
            // A PDB entry's name is just its ID; the title below says what it is.
            <span className="font-mono text-[13px] font-medium text-ink">{result.id}</span>
          ) : (
            <>
              <span className="min-w-0 truncate text-[13px] font-medium text-ink">{result.name}</span>
              <span className="font-mono text-[11px] text-ink-3">{result.id}</span>
            </>
          )}
        </div>
        <p className="m-0 mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-2">{result.description}</p>
        {(isPdb || result.meta) && (
          <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-3">
            {isPdb && <Box size={11} className="shrink-0" />}
            {result.meta && <span className="tnum">{result.meta}</span>}
            {isPdb && <span>{result.meta ? '· ' : ''}opens in 3D</span>}
          </p>
        )}
      </button>
    </motion.li>
  )
}

function SourceColumn({ source, results, state, query, selected, onOpen }) {
  const meta = SOURCE_META[source] || {}
  return (
    <section className="min-w-0" aria-label={`${source} results`}>
      <header className="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-2">
        <div className="min-w-0">
          <SourceBadge source={source} />
          {meta.what && <p className="m-0 mt-1 truncate text-[11px] text-ink-3">{meta.what}</p>}
        </div>
        {state === 'done' && (
          <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-3">
            {results.length}
          </span>
        )}
      </header>

      {state === 'loading' && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      )}

      {state === 'unavailable' && <SourceNotice source={source} what="its results are" />}

      {state === 'done' && results.length === 0 && (
        <p className="m-0 rounded-xl border border-dashed border-line px-3.5 py-4 text-center text-[12px] text-ink-3">
          No matches in {source} for “{query}”
        </p>
      )}

      {state === 'done' && results.length > 0 && (
        <ul className="m-0 list-none space-y-2 p-0">
          {results.map((r, i) => (
            <ResultCard
              key={`${r.id}-${i}`}
              result={r}
              index={i}
              selected={selected?.id === r.id && selected?.database === r.database}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// Column count drives the grid and how wide the page may grow.
function layoutFor(n) {
  if (n >= 3) return { width: 'max-w-[1400px]', grid: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' }
  if (n === 2) return { width: 'max-w-6xl', grid: 'grid-cols-1 md:grid-cols-2' }
  return { width: 'max-w-3xl', grid: 'grid-cols-1' }
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

  const { data, isLoading, isFetching, isError, error } = useSearch(database, debounced)

  useEffect(() => {
    if (debounced && debounced.trim().length > 1) pushRecent({ database, query: debounced })
  }, [debounced, database])

  if (!databases[database]) {
    return <Navigate to="/lookup" replace />
  }

  const db = databases[database]
  const Icon = iconFor(database)
  const hasQuery = debounced.trim().length > 1

  // Columns are known before results arrive (from /databases), so the layout
  // doesn't jump when they do.
  const sources = data?.sources?.length ? data.sources : (db.apis || []).map((a) => API_TO_LABEL[a] || a)
  const results = data?.results || []
  const unavailable = data?.unavailable || []
  const nothingAnywhere = data && results.length === 0 && unavailable.length === 0
  const layout = layoutFor(sources.length)

  const open = (r) => {
    setSelected(r)
    setPanelOpen(true)
  }

  return (
    <>
      <PageHeader eyebrow={db.apis?.join(' · ')} title={db.name} description={db.description} />

      <div className="shrink-0 border-b border-line bg-surface px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
        <div className={clsx('relative mx-auto', layout.width)}>
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={database === 'all' ? 'Search every database at once…' : `Search ${db.name.toLowerCase()}…`}
            className="h-10 w-full rounded-lg border border-line bg-paper pl-10 pr-10 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          {isFetching && (
            <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-accent" />
          )}
        </div>
      </div>

      <Scroller className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className={clsx('mx-auto', layout.width)}>
          {!hasQuery && (
            <EmptyState
              icon={Icon}
              title={`Search ${db.name.toLowerCase()}`}
              description={`Queries run live against ${db.apis?.join(', ').replace(/, ([^,]*)$/, ' and $1')}${
                sources.length > 1 ? ', with each source in its own column' : ''
              }. Results are cached briefly so repeated searches return instantly.`}
            />
          )}

          {isError && (
            <Card className="border-warn/30 bg-warn-soft p-4">
              <div className="flex gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">Search failed</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">{errorMessage(error)}</p>
                </div>
              </div>
            </Card>
          )}

          {hasQuery && nothingAnywhere && (
            <EmptyState
              icon={SearchX}
              title={`No results for “${debounced}”`}
              description={`Nothing in ${sources.join(', ').replace(/, ([^,]*)$/, ' or $1')}. Try a different spelling, an official symbol, or a broader term.`}
            />
          )}

          {hasQuery && !isError && !nothingAnywhere && (
            <div className={clsx('grid gap-x-5 gap-y-8', layout.grid)}>
              {sources.map((source) => (
                <SourceColumn
                  key={source}
                  source={source}
                  query={debounced}
                  results={results.filter((r) => r.database === source)}
                  state={isLoading ? 'loading' : unavailable.includes(source) || unavailable.includes(source === 'PDB' ? 'RCSB PDB' : source) ? 'unavailable' : 'done'}
                  selected={selected}
                  onOpen={open}
                />
              ))}
            </div>
          )}
        </div>
      </Scroller>

      <DetailPanel result={selected} open={panelOpen} onOpenChange={setPanelOpen} />
    </>
  )
}
