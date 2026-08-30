import { useMemo, useState } from 'react'

/**
 * Predicted agarose gel.
 *
 * Migration is plotted against log(size), which is how DNA actually runs: the
 * relationship is roughly linear in the log, which is why gels resolve small
 * fragments well and large ones poorly. A linear axis would put every large
 * fragment on top of every other and misrepresent what the experiment shows.
 *
 * A ladder lane is drawn alongside, because a band's position means nothing
 * without one — the whole point of a gel is reading sizes against a
 * reference.
 */

const LANE_W = 62
const GEL_H = 300
const TOP = 18
// Left gutter for the ladder's size labels; without it they anchor off-canvas.
const GUTTER = 34

export function VirtualGel({ lanes, ladder }) {
  const [hover, setHover] = useState(null)

  const allSizes = useMemo(
    () => [...ladder, ...lanes.flatMap((l) => l.fragments)].filter((s) => s > 0),
    [lanes, ladder],
  )
  const maxSize = Math.max(...allSizes)
  const minSize = Math.min(...allSizes)

  // log scale: large fragments near the well, small ones run far
  const y = (size) => {
    const lo = Math.log10(Math.max(minSize, 1))
    const hi = Math.log10(maxSize)
    const t = (Math.log10(Math.max(size, 1)) - lo) / (hi - lo || 1)
    return TOP + (1 - t) * (GEL_H - TOP - 20)
  }

  const allLanes = [{ name: 'Ladder', fragments: ladder, isLadder: true }, ...lanes]
  const width = GUTTER + allLanes.length * LANE_W + 10

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${GEL_H}`} style={{ width, height: GEL_H }}>
        <rect x="0" y="0" width={width} height={GEL_H} fill="var(--surface-2)" rx="4" />

        {allLanes.map((lane, li) => {
          const x = GUTTER + li * LANE_W + 8
          return (
            <g key={lane.name}>
              {/* well */}
              <rect
                x={x} y={TOP - 10} width={LANE_W - 14} height="5"
                fill="var(--surface-3)" rx="1"
              />
              <text
                x={x + (LANE_W - 14) / 2} y={GEL_H - 6}
                fontSize="9" fill="var(--text-3)" textAnchor="middle"
              >
                {lane.name}
              </text>

              {lane.fragments.map((size, i) => {
                const key = `${li}-${i}`
                // Band intensity tracks mass, not count: a large fragment
                // binds more stain, so it looks brighter on a real gel.
                const intensity = 0.35 + 0.6 * (Math.log10(size) / Math.log10(maxSize))
                return (
                  <g key={key}>
                    <rect
                      x={x} y={y(size) - 2} width={LANE_W - 14} height="3.5"
                      rx="1.5"
                      fill={lane.isLadder ? 'var(--text-3)' : 'var(--res-hydrophobic)'}
                      opacity={hover === key ? 1 : intensity}
                      onMouseEnter={() => setHover(key)}
                      onMouseLeave={() => setHover(null)}
                      className="cursor-pointer"
                    />
                    {lane.isLadder && (
                      <text
                        x={x - 3} y={y(size)} dy="0.32em"
                        fontSize="8" fill="var(--text-3)" textAnchor="end"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {size >= 1000 ? `${size / 1000}k` : size}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      <div className="mt-1.5 min-h-[16px] text-[11px] text-ink-2">
        {hover ? (
          (() => {
            const [li, i] = hover.split('-').map(Number)
            const lane = allLanes[li]
            return (
              <>
                <span className="font-medium text-ink">{lane.name}</span>
                <span className="mx-1.5 text-ink-3">·</span>
                <span className="tnum">{lane.fragments[i].toLocaleString()} bp</span>
              </>
            )
          })()
        ) : (
          <span className="text-ink-3">
            Migration plotted against log(size), as DNA actually runs · hover a band for its size
          </span>
        )}
      </div>
    </div>
  )
}

/** Linear map of cut positions along the sequence. */
export function RestrictionMap({ length, cutters, circular }) {
  const [hover, setHover] = useState(null)
  const W = 900
  const rowH = 22
  const height = cutters.length * rowH + 34
  const x = (p) => 70 + (p / length) * (W - 90)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} style={{ minWidth: 520, width: '100%' }}>
        {cutters.map((c, i) => {
          const y = i * rowH + 12
          return (
            <g key={c.enzyme}>
              <text
                x={64} y={y} dy="0.34em" fontSize="10" textAnchor="end"
                fill="var(--text-2)" fontFamily="var(--font-mono)"
              >
                {c.enzyme}
              </text>
              <line
                x1={x(0)} x2={x(length)} y1={y} y2={y}
                stroke="var(--border)" strokeWidth="1"
              />
              {c.cuts.map((p) => (
                <g key={p}>
                  <line
                    x1={x(p)} x2={x(p)} y1={y - 6} y2={y + 6}
                    stroke={hover === `${c.enzyme}-${p}` ? 'var(--accent)' : 'var(--res-charged)'}
                    strokeWidth="2"
                    className="cursor-pointer"
                    onMouseEnter={() => setHover(`${c.enzyme}-${p}`)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              ))}
            </g>
          )
        })}

        {/* position axis */}
        <g transform={`translate(0 ${cutters.length * rowH + 8})`}>
          <line x1={x(0)} x2={x(length)} y1={0} y2={0} stroke="var(--border-strong)" strokeWidth="1" />
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={x(f * length)} x2={x(f * length)} y1={0} y2={4} stroke="var(--border-strong)" />
              <text
                x={x(f * length)} y={15} fontSize="9" fill="var(--text-3)"
                textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {Math.round(f * length).toLocaleString()}
              </text>
            </g>
          ))}
          <text x={x(length) + 6} y={15} fontSize="9" fill="var(--text-3)">
            bp{circular ? ' (circular)' : ''}
          </text>
        </g>
      </svg>

      <div className="mt-1 min-h-[16px] text-[11px] text-ink-2">
        {hover ? (
          <span className="tnum">
            {hover.split('-')[0]} cuts at {Number(hover.split('-')[1]).toLocaleString()}
          </span>
        ) : (
          <span className="text-ink-3">Hover a cut mark for its position</span>
        )}
      </div>
    </div>
  )
}
