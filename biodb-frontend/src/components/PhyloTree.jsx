import { useMemo, useState } from 'react'

/**
 * Rectangular dendrogram.
 *
 * Branch lengths are drawn to scale — a tree with uniform branches would be
 * a cladogram, showing topology but discarding how far apart things actually
 * are, which is most of what a distance tree has to say.
 */

const ROW_H = 26
const PAD = { top: 14, right: 130, bottom: 26, left: 10 }

function layout(node, depth = 0, state = { y: 0 }) {
  // Post-order: children get y positions first, parent sits at their midpoint.
  if (!node.children?.length) {
    const leaf = { ...node, depth: depth + node.length, y: state.y * ROW_H, isLeaf: true }
    state.y += 1
    return leaf
  }
  const kids = node.children.map((c) => layout(c, depth + node.length, state))
  return {
    ...node,
    depth: depth + node.length,
    y: (kids[0].y + kids[kids.length - 1].y) / 2,
    children: kids,
    isLeaf: false,
  }
}

function flatten(node, out = []) {
  out.push(node)
  node.children?.forEach((c) => flatten(c, out))
  return out
}

export function PhyloTree({ tree, method, onSelectLeaf }) {
  const [hover, setHover] = useState(null)

  const { root, nodes, leaves, maxDepth } = useMemo(() => {
    const r = layout(tree)
    const all = flatten(r)
    return {
      root: r,
      nodes: all,
      leaves: all.filter((n) => n.isLeaf),
      maxDepth: Math.max(...all.map((n) => n.depth)),
    }
  }, [tree])

  const height = leaves.length * ROW_H + PAD.top + PAD.bottom
  const W = 620
  const plotW = W - PAD.left - PAD.right
  const x = (d) => PAD.left + (maxDepth ? (d / maxDepth) * plotW : 0)

  const scaleTicks = useMemo(() => {
    const step = Math.pow(10, Math.floor(Math.log10(maxDepth / 3 || 0.1)))
    const s = maxDepth / step > 6 ? step * 2 : step
    const out = []
    for (let v = 0; v <= maxDepth + 1e-9; v += s) out.push(Number(v.toFixed(6)))
    return out
  }, [maxDepth])

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ minHeight: height }}>
        {nodes.map((n, i) => {
          if (n.isLeaf) return null
          const ys = n.children.map((c) => c.y + PAD.top)
          return (
            <g key={`v${i}`}>
              {/* vertical connector spanning this node's children */}
              <line
                x1={x(n.depth)} x2={x(n.depth)}
                y1={Math.min(...ys)} y2={Math.max(...ys)}
                stroke="var(--border-strong)" strokeWidth="1.5"
              />
              {n.children.map((c, ci) => (
                <line
                  key={ci}
                  x1={x(n.depth)} x2={x(c.depth)}
                  y1={c.y + PAD.top} y2={c.y + PAD.top}
                  stroke="var(--border-strong)" strokeWidth="1.5"
                />
              ))}
            </g>
          )
        })}

        {leaves.map((n, i) => (
          <g
            key={`l${i}`}
            className="cursor-pointer"
            onMouseEnter={() => setHover(n.name)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelectLeaf?.(n.name)}
          >
            <circle
              cx={x(n.depth)} cy={n.y + PAD.top} r="3.5"
              fill={hover === n.name ? 'var(--accent)' : 'var(--res-hydrophobic)'}
              stroke="var(--surface)" strokeWidth="2"
            />
            <text
              x={x(n.depth) + 8} y={n.y + PAD.top} dy="0.34em"
              fontSize="11"
              fill={hover === n.name ? 'var(--accent)' : 'var(--text)'}
              fontFamily="var(--font-mono)"
            >
              {n.name}
            </text>
          </g>
        ))}

        {/* Distance scale — without it the branch lengths are decoration */}
        <g transform={`translate(0 ${height - PAD.bottom + 6})`}>
          <line x1={PAD.left} x2={x(maxDepth)} y1={0} y2={0} stroke="var(--border)" strokeWidth="1" />
          {scaleTicks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={4} stroke="var(--border-strong)" strokeWidth="1" />
              <text
                x={x(t)} y={14} fontSize="9" fill="var(--text-3)" textAnchor="middle"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {t.toFixed(2)}
              </text>
            </g>
          ))}
          <text x={x(maxDepth) + 8} y={14} fontSize="9" fill="var(--text-3)">
            substitutions per site
          </text>
        </g>
      </svg>

      {method === 'nj' && (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
          Neighbour-joining produces an <em className="not-italic font-medium">unrooted</em> tree.
          It's drawn from an arbitrary point here, so read the groupings and branch lengths — not
          the root as a common ancestor. UPGMA is rooted, but only under a molecular-clock
          assumption.
        </p>
      )}
    </div>
  )
}

/** Distance matrix as a heatmap — one hue, light to dark, since distance is magnitude. */
export function DistanceHeatmap({ matrix, names }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(...matrix.flat(), 0.0001)

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[11px]">
        <thead>
          <tr>
            <th />
            {names.map((n) => (
              <th
                key={n}
                className="px-1 pb-1 text-left font-mono text-[9px] font-normal text-ink-3"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 72 }}
              >
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap pr-2 text-right font-mono text-[10px] text-ink-3">
                {names[i]}
              </td>
              {row.map((v, j) => (
                <td key={j} className="p-[1px]">
                  <div
                    onMouseEnter={() => setHover([i, j])}
                    onMouseLeave={() => setHover(null)}
                    title={`${names[i]} vs ${names[j]}: ${(100 * (1 - v)).toFixed(1)}% identity`}
                    className="flex h-7 w-9 cursor-default items-center justify-center rounded-[3px]"
                    style={{
                      background:
                        i === j
                          ? 'var(--surface-2)'
                          : `color-mix(in oklab, var(--res-hydrophobic) ${Math.round((v / max) * 85)}%, transparent)`,
                      outline:
                        hover && (hover[0] === i || hover[1] === j)
                          ? '1px solid var(--accent)'
                          : 'none',
                    }}
                  >
                    <span className="tnum text-[9px] text-ink-2">
                      {i === j ? '—' : v.toFixed(2)}
                    </span>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ink-3">
        Distance = 1 − fractional identity. Stronger colour means more diverged.
      </p>
    </div>
  )
}
