import { useMemo, useState } from 'react'

/**
 * Protein feature map.
 *
 * A linear overview of the whole chain rather than annotations inline with
 * the sequence: the sequence viewer wraps at 60 residues per row, so a
 * continuous track can't align with it. Two views answer different questions
 * anyway — the map says "where is the kinase domain", the viewer says "what
 * are the residues there" — and clicking a feature here jumps the viewer to
 * that region.
 *
 * Features are grouped into four bands, matching the four validated
 * categorical hues: topology, domains, sites, modifications.
 */

const GROUPS = [
  { id: 'topology', label: 'Topology', v: '--res-hydrophobic' },
  { id: 'domain', label: 'Domains', v: '--res-polar' },
  { id: 'site', label: 'Sites', v: '--res-charged' },
  { id: 'modification', label: 'Modifications', v: '--res-special' },
]

const ROW_H = 15
const GAP = 4
const AXIS_H = 20
const GUTTER = 92

export function FeatureTrack({ features, length, onSelectRegion }) {
  const [hover, setHover] = useState(null)

  const byGroup = useMemo(() => {
    const m = new Map(GROUPS.map((g) => [g.id, []]))
    features.forEach((f, i) => m.get(f.group)?.push({ ...f, i }))
    return m
  }, [features])

  const activeGroups = GROUPS.filter((g) => byGroup.get(g.id).length > 0)
  if (!activeGroups.length) return null

  const W = 1000
  const height = activeGroups.length * (ROW_H + GAP) + AXIS_H
  const x = (p) => GUTTER + ((p - 1) / Math.max(length - 1, 1)) * (W - GUTTER - 12)

  const ticks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(length / 4)))
    const s = length / step > 8 ? step * 2 : step
    const out = []
    for (let v = 0; v <= length; v += s) out.push(v)
    return out
  }, [length])

  const hovered = hover !== null ? features[hover] : null

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ minHeight: height }}>
        {activeGroups.map((g, row) => {
          const y = row * (ROW_H + GAP)
          const items = byGroup.get(g.id)
          return (
            <g key={g.id}>
              <text
                x={GUTTER - 8} y={y + ROW_H / 2} dy="0.34em"
                fontSize="9" fill="var(--text-3)" textAnchor="end"
              >
                {g.label}
              </text>
              <rect
                x={GUTTER} y={y + ROW_H / 2 - 1}
                width={W - GUTTER - 12} height="2"
                fill="var(--border)" rx="1"
              />
              {items.map((f) => {
                // Point features (a modified residue, an active site) would be
                // sub-pixel at protein scale, so they get a minimum width —
                // otherwise the most precise annotations are the invisible ones.
                const w = Math.max(x(f.end) - x(f.start), 3)
                const active = hover === f.i
                return (
                  <rect
                    key={f.i}
                    x={x(f.start)} y={y + 2}
                    width={w} height={ROW_H - 4}
                    rx="2"
                    fill={`var(${g.v})`}
                    opacity={active ? 1 : 0.75}
                    stroke={active ? 'var(--accent)' : 'none'}
                    strokeWidth="1.5"
                    className="cursor-pointer"
                    onMouseEnter={() => setHover(f.i)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelectRegion?.(f)}
                  />
                )
              })}
            </g>
          )
        })}

        <g transform={`translate(0 ${activeGroups.length * (ROW_H + GAP)})`}>
          <line x1={GUTTER} x2={W - 12} y1={0} y2={0} stroke="var(--border)" strokeWidth="1" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t || 1)} x2={x(t || 1)} y1={0} y2={4} stroke="var(--border-strong)" />
              <text
                x={x(t || 1)} y={14} fontSize="9" fill="var(--text-3)"
                textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t}
              </text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-1 min-h-[18px] text-[11px] text-ink-2">
        {hovered ? (
          <>
            <span className="font-medium text-ink">{hovered.type}</span>
            <span className="mx-1.5 text-ink-3">·</span>
            <span className="tnum">
              {hovered.start === hovered.end
                ? hovered.start
                : `${hovered.start}–${hovered.end}`}
            </span>
            {hovered.description && (
              <>
                <span className="mx-1.5 text-ink-3">·</span>
                <span className="text-ink-3">{hovered.description}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-ink-3">
            Hover a feature for detail · click to select that region in the sequence
          </span>
        )}
      </div>
    </div>
  )
}
