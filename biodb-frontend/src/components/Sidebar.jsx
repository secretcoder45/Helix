import { NavLink } from 'react-router-dom'
import { Moon, Sun, Command, Sparkles } from 'lucide-react'
import { iconFor, colorFor } from '../lib/databaseMeta'
import { ACCENT } from '../lib/colorClasses'

export function Sidebar({ databases, dark, setDark, onOpenPalette }) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="text-2xl">🧬</span>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Bio Database</h1>
          <p className="text-xs text-slate-400">Unified search</p>
        </div>
      </div>

      <button
        onClick={onOpenPalette}
        className="mx-3 mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-indigo-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <span className="flex items-center gap-2">
          <Command size={14} /> Quick jump
        </span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`
          }
        >
          <Sparkles size={17} />
          Assistant
        </NavLink>
        <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
        {Object.entries(databases).map(([key, db]) => {
          const Icon = iconFor(key)
          const accent = ACCENT[colorFor(key)]
          return (
            <NavLink
              key={key}
              to={`/${key}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? `${accent.bgSoft} ${accent.text}`
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon size={17} />
              {db.name}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          onClick={() => setDark((d) => !d)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  )
}
