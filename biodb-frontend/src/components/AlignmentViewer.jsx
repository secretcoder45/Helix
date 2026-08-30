import { useCallback, useMemo, useRef, useState } from 'react'
import { Palette } from 'lucide-react'
import { CLASS_OF, CLASS_LABEL, THREE_LETTER } from '../lib/residues'
import {
  COLUMN,
  MATCH_SYMBOL,
  COLUMN_STRENGTH,
  classifyAlignment,
  binStrengths,
} from '../lib/conservation'

/**
 * Alignment viewer.
 *
 * Two channels carrying two different things, never the same thing twice:
 *   - cell tint      — per-column agreement (or residue chemistry, by mode)
 *   - minimap strip  — where conserved regions sit across the WHOLE alignment
 *
 * The minimap isn't a redundant restatement of the cells: for an alignment
 * hundreds of columns long you cannot see every row at once, and "where are
 * the conserved blocks" is exactly the question the rows can't answer. It is
 * binned, not one mark per column, because a 1000-column profile drawn into a
 * 600px strip is moiré, not information.
 *
 * The Clustal match line stays in every mode. It is the non-colour encoding of
 * agreement, so conservation never rests on hue alone.
 */

const CLASS_VAR = {
  hydrophobic: '--res-hydrophobic',
  polar: '--res-polar',
  charged: '--res-charged',
  special: '--res-special',
}

const MODES = [
  { id: 'conservation', label: 'Conservation' },
  { id: 'class', label: 'Class' },
  { id: 'none', label: 'Plain' },
]

// Conservation is an ORDERED scale, so it gets an ordinal ramp: one hue at
// stepped strength, never separate categorical hues.
const CONSERVATION_ALPHA = {
  [COLUMN.IDENTICAL]: 34,
  [COLUMN.STRONG]: 20,
  [COLUMN.WEAK]: 10,
  [COLUMN.DIFFERENT]: 0,
  [COLUMN.GAP]: 0,
}

function cellStyle(ch, col, mode) {
  if (mode === 'none') return undefined
  if (mode === 'class') {
    const v = CLASS_OF[ch]
    return v
      ? { background: `color-mix(in oklab, var(${CLASS_VAR[v]}) 24%, transparent)` }
      : undefined
  }
  const a = CONSERVATION_ALPHA[col]
  if (!a) return undefined
  return { background: `color-mix(in oklab, var(--res-basic) ${a}%, transparent)` }
}

