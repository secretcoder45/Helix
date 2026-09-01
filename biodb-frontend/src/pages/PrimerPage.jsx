import { useState } from 'react'
import { motion } from 'framer-motion'
import { Microscope, Play, Trash2, AlertTriangle, Copy, Check, Info } from 'lucide-react'
import { usePrimers } from '../lib/api'
import { useSequenceTray } from '../context/SequenceTray'
import { StatTile } from '../components/charts'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

// GFP coding sequence (Aequorea victoria) — a real, recognisable template
// whose GC balance sits inside the default criteria, so the sample actually
// produces pairs rather than demonstrating the rejection path.
const SAMPLE =
  'ATGAGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGATGTTAATGGGCACAAATTTTCT' +
  'GTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTTACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCA' +
  'TGGCCAACACTTGTCACTACTTTCTCTTATGGTGTTCAATGCTTTTCAAGATACCCAGATCATATGAAACGGCATGACTTTTTC' +
  'AAGAGTGCCATGCCCGAAGGTTATGTACAGGAAAGAACTATATTTTTCAAAGATGACGGGAACTACAAGACACGTGCTGAAGTC' +
  'AAGTTTGAAGGTGATACCCTTGTTAATAGAATCGAGTTAAAAGGTATTGATTTTAAAGAAGATGGAAACATTCTTGGACACAAA' +
  'TTGGAATACAACTATAACTCACACAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGTTAACTTCAAAATTAGA' +
  'CACAACATTGAAGATGGAAGCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGATGGCCCTGTCCTTTTACCA' +
  'GACAACCATTACCTGTCCACACAATCTGCCCTTTCGAAAGATCCCAACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTA' +
  'ACAGCTGCTGGGATTACACATGGCATGGATGAACTATACAAATAA'

function PrimerRow({ label, primer }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        {label}
      </span>
      <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1 font-mono text-[12px] text-ink">
        {primer.sequence}
      </code>
      <span className="tnum shrink-0 text-[11px] text-ink-2">
        {primer.length} nt · Tm {primer.tm}° · GC {primer.gc}%
      </span>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(primer.sequence)
            setCopied(true)
            setTimeout(() => setCopied(false), 1300)
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
      >
        {copied ? <Check size={10} className="text-ok" /> : <Copy size={10} />}
      </button>
    </div>
  )
}

export function PrimerPage() {
  const [template, setTemplate] = useState('')
  const [maxGc, setMaxGc] = useState(60)
  const [maxTm, setMaxTm] = useState(65)
  const primers = usePrimers()
  const { entries } = useSequenceTray()

  const run = (e) => {
    e.preventDefault()
    if (!template.trim()) return
    primers.mutate({ template, max_gc: maxGc, max_tm: maxTm })
  }

  const r = primers.data
  const topReason = r?.rejected ? Object.entries(r.rejected)[0] : null

  return (
    <>
      <PageHeader
        eyebrow="Cloning"
        title="Primer design"
        description="PCR primer pairs with nearest-neighbour melting temperatures and matched annealing."
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder="Paste a template sequence (60 bases minimum) — FASTA headers are handled."
                className="w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tnum text-[11px] text-ink-3">
                    {template.replace(/^>.*$/gm, '').replace(/\s/g, '').length} bp
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
                    max GC
                    <input
                      type="number" min="40" max="90" value={maxGc}
                      onChange={(e) => setMaxGc(Number(e.target.value))}
                      className="w-14 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
                    />%
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
                    max Tm
                    <input
                      type="number" min="55" max="80" value={maxTm}
                      onChange={(e) => setMaxTm(Number(e.target.value))}
                      className="w-14 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
                    />°C
                  </label>
                  {entries.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const f = entries.find((x) => x.id === e.target.value)
                        if (f) setTemplate(f.sequence)
                      }}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
                    >
                      <option value="">From tray…</option>
                      {entries.map((x) => (
                        <option key={x.id} value={x.id}>{x.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!template && (
                    <Button type="button" size="sm" onClick={() => setTemplate(SAMPLE)}>
                      Use sample
                    </Button>
                  )}
                  {template && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => {
                        setTemplate('')
                        primers.reset()
                      }}
                    >
                      <Trash2 size={12} /> Clear
                    </Button>
                  )}
                  <Button
                    type="submit" variant="primary" size="sm"
                    disabled={!template.trim() || primers.isPending}
                    loading={primers.isPending}
                  >
                    {!primers.isPending && <Play size={12} />}
                    {primers.isPending ? 'Designing…' : 'Design primers'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {primers.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-ink">
                  {primers.error?.response?.data?.detail || 'Design failed.'}
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
                  <StatTile label="Template" value={r.template_length.toLocaleString()} unit="bp" />
                  <StatTile label="Region GC" value={r.region_gc} unit="%" />
                  <StatTile label="Candidates" value={`${r.forward_candidates}/${r.reverse_candidates}`} hint="forward / reverse" />
                  <StatTile
                    label="Pairs"
                    value={r.pairs.length}
                    tone={r.pairs.length ? 'ok' : 'warn'}
                  />
                </div>
              </Card>

              {r.pairs.length === 0 ? (
                <Card className="border-warn/30 bg-warn-soft p-4">
                  <div className="flex gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        No pair satisfies the criteria
                      </p>
                      {topReason && (
                        <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                          <span className="tnum font-medium">{topReason[1]}</span> candidates were
                          rejected on <span className="font-medium">{topReason[0]}</span>
                          {topReason[0] === 'GC content' && r.region_gc > 60 && (
                            <> — this region is {r.region_gc}% GC, above the default window</>
                          )}
                          . Widen that constraint above and try again.
                        </p>
                      )}
                      {r.rejected && Object.keys(r.rejected).length > 1 && (
                        <p className="mt-1 text-[11px] text-ink-3">
                          Also rejected:{' '}
                          {Object.entries(r.rejected).slice(1).map(([k, n]) => `${k} (${n})`).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ) : (
                <Card>
                  <CardHeader
                    title="Primer pairs"
                    count={r.pairs.length}
                    subtitle="Ranked by matched annealing temperature, then product size"
                  />
                  <ul className="divide-y divide-line">
                    {r.pairs.map((p, i) => (
                      <li key={i} className="space-y-2 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <span className="tnum font-medium text-ink">
                            {p.product_size} bp product
                          </span>
                          <span className="tnum text-ink-2">ΔTm {p.tm_diff}°C</span>
                          {p.spans_target && (
                            <span className="rounded-md bg-ok-soft px-1.5 py-0.5 text-[10px] font-medium text-ok">
                              spans target
                            </span>
                          )}
                        </div>
                        <PrimerRow label="Forward" primer={p.forward} />
                        <PrimerRow label="Reverse" primer={p.reverse} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <p className="flex items-start gap-1.5 pb-2 text-[11px] leading-relaxed text-ink-3">
                <Info size={12} className="mt-0.5 shrink-0" />
                Melting temperatures use the nearest-neighbour model, not the 2(A+T)+4(G+C) rule —
                the latter is off by several degrees on anything but short, balanced primers, and a
                few degrees is the difference between a clean band and nothing. Every pair shown
                also passes a 3′ GC clamp, homopolymer and self-complementarity check.
              </p>
            </motion.div>
          )}

          {!r && !primers.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={Microscope}
                title="Design a PCR pair"
                description="Searches both flanks for primers meeting length, Tm, GC, 3′ clamp and self-complementarity criteria, then pairs them by matched annealing temperature — and says which constraint blocked it when nothing qualifies."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
