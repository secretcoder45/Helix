import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { Menu, Moon, PanelLeft, PanelLeftClose, Search, Sun, X } from 'lucide-react'
import { Logo } from '../components/Logo'
import { SequenceTrayPanel } from '../components/SequenceTrayUI'
import { AccountMenu } from '../components/AccountMenu'
import { iconFor } from '../lib/databaseMeta'
import { NAV_FOOTER, NAV_GROUPS } from '../lib/nav'

/**
 * Application shell: navigation, a top bar holding global search, and the
 * page. Content scrolls independently of the chrome, so navigation and the
 * search entry point never move.
 *
 * Wide screens get a persistent rail (collapsible to icons). Below `lg` the
 * same navigation moves into a drawer behind a menu button: a 228px rail on a
 * 390px phone leaves the tool itself a strip too narrow to use.
 */

function NavItem({ to, icon: Icon, label, collapsed, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[5px] text-[13px] font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
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
  if (collapsed) return <div className="mx-auto mb-2 h-px w-5 bg-line" />
  return (
    <p className="m-0 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-3">
      {children}
    </p>
  )
}

function ThemeToggle({ dark, setDark, collapsed }) {
  return (
    <button
      onClick={() => setDark((d) => !d)}
      className={clsx(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      {!collapsed && <span>{dark ? 'Light theme' : 'Dark theme'}</span>}
    </button>
  )
}

/** The navigation itself — shared by the rail and the drawer. */
function NavContent({ databases, collapsed, dark, setDark, onNavigate }) {
  const dbEntries = Object.entries(databases || {})
  return (
    <>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5" aria-label="Tools">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-3 first:mt-0">
            <SectionLabel collapsed={collapsed}>{group.label}</SectionLabel>
            <div className="space-y-px">
              {group.items.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}

        {dbEntries.length > 0 && (
          <div className="mt-3">
            <SectionLabel collapsed={collapsed}>Search a database</SectionLabel>
            <div className="space-y-px">
              {dbEntries.map(([key, db]) => (
                <NavItem
                  key={key}
                  to={`/db/${key}`}
                  icon={iconFor(key)}
                  label={db.name}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Pinned: always visible however long the tool list grows. */}
      <div className="space-y-px border-t border-line px-2.5 py-2">
        {NAV_FOOTER.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <ThemeToggle dark={dark} setDark={setDark} collapsed={collapsed} />
      </div>
    </>
  )
}

function MobileNav({ open, onOpenChange, ...navProps }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[85vw] flex-col border-r border-line bg-surface shadow-pop lg:hidden"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
            <Dialog.Title className="m-0">
              <Logo />
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
              <X size={16} />
              <span className="sr-only">Close menu</span>
            </Dialog.Close>
          </div>
          {/* Choosing a page closes the drawer. */}
          <NavContent {...navProps} collapsed={false} onNavigate={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function AppShell({ databases, dark, setDark, collapsed, setCollapsed, onOpenPalette, children }) {
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const navProps = { databases, dark, setDark }

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {/* Persistent rail, wide screens only */}
      <aside
        className={clsx(
          'hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[60px]' : 'w-[228px]',
        )}
      >
        <div
          className={clsx(
            'flex h-14 shrink-0 items-center border-b border-line',
            collapsed ? 'justify-center px-2' : 'justify-between pl-4 pr-2',
          )}
        >
          <button onClick={() => navigate('/')} className="rounded-lg" title="Helix home">
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
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            title="Expand sidebar"
          >
            <PanelLeft size={15} />
          </button>
        )}
        <NavContent {...navProps} collapsed={collapsed} />
      </aside>

      <MobileNav open={drawer} onOpenChange={setDrawer} {...navProps} />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-5">
          <button
            onClick={() => setDrawer(true)}
            className="rounded-lg p-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <button
            onClick={() => navigate('/')}
            className="rounded-lg sm:hidden"
            aria-label="Helix home"
          >
            <Logo collapsed />
          </button>

          <button
            onClick={onOpenPalette}
            className="group ml-auto flex h-9 min-w-0 items-center gap-2.5 rounded-lg border border-line bg-paper px-3 text-left transition-colors hover:border-line-strong sm:ml-0 sm:w-full sm:max-w-md"
            aria-label="Search or jump to a tool"
          >
            <Search size={15} className="shrink-0 text-ink-3" />
            <span className="hidden flex-1 truncate text-[13px] text-ink-3 sm:inline">
              Search a gene, or jump to a tool…
            </span>
            {/* Wrapped: the global kbd style would override `hidden` on the element itself. */}
            <span className="hidden sm:inline">
              <kbd>⌘K</kbd>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
            <SequenceTrayPanel />
            <AccountMenu />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
