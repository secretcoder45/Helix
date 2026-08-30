import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Dot plot — a sequence-vs-sequence comparison matrix.
 *
 * This is the one comparison that genuinely cannot be a table or an
 * alignment: repeats show as parallel diagonals, inversions as
 * perpendicular ones, and insertions as diagonal breaks. A pairwise
 * alignment collapses all of that into a single best path and discards the
 * rest, which is exactly the information a dot plot exists to keep.
 *
 * Rendered to Canvas, not SVG. A 1000x1000 comparison is a million cells;
 * as DOM nodes that locks the page, and the marks carry no interaction of
 * their own — the interaction is on the plot as a whole.
 */

function computeMatrix(a, b, windowSize, threshold) {
  const n = a.length
  const m = b.length
  const half = Math.floor(windowSize / 2)
  const points = []

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      let matches = 0
      let counted = 0
      for (let k = -half; k <= half; k++) {
        const ai = i + k
        const bj = j + k
        if (ai < 0 || bj < 0 || ai >= n || bj >= m) continue
        counted++
        if (a[ai] === b[bj]) matches++
      }
      if (counted && matches >= threshold) points.push([i, j, matches / counted])
    }
  }
  return points
}

export function DotPlot({ seqA, seqB, labelA, labelB, windowSize, threshold }) {
  const canvasRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [size, setSize] = useState(560)

  const points = useMemo(
    () => computeMatrix(seqA, seqB, windowSize, threshold),
    [seqA, seqB, windowSize, threshold],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const css = getComputedStyle(document.documentElement)
    const surface = css.getPropertyValue('--paper').trim() || '#fff'
    const ink = css.getPropertyValue('--res-hydrophobic').trim() || '#2a78d6'

    ctx.fillStyle = surface
    ctx.fillRect(0, 0, size, size)

    const sx = size / seqA.length
    const sy = size / seqB.length
    // At least one device pixel, so a long sequence doesn't render invisibly.
    const w = Math.max(sx, 1 / dpr)
    const h = Math.max(sy, 1 / dpr)

    ctx.fillStyle = ink
    for (const [i, j, strength] of points) {
      ctx.globalAlpha = 0.35 + 0.65 * strength
      ctx.fillRect(i * sx, j * sy, w, h)
    }
    ctx.globalAlpha = 1
  }, [points, seqA.length, seqB.length, size])

  useEffect(() => {
    const onResize = () => {
      const el = canvasRef.current?.parentElement
      if (el) setSize(Math.min(el.clientWidth, 620))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor(((e.clientX - r.left) / r.width) * seqA.length)
    const j = Math.floor(((e.clientY - r.top) / r.height) * seqB.length)
    if (i >= 0 && j >= 0 && i < seqA.length && j < seqB.length) setHover([i, j])
    else setHover(null)
  }

  const density = ((100 * points.length) / (seqA.length * seqB.length)).toFixed(2)
  const empty = points.length === 0

  return (
    <div>
      <div className="flex gap-2">
        {/* y-axis label, rotated alongside the plot */}
        <div className="flex w-5 shrink-0 items-center justify-center">
          <span className="whitespace-nowrap text-[10px] text-ink-3" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            {labelB} · {seqB.length}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <canvas
              ref={canvasRef}
              style={{ width: size, height: size }}
              className="cursor-crosshair rounded-lg border border-line"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
            {/* An empty plot and a broken plot look identical, so say which
                this is rather than leaving a blank square. */}
            {empty && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                <p className="max-w-xs text-center text-[12px] leading-relaxed text-ink-3">
                  No window reaches {threshold} of {windowSize} matches. These two sequences have
                  no stretch that similar — lower the threshold to see weaker signal.
                </p>
              </div>
            )}
          </div>
          <p className="mt-1 text-center text-[10px] text-ink-3">
            {labelA} · {seqA.length}
          </p>
        </div>
      </div>

      <div className="mt-2 min-h-[18px] text-[11px] text-ink-2">
        {hover ? (
          <>
            <span className="tnum">
              {labelA} {hover[0] + 1} · {labelB} {hover[1] + 1}
            </span>
            <span className="mx-1.5 text-ink-3">·</span>
            <span className="font-mono">
              {seqA[hover[0]]} / {seqB[hover[1]]}
            </span>
          </>
        ) : (
          <span className="text-ink-3">
            <span className="tnum">{points.length.toLocaleString()}</span> points ({density}% of
            the matrix) · a solid main diagonal means the sequences are colinear
          </span>
        )}
      </div>
    </div>
  )
}
