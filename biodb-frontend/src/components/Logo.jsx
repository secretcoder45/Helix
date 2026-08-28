/**
 * Wordmark + mark. The mark is a stylised double helix drawn as two phase-
 * shifted sine paths with connecting rungs — literal enough to read as
 * "genomics" at 20px, abstract enough not to look like clip art.
 */

export function LogoMark({ size = 22, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8 2c0 4.5 8 5.5 8 10s-8 5.5-8 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M16 2c0 4.5-8 5.5-8 10s8 5.5 8 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M9.4 6.5h5.2M9.4 17.5h5.2M8.2 9.6h7.6M8.2 14.4h7.6"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  )
}

export function Logo({ collapsed = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-contrast">
        <LogoMark size={19} />
      </span>
      {!collapsed && (
        <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
          Helix
        </span>
      )}
    </div>
  )
}
