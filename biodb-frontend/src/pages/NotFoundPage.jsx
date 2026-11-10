import { Link, useLocation } from 'react-router-dom'
import { NAV_GROUPS } from '../lib/nav'
import { Scroller } from '../components/ui'

/**
 * A path that matches nothing. Says so — rather than silently redirecting to
 * the lookup page, which hid broken links — and offers the tools instead.
 */
export function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <Scroller className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-accent">404</p>
        <h1 className="font-display m-0 mt-3 text-[28px] font-semibold tracking-[-0.015em] text-ink">
          Nothing lives at this address
        </h1>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-ink-2">
          <code className="break-all rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">{pathname}</code>{' '}
          isn’t a page in Helix. The link may be mistyped, or from an older version. Here’s
          everything that is:
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="m-0 mb-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-3">
                {group.label}
              </p>
              <ul className="m-0 list-none space-y-1 p-0">
                {group.items.map(({ to, icon: Icon, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="inline-flex items-center gap-2 text-[13.5px] text-ink transition-colors hover:text-accent"
                    >
                      <Icon size={14} className="text-ink-3" /> {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Scroller>
  )
}
