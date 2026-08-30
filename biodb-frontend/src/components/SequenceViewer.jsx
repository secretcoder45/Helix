import { useCallback, useMemo, useRef, useState } from 'react'
import { Copy, Check, Palette, X } from 'lucide-react'
import {
  CLASS_OF,
  CLASS_LABEL,
  CHARGE_OF,
  THREE_LETTER,
  FULL_NAME,
  KD_HYDROPATHY,
  classComposition,
  isNucleotideSequence,
} from '../lib/residues'

/**
 * Interactive sequence viewer — the shared primitive every sequence-bearing
 * tool renders through.
 *
 * Replaces a plain <pre> block. The point isn't decoration: property colouring
 * makes hydrophobic patches and charged runs visible as shapes, which is how
 * sequences are actually read, and which monospace text cannot show at all.
 *
 * Colour modes match the structure of what they encode rather than defaulting
 * everything to "categorical":
 *   - Class  — categorical (4 validated hues; see index.css for the gate)
 *   - Charge — diverging, because charge is a polarity: acidic <- neutral -> basic
 *   - None   — plain, for reading the letters unaided
 *
 * Hydropathy is deliberately absent: it is also a polarity (-4.5..+4.5 about
 * zero), so colouring it would need a second diverging pair and would collide
 * with charge. It belongs in a Kyte-Doolittle line plot, not here.
 */

const MODES = [
  { id: 'class', label: 'Class' },
  { id: 'charge', label: 'Charge' },
  { id: 'none', label: 'Plain' },
]

const CLASS_VAR = {
  hydrophobic: '--res-hydrophobic',
  polar: '--res-polar',
  charged: '--res-charged',
  special: '--res-special',
}

// Returns [cssVar, alpha]. Neutral carries a fainter tint than the poles: a
// diverging scale should show its midpoint (and the legend names it), but
// ~80% of residues are uncharged, so tinting them at full strength would
// drown out the charged ones the mode exists to reveal.
function cellColor(residue, mode) {
  if (mode === 'none') return null
  if (mode === 'charge') {
    const q = CHARGE_OF[residue]
    if (q === undefined) return CLASS_OF[residue] ? ['--res-neutral', 14] : null
    return [q < 0 ? '--res-acidic' : '--res-basic', 30]
  }
  const klass = CLASS_OF[residue]
  return klass ? [CLASS_VAR[klass], 24] : null
}

function Legend({ mode }) {
  if (mode === 'none') return null

  const items =
    mode === 'charge'
      ? [
          { v: '--res-acidic', label: 'Acidic (−)', hint: 'Asp, Glu' },
          { v: '--res-neutral', label: 'Neutral', hint: '' },
          { v: '--res-basic', label: 'Basic (+)', hint: 'Lys, Arg, His' },
        ]
      : Object.entries(CLASS_VAR).map(([klass, v]) => ({
          v,
          label: CLASS_LABEL[klass],
          hint: '',
        }))

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
            style={{ background: `var(${it.v})` }}
          />
          {it.label}
          {it.hint && <span className="text-ink-3">({it.hint})</span>}
        </span>
      ))}
    </div>
  )
}

function CompositionBar({ sequence }) {
  const parts = useMemo(() => classComposition(sequence).filter((p) => p.count > 0), [sequence])
  if (!parts.length) return null

  return (
    <div>
      {/* A 2px surface gap between segments, per the mark spec — adjacent
          fills shouldn't touch. */}
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p) => (
          <span
            key={p.klass}
            title={`${CLASS_LABEL[p.klass]}: ${p.count} (${p.pct.toFixed(1)}%)`}
            style={{ width: `${p.pct}%`, background: `var(${CLASS_VAR[p.klass]})` }}
            className="first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {parts.map((p) => (
          <span key={p.klass} className="text-[10px] text-ink-3">
            <span className="tnum font-medium text-ink-2">{p.pct.toFixed(0)}%</span>{' '}
            {CLASS_LABEL[p.klass].replace(' (Gly/Pro)', '')}
          </span>
        ))}
      </div>
    </div>
  )
}

