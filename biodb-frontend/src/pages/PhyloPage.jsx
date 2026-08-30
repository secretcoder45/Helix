import { useState } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Play, AlertTriangle, Copy, Check, FlaskConical } from 'lucide-react'
import { usePhylo } from '../lib/api'
import { useSequenceTray } from '../context/SequenceTray'
import { PhyloTree, DistanceHeatmap } from '../components/PhyloTree'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

export function PhyloPage() {
  const { entries } = useSequenceTray()
  const [selected, setSelected] = useState(() => new Set())
  const [method, setMethod] = useState('nj')
  const [copied, setCopied] = useState(false)
  const phylo = usePhylo()

  const chosen = entries.filter((e) => selected.has(e.id))

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const run = () => {
    if (chosen.length < 3) return
    phylo.mutate({
      sequences: chosen.map((e) => ({ label: e.label, sequence: e.sequence })),
      method,
    })
  }

  const r = phylo.data

  return (
    <>
      <PageHeader
        eyebrow="Phylogenetics"
        title="Distance tree"
        description="Pairwise distances from this app's own aligner, built into a tree — so any branch can be traced back to the alignment that produced it."
        actions={
          r && (
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.newick)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                } catch {
                  /* clipboard unavailable */
                }
              }}
            >
              {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
              Copy Newick
            </Button>
          )
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {entries.length < 3 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={FlaskConical}
                title="Needs at least three sequences in the tray"
                description="Collect sequences from anywhere in the app — cross-reference, batch results, BLAST hits, ORFs — then choose which of them to build a tree from."
              />
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader title="Sequences" count={`${chosen.length}/${entries.length}`} />
                <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-4 py-2 transition-colors hover:bg-surface-2/50">
                        <input
                          type="checkbox"
                          checked={selected.has(e.id)}
                          onChange={() => toggle(e.id)}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] text-ink">
                            {e.label}
                          </span>
                          <span className="block truncate text-[10px] text-ink-3">
                            {e.sublabel || e.source} · {e.sequence.length} aa
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                  <div className="flex overflow-hidden rounded-lg border border-line">
                    {[
                      ['nj', 'Neighbour-joining'],
                      ['upgma', 'UPGMA'],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setMethod(v)}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          method === v
                            ? 'bg-accent text-accent-contrast'
                            : 'bg-surface text-ink-2 hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={run}
                    disabled={chosen.length < 3 || phylo.isPending}
                    loading={phylo.isPending}
                  >
                    {!phylo.isPending && <Play size={12} />}
                    {phylo.isPending
                      ? 'Aligning…'
                      : `Build tree${chosen.length >= 3 ? ` (${(chosen.length * (chosen.length - 1)) / 2} alignments)` : ''}`}
                  </Button>
                </div>
              </Card>

              {chosen.length > 0 && chosen.length < 3 && (
                <p className="text-[11px] text-ink-3">
                  Select at least three sequences — a tree needs three points to have a shape.
                </p>
              )}

              {phylo.isError && (
                <Card className="border-danger/30 bg-danger-soft p-4">
                  <div className="flex gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                    <p className="text-[13px] text-ink">
                      {phylo.error?.response?.data?.detail || 'Could not build the tree.'}
                    </p>
                  </div>
                </Card>
              )}

              {r && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <Card>
                    <CardHeader
                      title={r.method === 'nj' ? 'Neighbour-joining tree' : 'UPGMA tree'}
                      icon={GitBranch}
                      subtitle={
                        r.method === 'nj'
                          ? 'No molecular-clock assumption'
                          : 'Ultrametric — assumes a constant rate of change'
                      }
                    />
                    <div className="p-4">
                      <PhyloTree tree={r.tree} method={r.method} />
                    </div>
                  </Card>

                  <Card>
                    <CardHeader title="Distance matrix" />
                    <div className="p-4">
                      <DistanceHeatmap matrix={r.distance_matrix} names={r.names} />
                    </div>
                  </Card>

                  <Card>
                    <CardHeader title="Newick" subtitle="Paste into FigTree, iTOL or ETE" />
                    <pre className="overflow-x-auto px-4 py-3 font-mono text-[11px] text-ink-2">
                      {r.newick}
                    </pre>
                  </Card>
                </motion.div>
              )}
            </>
          )}
        </div>
      </Scroller>
    </>
  )
}
