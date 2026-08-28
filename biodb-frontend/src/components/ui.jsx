/**
 * UI primitives.
 *
 * Kept in one module deliberately: at this size, a single well-organised file
 * is easier to keep visually consistent than a dozen near-empty ones, and it
 * makes the design system legible in a single read.
 */

import { forwardRef } from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

/* ---------------------------------------------------------------- Button -- */

const BUTTON_VARIANTS = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent-hover shadow-sm disabled:hover:bg-accent',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
  danger: 'text-danger hover:bg-danger-soft',
}

const BUTTON_SIZES = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  icon: 'h-8 w-8 rounded-lg justify-center',
}

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex shrink-0 items-center font-medium transition-colors duration-100',
        'disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
})

/* ------------------------------------------------------------------ Card -- */

export function Card({ className, children, ...props }) {
  return (
    <div
      className={clsx('rounded-xl border border-line bg-surface', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, count, icon: Icon, action }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
      {Icon && <Icon size={14} className="shrink-0 text-ink-3" />}
      <div className="min-w-0 flex-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-ink-3">{subtitle}</p>}
      </div>
      {count !== undefined && (
        <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3">
          {count}
        </span>
      )}
      {action}
    </div>
  )
}

/* ----------------------------------------------------------------- Badge -- */

// Each source database gets a stable colour so it's recognisable at a glance
// across search results, saved items, and entity panels.
const SOURCE_VAR = {
  UniProt: '--src-uniprot',
  PDB: '--src-pdb',
  'NCBI Gene': '--src-ncbi',
  NCBI: '--src-ncbi',
  KEGG: '--src-kegg',
}

export function SourceBadge({ source, className }) {
  const varName = SOURCE_VAR[source]
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5',
        'text-[10px] font-semibold uppercase tracking-[0.04em]',
        'bg-surface-2',
        className,
      )}
      style={varName ? { color: `var(${varName})` } : undefined}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: varName ? `var(${varName})` : 'currentColor' }}
      />
      {source}
    </span>
  )
}

export function Chip({ className, children, ...props }) {
  const Tag = props.href ? 'a' : 'span'
  return (
    <Tag
      className={clsx(
        'inline-flex items-center rounded-md border border-line bg-surface px-2 py-1',
        'font-mono text-[11px] text-ink-2 transition-colors',
        props.href && 'hover:border-accent hover:text-accent',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

/* ----------------------------------------------------------------- Input -- */

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={clsx(
        'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink',
        'placeholder:text-ink-3',
        'transition-colors focus:border-accent focus:outline-none',
        className,
      )}
      {...props}
    />
  )
})

/* -------------------------------------------------------------- Skeleton -- */

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-md bg-surface-2', className)} />
}

/* ------------------------------------------------------------ EmptyState -- */

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2">
          <Icon size={17} className="text-ink-3" />
        </div>
      )}
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Layout -- */

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-line px-8 py-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-accent">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[22px] font-semibold leading-tight text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-2">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Scroller({ className, children }) {
  return (
    <div className={clsx('min-h-0 flex-1 overflow-y-auto', className)}>{children}</div>
  )
}
