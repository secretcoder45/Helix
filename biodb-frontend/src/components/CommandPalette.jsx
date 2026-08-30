import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Rows3, Dna, GitCompareArrows, FlaskConical, Sparkles, FolderOpen, CornerDownLeft, Clock, Loader2 } from 'lucide-react'
import { iconFor } from '../lib/databaseMeta'
import { useEntity } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { SourceBadge } from './ui'

/**
 * Global command palette. Beyond navigation, it resolves what you type against
 * UniProt live, so a gene symbol can be jumped to directly from the keyboard
 * without first landing on a search page.
 */
export function CommandPalette({ open, setOpen, databases, recentSearches, onRecentSelect }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query, 300)
  const { data: entity, isFetching } = useEntity(open ? debounced : '')

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [setOpen])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const go = (to) => {
    navigate(to)
    setOpen(false)
  }

  const NAV = [
    { to: '/', icon: Link2, label: 'Cross-reference' },
    { to: '/batch', icon: Rows3, label: 'Batch lookup' },
    { to: '/blast', icon: Dna, label: 'BLAST search' },
    { to: '/align', icon: GitCompareArrows, label: 'Pairwise alignment' },
    { to: '/properties', icon: FlaskConical, label: 'Protein properties' },
    { to: '/chat', icon: Sparkles, label: 'Assistant' },
    { to: '/projects', icon: FolderOpen, label: 'Projects' },
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/25 px-4 pt-[12vh] backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          >
            <Command shouldFilter={false} loop>
              <div className="flex items-center gap-2.5 border-b border-line px-4">
                {isFetching ? (
                  <Loader2 size={15} className="shrink-0 animate-spin text-accent" />
                ) : (
                  <Link2 size={15} className="shrink-0 text-ink-3" />
                )}
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search a gene or protein, or jump to a page…"
                  className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
                />
                <kbd>ESC</kbd>
              </div>

              <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
                {/* Live entity resolution */}
                {entity && (
                  <Command.Group
                    heading="Match"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-ink-3"
                  >
                    <Command.Item
                      value={`entity-${entity.accession}`}
                      onSelect={() => go(`/?q=${encodeURIComponent(debounced)}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 data-[selected=true]:bg-accent-soft"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-ink">
                            {entity.protein_name || entity.name}
                          </span>
                          <SourceBadge source="UniProt" />
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-ink-3">
                          {entity.accession} · {entity.genes?.join(', ')} ·{' '}
                          <em>{entity.organism}</em>
                        </p>
                      </div>
                      <CornerDownLeft size={13} className="shrink-0 text-ink-3" />
                    </Command.Item>
                  </Command.Group>
                )}

                {debounced.length > 1 && !entity && !isFetching && (
                  <p className="px-3 py-6 text-center text-[12px] text-ink-3">
                    No match for “{debounced}”. Try an official gene symbol.
                  </p>
                )}

                <Command.Group
                  heading="Go to"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-ink-3"
                >
                  {NAV.filter((n) =>
                    n.label.toLowerCase().includes(query.toLowerCase()),
                  ).map(({ to, icon: Icon, label }) => (
                    <Command.Item
                      key={to}
                      value={label}
                      onSelect={() => go(to)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink data-[selected=true]:bg-surface-2"
                    >
                      <Icon size={15} className="text-ink-3" />
                      {label}
                    </Command.Item>
                  ))}
                  {Object.entries(databases)
                    .filter(([, db]) => db.name.toLowerCase().includes(query.toLowerCase()))
                    .map(([key, db]) => {
                      const Icon = iconFor(key)
                      return (
                        <Command.Item
                          key={key}
                          value={`db-${db.name}`}
                          onSelect={() => go(`/db/${key}`)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink data-[selected=true]:bg-surface-2"
                        >
                          <Icon size={15} className="text-ink-3" />
                          {db.name}
                          <span className="ml-auto truncate text-[11px] text-ink-3">
                            {db.description}
                          </span>
                        </Command.Item>
                      )
                    })}
                </Command.Group>

                {recentSearches?.length > 0 && !query && (
                  <Command.Group
                    heading="Recent"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-ink-3"
                  >
                    {recentSearches.slice(0, 5).map((item, i) => (
                      <Command.Item
                        key={i}
                        value={`recent-${item.query}-${i}`}
                        onSelect={() => {
                          onRecentSelect(item)
                          setOpen(false)
                        }}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink data-[selected=true]:bg-surface-2"
                      >
                        <Clock size={14} className="text-ink-3" />
                        {item.query}
                        <span className="ml-auto text-[11px] text-ink-3">{item.database}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
