import { useMemo, useState } from 'react'

/**
 * Six-frame ORF map.
 *
 * The alternative presentation is a table of start/end coordinates, which is
 * technically complete and nearly unreadable: the questions people actually
 * ask of ORF output are positional — which frame carries the long one, do any
 * overlap, is there anything on the reverse strand — and all three are
 * immediate in a track view and require mental arithmetic in a table.
 *
 * Six lanes, one per frame, ORFs drawn as bars at their forward-strand
 * coordinates. Forward-strand coordinates for both strands is the point: it's
 * what lets a reverse-strand ORF be compared against a forward one on a
 * shared axis.
 */

const FRAMES = [3, 2, 1, -1, -2, -3]

const LANE_H = 16
const GAP = 3
const AXIS_H = 18
// Frame labels live inside the SVG so they scale with it. Rendering them as
// HTML beside the chart drifts out of alignment: the SVG scales to container
// width, so its lanes are not LANE_H pixels tall on screen.
const GUTTER = 26

export function OrfMap({ orfs, length, onSelect, selectedIndex }) {
  const [hover, setHover] = useState(null)

  const byFrame = useMemo(() => {
    const m = new Map(FRAMES.map((f) => [f, []]))
    orfs.forEach((o, i) => m.get(o.frame)?.push({ ...o, i }))
    return m
  }, [orfs])

  const height = FRAMES.length * (LANE_H + GAP) + AXIS_H
  const W = 1000 // track width in viewBox units; scales to container width
  const x = (pos) => GUTTER + (pos / length) * W

  const ticks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(length / 5)))
    const s = length / step > 10 ? step * 2 : step
    const out = []
    for (let v = 0; v <= length; v += s) out.push(v)
    return out
  }, [length])

  return (
    <div>
      <svg viewBox={`0 0 ${W + GUTTER} ${height}`} className="w-full" style={{ minHeight: height }}>
        {FRAMES.map((f, row) => {
          const y = row * (LANE_H + GAP)
          const isReverse = f < 0
          return (
            <g key={f}>
              {/* lane background */}
              <text
                x={GUTTER - 6} y={y + LANE_H / 2} dy="0.34em"
                fontSize="9" fill="var(--text-3)" textAnchor="end"
                fontFamily="var(--font-mono)"
              >
                {f > 0 ? `+${f}` : f}
              </text>
              <rect
                x={GUTTER} y={y} width={W} height={LANE_H}
                fill="var(--surface-2)" rx="2"
              />
              {byFrame.get(f).map((o) => {
                const w = Math.max(x(o.end) - x(o.start), 2)
                const active = hover === o.i || selectedIndex === o.i
                return (
                  <g key={o.i}>
                    <rect
                      x={x(o.start - 1)} y={y + 2} width={w} height={LANE_H - 4}
                      rx="3"
                      fill={isReverse ? 'var(--res-charged)' : 'var(--res-hydrophobic)'}
                      opacity={active ? 1 : 0.8}
                      stroke={active ? 'var(--accent)' : 'none'}
                      strokeWidth="1.5"
                      className="cursor-pointer"
                      onMouseEnter={() => setHover(o.i)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => onSelect?.(o.i)}
                    />
                    {/* Direction arrow, only where the bar is wide enough to hold one */}
                    {w > 22 && (
                      <text
                        x={isReverse ? x(o.start - 1) + 5 : x(o.end) - 5}
                        y={y + LANE_H / 2}
                        dy="0.34em"
                        fontSize="9"
                        fill="var(--surface)"
                        textAnchor={isReverse ? 'start' : 'end'}
                        className="pointer-events-none"
                      >
                        {isReverse ? '◀' : '▶'}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Position axis */}
        <g transform={`translate(0 ${FRAMES.length * (LANE_H + GAP)})`}>
          <line x1={GUTTER} x2={GUTTER + W} y1={0} y2={0} stroke="var(--border)" strokeWidth="1" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={4} stroke="var(--border-strong)" strokeWidth="1" />
              <text
                x={x(t)} y={14} fontSize="9" fill="var(--text-3)"
                textAnchor={t === 0 ? 'start' : t >= length ? 'end' : 'middle'}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t.toLocaleString()}
              </text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 min-h-[18px] text-[11px] text-ink-2">
        {hover !== null && orfs[hover] ? (
          <>
            <span className="font-medium text-ink">Frame {orfs[hover].frame > 0 ? `+${orfs[hover].frame}` : orfs[hover].frame}</span>
            <span className="mx-1.5 text-ink-3">·</span>
            <span className="tnum">
              {orfs[hover].start.toLocaleString()}–{orfs[hover].end.toLocaleString()}
            </span>
            <span className="mx-1.5 text-ink-3">·</span>
            <span className="tnum">{orfs[hover].length_aa} aa</span>
            <span className="mx-1.5 text-ink-3">·</span>
            <span className="font-mono text-ink-3">{orfs[hover].protein.slice(0, 30)}…</span>
          </>
        ) : (
          <span className="text-ink-3">Hover a bar for detail · click to see its protein</span>
        )}
      </div>
    </div>
  )
}
