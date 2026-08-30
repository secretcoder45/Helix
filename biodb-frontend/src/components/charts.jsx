import { useMemo, useState } from 'react'

/**
 * Small SVG chart primitives.
 *
 * Hand-rolled rather than pulling in a chart library: most of what this app
 * plots (sequence tracks, conservation strips, titration curves keyed to a
 * marked pI) isn't a standard chart type, so a library would be carried for a
 * couple of plots and still need custom work for the rest. Writing the SVG
 * directly also keeps the marks on the app's own design tokens, so they theme
 * correctly in both modes rather than needing a parallel theme config.
 */

// bottom reserves two rows: tick numbers, then the axis label beneath them.
const PAD = { top: 10, right: 12, bottom: 40, left: 42 }

/**
 * "Nice" axis ticks — round numbers at 1/2/2.5/5 x 10^k steps.
 *
 * Dividing the data range into N equal parts (the obvious approach) produces
 * axes labelled 10, 2, -5, -13, -21, which are technically correct and
 * unreadable: nobody estimates a value against a -13 gridline. Ticks should
 * land on numbers a reader already thinks in.
 */
function niceTicks(min, max, target = 5) {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min]
  const raw = (max - min) / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag
  const out = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    // Re-round to kill floating-point dust like 0.30000000000000004
    out.push(Number(v.toFixed(10)))
  }
  return out
}

function useScale(data, width, height, { yMin, yMax } = {}) {
  return useMemo(() => {
    const xs = data.map((d) => d.x)
    const ys = data.map((d) => d.y)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = yMin !== undefined ? yMin : Math.min(...ys)
    const y1 = yMax !== undefined ? yMax : Math.max(...ys)
    const iw = width - PAD.left - PAD.right
    const ih = height - PAD.top - PAD.bottom
    return {
      x: (v) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * iw,
      y: (v) => PAD.top + ih - ((v - y0) / (y1 - y0 || 1)) * ih,
      x0, x1, y0, y1, iw, ih,
    }
  }, [data, width, height, yMin, yMax])
}

/**
 * Line chart with a crosshair + tooltip. `zeroLine` draws a baseline at y=0
 * (meaningful for signed measures like net charge or hydropathy); `marker`
 * drops a labelled vertical rule at an x of interest.
 */
export function LineChart({
  data,
  width = 640,
  height = 200,
  yMin,
  yMax,
  color = 'var(--accent)',
  xLabel,
  yLabel,
  zeroLine = false,
  marker,
  formatX = (v) => v,
  formatY = (v) => v,
  fillArea = false,
}) {
  const s = useScale(data, width, height, { yMin, yMax })
  const [hoverI, setHoverI] = useState(null)

  const path = useMemo(
    () => data.map((d, i) => `${i ? 'L' : 'M'}${s.x(d.x).toFixed(2)},${s.y(d.y).toFixed(2)}`).join(' '),
    [data, s],
  )

  const areaPath = useMemo(() => {
    if (!fillArea) return null
    const base = s.y(Math.max(s.y0, Math.min(0, s.y1)))
    return `${path} L${s.x(data.at(-1).x).toFixed(2)},${base.toFixed(2)} L${s.x(data[0].x).toFixed(2)},${base.toFixed(2)} Z`
  }, [path, data, s, fillArea])

  const ticksY = useMemo(() => niceTicks(s.y0, s.y1, 4), [s])
  const ticksX = useMemo(() => niceTicks(s.x0, s.x1, 6), [s])

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * width
    const frac = (px - PAD.left) / s.iw
    const i = Math.round(frac * (data.length - 1))
    setHoverI(i >= 0 && i < data.length ? i : null)
  }

  const hovered = hoverI !== null ? data[hoverI] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverI(null)}
      >
        {/* Grid — recessive */}
        {ticksY.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left} x2={width - PAD.right}
              y1={s.y(t)} y2={s.y(t)}
              stroke="var(--border)" strokeWidth="1"
            />
            <text
              x={PAD.left - 6} y={s.y(t)} dy="0.32em"
              textAnchor="end" fontSize="9" fill="var(--text-3)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatY(t)}
            </text>
          </g>
        ))}
        {ticksX.map((t, i) => (
          <text
            key={i} x={s.x(t)} y={height - 26}
            textAnchor="middle" fontSize="9" fill="var(--text-3)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatX(t)}
          </text>
        ))}

        {zeroLine && s.y0 < 0 && s.y1 > 0 && (
          <line
            x1={PAD.left} x2={width - PAD.right}
            y1={s.y(0)} y2={s.y(0)}
            stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3"
          />
        )}

        {fillArea && <path d={areaPath} fill={color} opacity="0.12" />}
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

        {marker !== undefined && marker !== null && (
          <g>
            <line
              x1={s.x(marker.x)} x2={s.x(marker.x)}
              y1={PAD.top} y2={height - PAD.bottom}
              stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 3"
            />
            <text
              x={s.x(marker.x) + 5} y={PAD.top + 10}
              fontSize="10" fill="var(--accent)" fontWeight="600"
            >
              {marker.label}
            </text>
          </g>
        )}

        {hovered && (
          <g>
            <line
              x1={s.x(hovered.x)} x2={s.x(hovered.x)}
              y1={PAD.top} y2={height - PAD.bottom}
              stroke="var(--text-3)" strokeWidth="1"
            />
            {/* >=8px marker, with a 2px surface ring so it reads over the line */}
            <circle
              cx={s.x(hovered.x)} cy={s.y(hovered.y)} r="4.5"
              fill={color} stroke="var(--surface)" strokeWidth="2"
            />
          </g>
        )}

        {yLabel && (
          <text
            x={11} y={(height - PAD.bottom) / 2} fontSize="9" fill="var(--text-3)"
            textAnchor="middle" transform={`rotate(-90 11 ${(height - PAD.bottom) / 2})`}
          >
            {yLabel}
          </text>
        )}
        {xLabel && (
          <text x={width / 2} y={height - 8} fontSize="9" fill="var(--text-3)" textAnchor="middle">
            {xLabel}
          </text>
        )}
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute left-0 top-0 w-full">
          <div
            className="absolute -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[10px] shadow-pop"
            style={{ left: `${(s.x(hovered.x) / width) * 100}%`, top: 0 }}
          >
            <span className="tnum text-ink-3">{formatX(hovered.x)}</span>
            <span className="mx-1 text-ink-3">·</span>
            <span className="tnum font-medium text-ink">{formatY(hovered.y)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Horizontal bar chart — one series, one colour, values direct-labelled. */
export function BarChart({ data, height = 12, formatValue = (v) => v, colorOf }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="space-y-1">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right font-mono text-[11px] text-ink-2">{d.label}</span>
          <div className="relative min-w-0 flex-1">
            <div
              className="rounded-r-[4px]"
              style={{
                width: `${(d.value / max) * 100}%`,
                height,
                background: colorOf ? colorOf(d) : 'var(--accent)',
                minWidth: d.value > 0 ? 2 : 0,
              }}
            />
          </div>
          <span className="tnum w-12 shrink-0 text-right text-[10px] text-ink-3">
            {formatValue(d.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A single headline figure — the chart when the story is one number. */
export function StatTile({ label, value, unit, hint, tone }) {
  const toneClass =
    tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
      <p className={`tnum mt-1 text-[19px] font-semibold leading-none ${toneClass}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-[10px] leading-tight text-ink-3">{hint}</p>}
    </div>
  )
}
