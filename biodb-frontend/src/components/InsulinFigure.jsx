import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { CLASS_LABEL, CLASS_OF, FULL_NAME } from '../lib/residues'

/**
 * Figure 1 on the landing page: human preproinsulin, drawn from its real
 * UniProt annotations (P01308) rather than as decoration.
 *
 * Insulin is chosen because its picture IS its biology: one 110-residue chain
 * that is cut into pieces, with the signal peptide and C peptide discarded and
 * the B and A chains held together only by disulfide bonds that arc across the
 * piece being removed. The "mature" toggle performs that cut.
 *
 * Every coordinate below was checked against UniProt, including that all six
 * bonded positions are cysteines.
 */

const SEQUENCE =
  'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN'

const REGIONS = [
  { name: 'Signal peptide', start: 1, end: 24, kept: false },
  { name: 'B chain', start: 25, end: 54, kept: true },
  { name: 'C peptide', start: 57, end: 87, kept: false },
  { name: 'A chain', start: 90, end: 110, kept: true },
]

// Peak heights are set per bond rather than computed: the two interchain
// bonds interleave (31 < 43 < 96 < 109), so their arcs must cross, and
// distinct heights keep the crossing legible.
const BONDS = [
  { a: 31, b: 96, lift: 78, label: 'C31–C96' },
  { a: 43, b: 109, lift: 56, label: 'C43–C109' },
  { a: 95, b: 100, lift: 20, label: '' },
]

const CLASS_VAR = {
  hydrophobic: '--res-hydrophobic',
  polar: '--res-polar',
  charged: '--res-charged',
  special: '--res-special',
}

const CELL = 10
const LEFT = 22
const ROW_Y = 94
const ROW_H = 22
const W = LEFT * 2 + SEQUENCE.length * CELL
const H = 168

const cx = (pos) => LEFT + (pos - 1) * CELL + CELL / 2
const bonded = new Set(BONDS.flatMap((b) => [b.a, b.b]))

function regionOf(pos) {
  return REGIONS.find((r) => pos >= r.start && pos <= r.end)
}

// Residues outside the B and A chains — including the dibasic cleavage sites
// between regions — are removed during maturation.
const isKept = (pos) => Boolean(regionOf(pos)?.kept)

function bondOf(pos) {
  const b = BONDS.find((x) => x.a === pos || x.b === pos)
  if (!b) return null
  return b.a === pos ? b.b : b.a
}

const DIM = 0.13
const fade = { transition: 'opacity 420ms ease' }