export function SequenceViewer({
  sequence,
  label = 'Sequence',
  accession,
  onSelectionToTray,
  defaultMode = 'class',
  compact = false,
}) {
  const clean = useMemo(() => (sequence || '').toUpperCase().replace(/\s/g, ''), [sequence])
  const isNucleotide = useMemo(() => isNucleotideSequence(clean), [clean])
  const [mode, setMode] = useState(isNucleotide ? 'none' : defaultMode)
  const [hover, setHover] = useState(null)
  const [selection, setSelection] = useState(null)
  const dragRef = useRef(null)
  const [copied, setCopied] = useState(false)

  // Event delegation rather than per-residue handlers: a 1800-residue protein
  // would otherwise attach thousands of listeners.
  const indexFromEvent = useCallback((e) => {
    const el = e.target.closest('[data-i]')
    return el ? Number(el.dataset.i) : null
  }, [])

  const onMove = useCallback(
    (e) => {
      const i = indexFromEvent(e)
      if (i === null) return
      setHover(i)
      if (dragRef.current !== null) {
        setSelection({ start: Math.min(dragRef.current, i), end: Math.max(dragRef.current, i) })
      }
    },
    [indexFromEvent],
  )

  const onDown = useCallback(
    (e) => {
      const i = indexFromEvent(e)
      if (i === null) return
      dragRef.current = i
      setSelection({ start: i, end: i })
    },
    [indexFromEvent],
  )

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  const ROW = 60
  const BLOCK = 10
  const rows = useMemo(() => {
    const out = []
    for (let start = 0; start < clean.length; start += ROW) {
      const blocks = []
      for (let b = start; b < Math.min(start + ROW, clean.length); b += BLOCK) {
        const cells = []
        for (let i = b; i < Math.min(b + BLOCK, clean.length); i++) {
          cells.push({ ch: clean[i], i })
        }
        blocks.push(cells)
      }
      out.push({ start, blocks })
    }
    return out
  }, [clean])

  const selected =
    selection && selection.end > selection.start
      ? clean.slice(selection.start, selection.end + 1)
      : null

  const copySelection = async () => {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!clean) return null

  const hoverResidue = hover !== null ? clean[hover] : null

  return (
    <div>
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Legend mode={mode} />
        <div className="flex shrink-0 items-center gap-1.5">
          <Palette size={12} className="text-ink-3" />
          <div className="flex overflow-hidden rounded-lg border border-line">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                disabled={isNucleotide && m.id !== 'none'}
                title={
                  isNucleotide && m.id !== 'none'
                    ? 'Residue colouring applies to protein sequences'
                    : undefined
                }
                className={`px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-35 ${
                  mode === m.id
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-surface text-ink-2 hover:text-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sequence grid.
          Fixed 60 residues per row, grouped in blocks of 10, with the starting
          position on each row — the standard layout, and the reason is
          practical: positions line up vertically between rows, so you can
          count to a residue by eye instead of hovering. Reflowing to container
          width (the obvious approach) destroys that alignment. */}
      <div
        onMouseMove={onMove}
        onMouseDown={onDown}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          setHover(null)
          endDrag()
        }}
        className={`select-none overflow-auto rounded-lg border border-line bg-paper p-3 font-mono text-[12px] leading-[1.75] ${
          compact ? 'max-h-40' : 'max-h-80'
        }`}
      >
        <div className="w-max">
          {rows.map((row) => (
            <div key={row.start} className="flex items-center gap-3">
              <span className="tnum w-10 shrink-0 select-none text-right text-[10px] text-ink-3">
                {row.start + 1}
              </span>
              <span className="flex gap-2">
                {row.blocks.map((block, bi) => (
                  <span key={bi} className="flex">
                    {block.map(({ ch, i }) => {
                      const v = cellColor(ch, mode)
                      const inSel = selection && i >= selection.start && i <= selection.end
                      return (
                        <span
                          key={i}
                          data-i={i}
                          className={`inline-block w-[1.1ch] cursor-text text-center ${
                            inSel ? 'bg-accent/25' : ''
                          } ${hover === i ? 'outline outline-1 outline-accent' : ''}`}
                          style={
                            v && !inSel
                              ? {
                                  // Low-alpha tint: ink stays the text colour,
                                  // so contrast is set by the ink, not the hue.
                                  background: `color-mix(in oklab, var(${v[0]}) ${v[1]}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {ch}
                        </span>
                      )
                    })}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Readout: hover detail + selection, in one fixed-height row so the
          layout doesn't jump as the pointer moves. */}
      <div className="mt-2 flex min-h-[26px] flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="text-ink-2">
          {hoverResidue ? (
            <>
              <span className="tnum font-medium text-ink">{hover + 1}</span>
              <span className="mx-1.5 text-ink-3">·</span>
              <span className="font-mono font-medium text-ink">{hoverResidue}</span>
              {!isNucleotide && THREE_LETTER[hoverResidue] && (
                <>
                  <span className="mx-1.5 text-ink-3">·</span>
                  {FULL_NAME[hoverResidue]}
                  <span className="mx-1.5 text-ink-3">·</span>
                  {CLASS_LABEL[CLASS_OF[hoverResidue]]}
                  {CHARGE_OF[hoverResidue] !== undefined && (
                    <span className="text-ink-3">
                      {' '}
                      · {CHARGE_OF[hoverResidue] > 0 ? '+1' : '−1'}
                      {hoverResidue === 'H' ? ' (weak)' : ''}
                    </span>
                  )}
                  <span className="mx-1.5 text-ink-3">·</span>
                  <span className="tnum text-ink-3">
                    KD {KD_HYDROPATHY[hoverResidue] > 0 ? '+' : ''}
                    {KD_HYDROPATHY[hoverResidue]}
                  </span>
                </>
              )}
            </>
          ) : (
            <span className="text-ink-3">
              Hover a residue for detail · drag to select a region
            </span>
          )}
        </div>

        {selected && (
          <div className="flex items-center gap-1.5">
            <span className="tnum text-ink-2">
              {selection.start + 1}–{selection.end + 1} ({selected.length} aa)
            </span>
            <button
              onClick={copySelection}
              className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? <Check size={10} className="text-ok" /> : <Copy size={10} />}
              Copy
            </button>
            {onSelectionToTray && (
              <button
                onClick={() =>
                  onSelectionToTray({
                    id: `${accession || label}:${selection.start + 1}-${selection.end + 1}`,
                    label: `${label} ${selection.start + 1}–${selection.end + 1}`,
                    sublabel: `${selected.length} aa region`,
                    sequence: selected,
                    type: isNucleotide ? 'dna' : 'protein',
                    source: accession || '',
                  })
                }
                className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
              >
                Send region to tray
              </button>
            )}
            <button
              onClick={() => setSelection(null)}
              className="rounded-md p-0.5 text-ink-3 transition-colors hover:text-danger"
            >
              <X size={11} />
            </button>
          </div>
        )}
      </div>

      {!isNucleotide && !compact && (
        <div className="mt-3 border-t border-line pt-3">
          <CompositionBar sequence={clean} />
        </div>
      )}
    </div>
  )
}
