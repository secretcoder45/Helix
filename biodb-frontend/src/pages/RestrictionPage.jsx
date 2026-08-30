import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Scissors, Play, Trash2, AlertTriangle, Search } from 'lucide-react'
import { useRestriction } from '../lib/api'
import { VirtualGel, RestrictionMap } from '../components/VirtualGel'
import { StatTile } from '../components/charts'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

// A pUC19-style polylinker followed by filler — the sites people expect to
// find are actually present, so the map has something real to show.
const SAMPLE =
  'GAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTT' +
  'ATGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCACTGGCC' +
  'GTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCGTTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGC' +
  'TGGCGTAATAGCGAAGAGGCCCGCACCGATCGCCCTTCCCAACAGTTGCGCAGCCTGAATGGCGAATGGCGCCTGATGCGG'

export function RestrictionPage() {
  const [sequence, setSequence] = useState('')
  const [circular, setCircular] = useState(false)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const digest = useRestriction()

  const run = (e) => {
    e.preventDefault()
    if (!sequence.trim()) return
    setSelected(new Set())
    digest.mutate({ sequence, circular })
  }

  const r = digest.data

  const shown = useMemo(() => {
    if (!r) return []
    const q = filter.trim().toLowerCase()
    const base = r.unique_cutters.length ? r.unique_cutters : r.cutters
    const pool = q ? r.cutters.filter((c) => c.enzyme.toLowerCase().includes(q)) : base
    return pool.slice(0, 25)
  }, [r, filter])

  const gelLanes = useMemo(() => {
    if (!r) return []
    return r.cutters
      .filter((c) => selected.has(c.enzyme))
      .map((c) => ({ name: c.enzyme, fragments: c.fragments }))
  }, [r, selected])

  const toggle = (name) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  return (
    <>
      <PageHeader
        eyebrow="Cloning"
        title="Restriction map"
        description="Which enzymes cut, where, and what the digest would look like on a gel."
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <textarea
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="Paste a plasmid or DNA sequence — FASTA headers are handled."
                className="w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tnum text-[11px] text-ink-3">
                    {sequence.replace(/^>.*$/gm, '').replace(/\s/g, '').length} bp
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={circular}
                      onChange={(e) => setCircular(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Circular (plasmid)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {!sequence && (
                    <Button type="button" size="sm" onClick={() => setSequence(SAMPLE)}>
                      Use sample
                    </Button>
                  )}
                  {sequence && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => {
                        setSequence('')
                        digest.reset()
                      }}
                    >
                      <Trash2 size={12} /> Clear
                    </Button>
                  )}
                  <Button
                    type="submit" variant="primary" size="sm"
                    disabled={!sequence.trim() || digest.isPending}
                    loading={digest.isPending}
                  >
                    {!digest.isPending && <Play size={12} />}
                    {digest.isPending ? 'Mapping…' : 'Map sites'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {digest.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-ink">
                  {digest.error?.response?.data?.detail || 'Mapping failed.'}
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
                <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
                  <StatTile label="Length" value={r.length.toLocaleString()} unit="bp" />
                  <StatTile
                    label="Unique cutters"
                    value={r.unique_cutters.length}
                    hint="cut exactly once"
                    tone="ok"
                  />
                  <StatTile label="Cutters" value={r.cutters.length} hint={`of ${r.enzymes_screened} screened`} />
                  <StatTile label="Non-cutters" value={r.non_cutters.length} hint="absent from this sequence" />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={filter ? 'Matching enzymes' : 'Unique cutters'}
                  count={shown.length}
                  subtitle={
                    filter
                      ? undefined
                      : 'Single-cut enzymes — the ones usable for linearising or directional cloning'
                  }
                  action={
                    <div className="relative">
                      <Search
                        size={11}
                        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-3"
                      />
                      <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Find enzyme…"
                        className="h-6 w-32 rounded-md border border-line bg-surface pl-6 pr-2 text-[11px] text-ink outline-none focus:border-accent"
                      />
                    </div>
                  }
                />
                {shown.length === 0 ? (
                  <p className="px-4 py-5 text-center text-[12px] text-ink-3">
                    {filter ? `No enzyme matching "${filter}" cuts this sequence.` : 'No cut sites found.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="border-b border-line text-left">
                          {['', 'Enzyme', 'Site', 'Cuts', 'Overhang', 'Fragments'].map((h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((c) => (
                          <tr
                            key={c.enzyme}
                            className={`border-b border-line last:border-0 transition-colors hover:bg-surface-2/50 ${
                              selected.has(c.enzyme) ? 'bg-accent-soft/60' : ''
                            }`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selected.has(c.enzyme)}
                                onChange={() => toggle(c.enzyme)}
                                className="h-3.5 w-3.5 accent-[var(--accent)]"
                                aria-label={`Add ${c.enzyme} to gel`}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-ink">
                              {c.enzyme}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-ink-2">
                              {c.site}
                            </td>
                            <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">
                              {c.n_cuts}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-ink-2">{c.overhang}</td>
                            <td className="tnum whitespace-nowrap px-3 py-2 text-ink-3">
                              {c.fragments.slice(0, 4).map((f) => f.toLocaleString()).join(' · ')}
                              {c.fragments.length > 4 ? ' …' : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {shown.length > 0 && (
                <Card>
                  <CardHeader title="Site map" subtitle="Cut positions along the sequence" />
                  <div className="p-4">
                    <RestrictionMap
                      length={r.length}
                      cutters={shown.slice(0, 12)}
                      circular={r.circular}
                    />
                  </div>
                </Card>
              )}

              <Card>
                <CardHeader
                  title="Predicted gel"
                  icon={Scissors}
                  count={gelLanes.length}
                  subtitle="Tick enzymes above to load lanes"
                />
                <div className="p-4">
                  {gelLanes.length === 0 ? (
                    <p className="py-6 text-center text-[12px] text-ink-3">
                      Select one or more enzymes to see the digest you'd expect to run.
                    </p>
                  ) : (
                    <VirtualGel lanes={gelLanes} ladder={r.ladder} />
                  )}
                </div>
              </Card>
            </motion.div>
          )}

          {!r && !digest.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={Scissors}
                title="Plan a digest"
                description="Screens 600+ commercially available enzymes, highlights the ones that cut exactly once, and shows the gel you would expect to run — including the circular case, where a single cut linearises rather than splits."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
