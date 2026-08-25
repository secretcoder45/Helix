import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { colorFor } from '../lib/databaseMeta'
import { ACCENT } from '../lib/colorClasses'

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
    </div>
  )
}

export function ResultsList({ results, isLoading, isError, query, database, selectedId, onSelect }) {
  const accent = ACCENT[colorFor(database)]

  if (!query || query.trim().length < 2) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
        <p className="text-sm">Start typing to search {database}</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400">
        Something went wrong reaching the database. Try again in a moment.
      </div>
    )
  }

  if (!results || results.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
        <p className="text-sm">No results for "{query}"</p>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {results.map((r, idx) => {
          const isSelected = selectedId === `${r.database}-${r.id}`
          return (
            <motion.li
              key={`${r.database}-${r.id}-${idx}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: idx * 0.02 }}
            >
              <button
                onClick={() => onSelect(r)}
                className={`w-full rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? `${accent.border} ${accent.bgSoft}`
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{r.name}</h3>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      {r.description}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${accent.bgSoft} ${accent.text}`}
                  >
                    {r.database}
                  </span>
                </div>
              </button>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

export function ExternalLinkIcon() {
  return <ExternalLink size={14} />
}
