import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  Link2,
  Rows3,
  Dna,
  GitCompareArrows,
  FlaskConical,
  Sparkles,
  FolderOpen,
  Search,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { SequenceTrayPanel } from '../components/SequenceTrayUI'
import { iconFor } from '../lib/databaseMeta'

/**
 * Application shell: a persistent left rail plus a top bar holding global
 * search. Content scrolls independently of the chrome, so navigation and the
 * search entry point never move — the thing that separates an app from a set
 * of pages.
 */

function NavItem({ to, icon: Icon, label, collapsed, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-accent" />
          )}
          <Icon size={16} className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

function SectionLabel({ children, collapsed }) {
  if (collapsed) return <div className="mx-auto my-2 h-px w-5 bg-line" />
  return (
    <p className="px-2.5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-3">
      {children}
    </p>
  )
}

export function AppShell({ databases, dark, setDark, collapsed, setCollapsed, onOpenPalette, children }) {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      {/* Left rail */}
      <aside
        className={clsx(
          'flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200',
          collapsed ? 'w-[60px]' : 'w-[228px]',
        )}
      >
        <div
          className={clsx(
            'flex h-14 items-center border-b border-line',
            collapsed ? 'justify-center px-2' : 'justify-between pl-4 pr-2',
          )}
        >
          <button onClick={() => navigate('/')} className="rounded-lg">
            <Logo collapsed={collapsed} />
          </button>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          <div className="space-y-0.5">
            <NavItem to="/" end icon={Link2} label="Cross-reference" collapsed={collapsed} />
            <NavItem to="/batch" icon={Rows3} label="Batch lookup" collapsed={collapsed} />
            <NavItem to="/blast" icon={Dna} label="BLAST" collapsed={collapsed} />
            <NavItem to="/align" icon={GitCompareArrows} label="Alignment" collapsed={collapsed} />
            <NavItem to="/properties" icon={FlaskConical} label="Properties" collapsed={collapsed} />
            <NavItem to="/dna" icon={Dna} label="DNA toolkit" collapsed={collapsed} />
            <NavItem to="/chat" icon={Sparkles} label="Assistant" collapsed={collapsed} />
            <NavItem to="/projects" icon={FolderOpen} label="Projects" collapsed={collapsed} />
          </div>

          <SectionLabel collapsed={collapsed}>Databases</SectionLabel>
          <div className="space-y-0.5">
            {Object.entries(databases).map(([key, db]) => (
              <NavItem
                key={key}
                to={`/db/${key}`}
                icon={iconFor(key)}
                label={db.name}
                collapsed={collapsed}
              />
            ))}
          </div>
        </nav>

        <div
          className={clsx(
            'flex items-center gap-1 border-t border-line p-2.5',
            collapsed && 'flex-col',
          )}
        >
          <button
            onClick={() => setDark((d) => !d)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
            {!collapsed && <span>{dark ? 'Light' : 'Dark'}</span>}
          </button>
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              title="Expand sidebar"
            >
              <PanelLeft size={15} />
            </button>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-5">
          <button
            onClick={onOpenPalette}
            className="group flex h-9 w-full max-w-md items-center gap-2.5 rounded-lg border border-line bg-paper px-3 text-left transition-colors hover:border-line-strong"
          >
            <Search size={15} className="shrink-0 text-ink-3" />
            <span className="flex-1 text-[13px] text-ink-3">
              Search genes, proteins, structures…
            </span>
            <kbd>⌘K</kbd>
          </button>

          <div className="ml-auto">
            <SequenceTrayPanel />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