export function InsulinFigure() {
  const [hover, setHover] = useState(null)
  const [mature, setMature] = useState(false)

  const readout = (() => {
    if (hover === null) {
      return mature
        ? 'Mature insulin: B chain (30 aa) + A chain (21 aa) = 51 residues'
        : null
    }
    const ch = SEQUENCE[hover - 1]
    const region = regionOf(hover)
    const partner = bondOf(hover)
    return [
      `${ch}${hover}`,
      FULL_NAME[ch],
      region ? `${region.name}${region.kept ? '' : ' (cleaved)'}` : 'cleavage site',
      partner ? `disulfide to C${partner}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  })()

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <p className="m-0 flex items-baseline gap-3 font-mono text-[11px] text-ink-3">
            <span className="font-medium uppercase tracking-[0.14em] text-ink-2">Figure 1</span>
            <span>P01308 · INS_HUMAN</span>
            <span className="sm:hidden">· swipe →</span>
          </p>
          <div
            role="group"
            aria-label="Show insulin as"
            className="inline-flex rounded-lg border border-line bg-paper p-0.5 text-[12px]"
          >
            {[
              [false, 'Preproinsulin', '110 aa'],
              [true, 'Mature insulin', '51 aa'],
            ].map(([value, label, len]) => (
              <button
                key={label}
                type="button"
                aria-pressed={mature === value}
                onClick={() => setMature(value)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  mature === value
                    ? 'bg-surface font-medium text-ink shadow-sm'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {label} <span className="font-mono text-[10.5px] text-ink-3">{len}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full min-w-[760px]"
            role="img"
            aria-labelledby="fig1-title fig1-desc"
            onMouseLeave={() => setHover(null)}
          >
            <title id="fig1-title">Human preproinsulin, P01308</title>
            <desc id="fig1-desc">
              A 110-residue chain. Residues 1 to 24 are the signal peptide and 57 to 87 the C
              peptide, both cleaved. The B chain, 25 to 54, and A chain, 90 to 110, are retained
              and joined by disulfide bonds between cysteines 31 and 96, and 43 and 109. A third
              bond links cysteines 95 and 100 within the A chain.
            </desc>

            {/* Disulfide bonds — the only accent colour in the figure. */}
            {BONDS.map((b, i) => {
              const x1 = cx(b.a)
              const x2 = cx(b.b)
              const ctrl = ROW_Y - b.lift / 0.75
              const peak = ROW_Y - b.lift
              return (
                <g key={b.label || i}>
                  <path
                    d={`M ${x1} ${ROW_Y} C ${x1} ${ctrl} ${x2} ${ctrl} ${x2} ${ROW_Y}`}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="1.6"
                    pathLength="1"
                    className="fig-bond"
                    style={{ animationDelay: `${720 + i * 140}ms` }}
                  />
                  {b.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={peak}
                      dy="0.35em"
                      textAnchor="middle"
                      fontSize="9"
                      fill="var(--accent)"
                      stroke="var(--surface)"
                      strokeWidth="5"
                      paintOrder="stroke"
                      fontFamily="var(--font-mono)"
                      className="fig-fade"
                      style={{ animationDelay: `${1150 + i * 140}ms` }}
                    >
                      {b.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Residues */}
            {[...SEQUENCE].map((ch, idx) => {
              const pos = idx + 1
              const x = LEFT + idx * CELL
              const klass = CLASS_OF[ch]
              return (
                <g
                  key={pos}
                  className="fig-res"
                  style={{ animationDelay: `${idx * 5}ms` }}
                  onMouseEnter={() => setHover(pos)}
                  onClick={() => setHover(pos)}
                >
                  {/* Inner group so the maturation fade isn't fighting the entrance animation over opacity. */}
                  <g style={{ ...fade, opacity: mature && !isKept(pos) ? DIM : 1 }}>
                    <rect
                      x={x + 0.5}
                      y={ROW_Y}
                      width={CELL - 1}
                      height={ROW_H}
                      rx="1.5"
                      style={{
                        fill: `color-mix(in oklab, var(${CLASS_VAR[klass]}) ${hover === pos ? 60 : 30}%, transparent)`,
                      }}
                      stroke={bonded.has(pos) ? 'var(--accent)' : 'none'}
                      strokeWidth="1.1"
                    />
                    <text
                      x={x + CELL / 2}
                      y={ROW_Y + ROW_H / 2}
                      dy="0.35em"
                      textAnchor="middle"
                      fontSize="8.5"
                      fontFamily="var(--font-mono)"
                      fill="var(--text)"
                      className="pointer-events-none"
                    >
                      {ch}
                    </text>
                  </g>
                </g>
              )
            })}

            {/* Regions: solid = kept in mature insulin, dashed = cut away */}
            {REGIONS.map((r, i) => {
              const x1 = LEFT + (r.start - 1) * CELL + 1
              const x2 = LEFT + r.end * CELL - 1
              const y = ROW_Y + ROW_H + 10
              const ink = r.kept ? 'var(--text)' : 'var(--text-3)'
              return (
                <g key={r.name} className="fig-fade" style={{ animationDelay: `${520 + i * 60}ms` }}>
                  <g style={{ ...fade, opacity: mature && !r.kept ? DIM * 2 : 1 }}>
                    <path
                      d={`M ${x1} ${y - 5} V ${y} H ${x2} V ${y - 5}`}
                      fill="none"
                      stroke={ink}
                      strokeWidth={r.kept ? 1.4 : 1}
                      strokeDasharray={r.kept ? undefined : '3 3'}
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={y + 15}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight={r.kept ? 600 : 400}
                      fill={ink}
                      fontFamily="var(--font-sans)"
                    >
                      {r.name}
                    </text>
                    <text
                      x={(x1 + x2) / 2}
                      y={y + 28}
                      textAnchor="middle"
                      fontSize="8.5"
                      fill="var(--text-3)"
                      fontFamily="var(--font-mono)"
                    >
                      {r.start}–{r.end}
                      {r.kept ? '' : ' · cleaved'}
                    </text>
                  </g>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      <figcaption className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-10">
        <div>
          <p className="m-0 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-2">
            <span className="font-display font-semibold text-ink">Figure 1.</span> Human
            preproinsulin (UniProt P01308), drawn from its UniProt annotations. The signal peptide
            and C peptide are cut away during maturation; the B and A chains stay joined by the two
            disulfide bonds that arc across the piece being removed.
          </p>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[11.5px] text-ink-3">
            {Object.entries(CLASS_VAR).map(([klass, v]) => (
              <li key={klass} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ background: `color-mix(in oklab, var(${v}) 55%, transparent)` }}
                />
                {CLASS_LABEL[klass]}
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <span className="h-px w-3.5 bg-accent" />
              Disulfide bond
            </li>
          </ul>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <div
            className="min-h-[1.5em] font-mono text-[11.5px] text-ink-2 md:text-right"
            aria-live="polite"
          >
            {readout || <span className="text-ink-3">Hover a residue</span>}
          </div>
          <Link
            to="/lookup?q=INS"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:text-accent-hover"
          >
            Open P01308 in the workspace
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </figcaption>
    </figure>
  )
}