function Minimap({ columns, onScrubTo }) {
  const BINS = 180
  const bins = useMemo(() => binStrengths(columns, BINS), [columns])
  const ref = useRef(null)
  const [hoverBin, setHoverBin] = useState(null)

  const colsPerBin = columns.length / BINS

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Conservation across alignment
        </span>
        {hoverBin !== null && (
          <span className="tnum text-[10px] text-ink-3">
            col ~{Math.round(hoverBin * colsPerBin) + 1} · {Math.round(bins[hoverBin] * 100)}%
          </span>
        )}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${BINS} 24`}
        preserveAspectRatio="none"
        className="h-6 w-full cursor-pointer rounded border border-line bg-paper"
        onMouseLeave={() => setHoverBin(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHoverBin(Math.floor(((e.clientX - r.left) / r.width) * BINS))
        }}
        onClick={() => hoverBin !== null && onScrubTo?.(Math.round(hoverBin * colsPerBin))}
      >
        {bins.map((v, i) => (
          <rect
            key={i}
            x={i}
            y={24 - v * 24}
            width={1}
            height={Math.max(v * 24, v > 0 ? 1 : 0)}
            fill="var(--res-basic)"
            opacity={hoverBin === i ? 1 : 0.75}
          />
        ))}
      </svg>
    </div>
  )
}

export function AlignmentViewer({ result, label1 = 'Sequence 1', label2 = 'Sequence 2' }) {
  const [mode, setMode] = useState('conservation')
  const [hover, setHover] = useState(null)
  const scrollRef = useRef(null)

  const a = result.aligned_seq1
  const b = result.aligned_seq2
  const columns = useMemo(() => classifyAlignment(a, b), [a, b])

  // Local alignments start partway into each input; global ones start at 1.
  const startA = result.seq1_start ?? 1
  const startB = result.seq2_start ?? 1

  const WIDTH = 60
  const rows = useMemo(() => {
    const out = []
    let posA = startA
    let posB = startB
    for (let i = 0; i < a.length; i += WIDTH) {
      const sliceA = a.slice(i, i + WIDTH)
      const sliceB = b.slice(i, i + WIDTH)
      const row = {
        offset: i,
        a: sliceA,
        b: sliceB,
        startA: posA,
        startB: posB,
        endA: posA + [...sliceA].filter((c) => c !== '-').length - 1,
        endB: posB + [...sliceB].filter((c) => c !== '-').length - 1,
      }
      posA = row.endA + 1
      posB = row.endB + 1
      out.push(row)
    }
    return out
  }, [a, b, startA, startB])

  const onMove = useCallback((e) => {
    const el = e.target.closest('[data-c]')
    setHover(el ? Number(el.dataset.c) : null)
  }, [])

  const scrubTo = useCallback((col) => {
    const rowIndex = Math.floor(col / WIDTH)
    const el = scrollRef.current?.querySelector(`[data-row="${rowIndex}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const counts = useMemo(() => {
    const c = {}
    for (const col of columns) c[col] = (c[col] || 0) + 1
    return c
  }, [columns])

  const legend =
    mode === 'class'
      ? Object.entries(CLASS_VAR).map(([k, v]) => ({ v, label: CLASS_LABEL[k], alpha: 24 }))
      : mode === 'conservation'
        ? [
            { v: '--res-basic', label: `Identical (${counts[COLUMN.IDENTICAL] || 0})`, alpha: 34 },
            { v: '--res-basic', label: `Strongly similar (${counts[COLUMN.STRONG] || 0})`, alpha: 20 },
            { v: '--res-basic', label: `Weakly similar (${counts[COLUMN.WEAK] || 0})`, alpha: 10 },
          ]
        : []

  const hoverCol = hover !== null ? columns[hover] : null

  return (
    <div className="space-y-3">
      <Minimap columns={columns} onScrubTo={scrubTo} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {legend.map((it) => (
            <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-line"
                style={{ background: `color-mix(in oklab, var(${it.v}) ${it.alpha}%, transparent)` }}
              />
              {it.label}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Palette size={12} className="text-ink-3" />
          <div className="flex overflow-hidden rounded-lg border border-line">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                  mode === m.id ? 'bg-accent text-accent-contrast' : 'bg-surface text-ink-2 hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="max-h-96 select-none overflow-auto rounded-lg border border-line bg-paper p-3 font-mono text-[12px] leading-[1.5]"
      >
        <div className="w-max space-y-3">
          {rows.map((row, ri) => (
            <div key={row.offset} data-row={ri}>
              {/* seq 1 */}
              <div className="flex items-center gap-3">
                <span className="tnum w-10 shrink-0 text-right text-[10px] text-ink-3">
                  {row.startA}
                </span>
                <span className="flex">
                  {[...row.a].map((ch, j) => {
                    const c = row.offset + j
                    return (
                      <span
                        key={j}
                        data-c={c}
                        className={`inline-block w-[1.1ch] text-center ${
                          hover === c ? 'outline outline-1 outline-accent' : ''
                        } ${ch === '-' ? 'text-ink-3' : ''}`}
                        style={cellStyle(ch, columns[c], mode)}
                      >
                        {ch}
                      </span>
                    )
                  })}
                </span>
                <span className="tnum w-10 shrink-0 text-[10px] text-ink-3">{row.endA}</span>
              </div>

              {/* match line — the non-colour encoding of agreement */}
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0" />
                <span className="flex text-accent">
                  {[...row.a].map((_, j) => (
                    <span key={j} className="inline-block w-[1.1ch] text-center">
                      {MATCH_SYMBOL[columns[row.offset + j]]}
                    </span>
                  ))}
                </span>
                <span className="w-10 shrink-0" />
              </div>

              {/* seq 2 */}
              <div className="flex items-center gap-3">
                <span className="tnum w-10 shrink-0 text-right text-[10px] text-ink-3">
                  {row.startB}
                </span>
                <span className="flex">
                  {[...row.b].map((ch, j) => {
                    const c = row.offset + j
                    return (
                      <span
                        key={j}
                        data-c={c}
                        className={`inline-block w-[1.1ch] text-center ${
                          hover === c ? 'outline outline-1 outline-accent' : ''
                        } ${ch === '-' ? 'text-ink-3' : ''}`}
                        style={cellStyle(ch, columns[c], mode)}
                      >
                        {ch}
                      </span>
                    )
                  })}
                </span>
                <span className="tnum w-10 shrink-0 text-[10px] text-ink-3">{row.endB}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[20px] text-[11px] text-ink-2">
        {hover !== null ? (
          <>
            <span className="tnum font-medium text-ink">Column {hover + 1}</span>
            <span className="mx-1.5 text-ink-3">·</span>
            <span className="font-mono">{a[hover]}</span> / <span className="font-mono">{b[hover]}</span>
            {a[hover] !== '-' && THREE_LETTER[a[hover]] && (
              <span className="text-ink-3"> ({THREE_LETTER[a[hover]]}</span>
            )}
            {b[hover] !== '-' && THREE_LETTER[b[hover]] && (
              <span className="text-ink-3"> / {THREE_LETTER[b[hover]]})</span>
            )}
            <span className="mx-1.5 text-ink-3">·</span>
            {hoverCol === COLUMN.GAP
              ? 'gap'
              : hoverCol === COLUMN.IDENTICAL
                ? 'identical'
                : hoverCol === COLUMN.STRONG
                  ? 'strongly similar'
                  : hoverCol === COLUMN.WEAK
                    ? 'weakly similar'
                    : 'different'}
          </>
        ) : (
          <span className="text-ink-3">
            Hover a column for detail · click the strip above to jump to a region
          </span>
        )}
      </div>
    </div>
  )
}
