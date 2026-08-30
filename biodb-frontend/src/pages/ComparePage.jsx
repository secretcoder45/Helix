import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Grid3x3, FlaskConical, AlertTriangle } from 'lucide-react'
import { useSequenceTray } from '../context/SequenceTray'
import { DotPlot } from '../components/DotPlot'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

/**
 * Dot plot page. Sequences come from the tray rather than a paste box,
 * because by the time someone wants a dot plot they've already found the two
 * sequences somewhere else in the app.
 */
export function ComparePage() {
  const { entries } = useSequenceTray()
  const [aId, setAId] = useState('')
  const [bId, setBId] = useState('')
  const [windowSize, setWindowSize] = useState(9)
  // 4-of-9 rather than a stricter default: for protein, a random pair matches
  // at roughly 1 position in 20, so ~0.5 matches per 9-window is the noise
  // floor and 4 is comfortably above it while still catching real homology.
  // A strict default (7+) renders a blank plot for genuinely related pairs.
  const [threshold, setThreshold] = useState(4)

  const a = entries.find((e) => e.id === aId)
  const b = entries.find((e) => e.id === bId)

  // Default to the two most recent tray entries — the common case is
  // comparing what you just collected.
  useMemo(() => {
    if (!aId && entries[0]) setAId(entries[0].id)
    if (!bId && entries[1]) setBId(entries[1].id)
    else if (!bId && entries[0]) setBId(entries[0].id)
  }, [entries, aId, bId])

  const tooBig = a && b && a.sequence.length * b.sequence.length > 4_000_000

  return (
    <>
      <PageHeader
        eyebrow="Sequence comparison"
        title="Dot plot"
        description="Repeats, inversions and rearrangements — the structure a single best alignment collapses away."
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {entries.length < 2 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={FlaskConical}
                title="Needs two sequences in the tray"
                description="Add sequences from the cross-reference page, a batch result, a BLAST hit or an ORF, then come back — a dot plot compares two of them against each other."
              />
            </Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Horizontal', aId, setAId],
                    ['Vertical', bId, setBId],
                  ].map(([label, val, set]) => (
                    <label key={label} className="text-[11px] text-ink-2">
                      {label}
                      <select
                        value={val}
                        onChange={(e) => set(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
                      >
                        {entries.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label} ({e.sequence.length})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                  <label className="text-[11px] text-ink-2">
                    Window · <span className="tnum font-medium text-ink">{windowSize}</span>
                    <input
                      type="range" min="1" max="21" step="2"
                      value={windowSize}
                      onChange={(e) => {
                        const w = Number(e.target.value)
                        setWindowSize(w)
                        if (threshold > w) setThreshold(w)
                      }}
                      className="mt-1 w-full accent-[var(--accent)]"
                    />
                  </label>
                  <label className="text-[11px] text-ink-2">
                    Threshold · <span className="tnum font-medium text-ink">{threshold}</span> of{' '}
                    {windowSize}
                    <input
                      type="range" min="1" max={windowSize}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="mt-1 w-full accent-[var(--accent)]"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-3">
                  A point is drawn where at least {threshold} of {windowSize} residues match. Raise
                  the threshold to cut background noise; lower it to catch weaker similarity.
                </p>
              </Card>

              {tooBig ? (
                <Card className="border-warn/30 bg-warn-soft p-4">
                  <div className="flex gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                    <p className="text-[13px] text-ink">
                      Those two sequences make a{' '}
                      {(a.sequence.length * b.sequence.length / 1e6).toFixed(1)}M-cell matrix, which
                      would stall the page. Pick shorter sequences, or a region selected from the
                      sequence viewer.
                    </p>
                  </div>
                </Card>
              ) : (
                a && b && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card>
                      <CardHeader
                        title="Comparison matrix"
                        icon={Grid3x3}
                        subtitle="Diagonals are colinear regions; off-diagonals are repeats or rearrangements"
                      />
                      <div className="p-4">
                        <DotPlot
                          seqA={a.sequence}
                          seqB={b.sequence}
                          labelA={a.label}
                          labelB={b.label}
                          windowSize={windowSize}
                          threshold={threshold}
                        />
                      </div>
                    </Card>
                  </motion.div>
                )
              )}
            </>
          )}
        </div>
      </Scroller>
    </>
  )
}
