import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Link2, FolderOpen } from 'lucide-react'
import { iconFor } from '../lib/databaseMeta'
import { useEffect } from 'react'

export function CommandPalette({ open, setOpen, databases, recentSearches, onRecentSelect }) {
  const navigate = useNavigate()

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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <Command
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        <Command.Input
          autoFocus
          placeholder="Jump to a database, or pick a recent search..."
          className="w-full border-b border-slate-200 px-4 py-3.5 text-sm outline-none dark:border-slate-800 dark:bg-slate-900"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="p-4 text-center text-sm text-slate-400">
            No matches.
          </Command.Empty>

          <Command.Group heading="" className="px-2 py-1">
            {[
              { to: '/entity', icon: Link2, label: 'Cross-reference a gene or protein' },
              { to: '/chat', icon: Sparkles, label: 'Ask the Assistant' },
              { to: '/projects', icon: FolderOpen, label: 'Open Projects' },
            ].map(({ to, icon: Icon, label }) => (
              <Command.Item
                key={to}
                onSelect={() => {
                  navigate(to)
                  setOpen(false)
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
              >
                <Icon size={16} className="text-indigo-400" />
                {label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Databases" className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            {Object.entries(databases).map(([key, db]) => {
              const Icon = iconFor(key)
              return (
                <Command.Item
                  key={key}
                  onSelect={() => {
                    navigate(`/${key}`)
                    setOpen(false)
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                >
                  <Icon size={16} className="text-slate-400" />
                  {db.name}
                  <span className="ml-auto text-xs text-slate-400">{db.description}</span>
                </Command.Item>
              )
            })}
          </Command.Group>

          {recentSearches?.length > 0 && (
            <Command.Group heading="Recent" className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              {recentSearches.map((item, i) => (
                <Command.Item
                  key={i}
                  onSelect={() => {
                    onRecentSelect(item)
                    setOpen(false)
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm data-[selected=true]:bg-slate-100 dark:data-[selected=true]:bg-slate-800"
                >
                  <span className="text-slate-400">in {item.database}:</span> {item.query}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  )
}
