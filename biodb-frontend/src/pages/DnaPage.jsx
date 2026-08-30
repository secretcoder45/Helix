import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Dna, Play, Trash2, AlertTriangle, Copy, Check, ArrowRight } from 'lucide-react'
import { useDna } from '../lib/api'
import { useSequenceTray } from '../context/SequenceTray'
import { LineChart, StatTile } from '../components/charts'
import { OrfMap } from '../components/OrfMap'
import { SequenceViewer } from '../components/SequenceViewer'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

// Human insulin coding sequence — a real CDS, so the ORF map has something
// genuinely correct to find rather than a contrived example.
const SAMPLE =
  'ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCTGACCCAGCCGCAGCC' +
  'TTTGTGAACCAACACCTGTGCGGCTCACACCTGGTGGAAGCTCTCTACCTAGTGTGCGGGGAACGAGGCTTC' +
  'TTCTACACACCCAAGACCCGCCGGGAGGCAGAGGACCTGCAGGTGGGGCAGGTGGAGCTGGGCGGGGGCCCT' +
  'GGTGCAGGCAGCCTGCAGCCCTTGGCCCTGGAGGGGTCCCTGCAGAAGCGTGGCATTGTGGAACAATGCTGT' +
  'ACCAGCATCTGCTCCCTCTACCAGCTGGAGAACTACTGCAACTAG'

function CopyLine({ label, value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {label}
        </span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1300)
            } catch {
              /* clipboard unavailable */
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? <Check size={10} className="text-ok" /> : <Copy size={10} />}
          Copy
        </button>
      </div>
      <pre className="max-h-24 overflow-auto rounded-lg border border-line bg-paper p-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
        {value}
      </pre>
    </div>
  )
}

function BaseComposition({ counts, length }) {
  const bases = ['A', 'C', 'G', 'T']
  const varOf = { A: '--res-special', C: '--res-charged', G: '--res-hydrophobic', T: '--res-polar' }
  return (
    <div>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
        {bases.map((b) => (
          <span
            key={b}
            title={`${b}: ${counts[b]} (${((100 * counts[b]) / length).toFixed(1)}%)`}
            style={{ width: `${(100 * counts[b]) / length}%`, background: `var(${varOf[b]})` }}
            className="first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3">
        {bases.map((b) => (
          <span key={b} className="text-[10px] text-ink-3">
            <span className="tnum font-medium text-ink-2">
              {((100 * counts[b]) / length).toFixed(0)}%
            </span>{' '}
            <span className="font-mono">{b}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function DnaPage() {
  const [sequence, setSequence] = useState('')
  const [minOrf, setMinOrf] = useState(30)
  const [selectedOrf, setSelectedOrf] = useState(null)
  const dna = useDna()
  const { add, entries } = useSequenceTray()

  const run = (e) => {
    e.preventDefault()
    if (!sequence.trim()) return
    setSelectedOrf(null)
    dna.mutate({ sequence, min_orf_aa: minOrf, gc_window: 50 })
  }

  const r = dna.data
  const gcData = useMemo(
    () => (r ? r.gc_profile.map((y, i) => ({ x: i + 1, y })) : []),
    [r],
  )
  const orf = selectedOrf !== null ? r?.orfs[selectedOrf] : null

  return (
    <>
      <PageHeader
        eyebrow="Nucleotide analysis"
        title="DNA toolkit"
        description="Composition, GC landscape, six-frame translation and open reading frames — computed locally."
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
                placeholder="Paste a DNA or RNA sequence — FASTA headers are handled."
                className="w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tnum text-[11px] text-ink-3">
                    {sequence.replace(/^>.*$/gm, '').replace(/\s/g, '').length} bases
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-ink-2">
                    min ORF
                    <select
                      value={minOrf}
                      onChange={(e) => setMinOrf(Number(e.target.value))}
                      className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
                    >
                      {[10, 20, 30, 50, 100].map((v) => (
                        <option key={v} value={v}>
                          {v} aa
                        </option>
                      ))}
                    </select>
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
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSequence('')
                        dna.reset()
                      }}
                    >
                      <Trash2 size={12} /> Clear
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!sequence.trim() || dna.isPending}
                    loading={dna.isPending}
                  >
                    {!dna.isPending && <Play size={12} />}
                    {dna.isPending ? 'Analysing…' : 'Analyse'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {dna.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-ink">
                  {dna.error?.response?.data?.detail || 'Analysis failed.'}
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
                  <StatTile label="GC content" value={`${r.gc_content}`} unit="%" />
                  <StatTile label="ORFs found" value={r.orfs.length} hint={`≥ ${r.min_orf_aa} aa`} />
                  {r.melting_temperature.nearest_neighbour !== undefined ? (
                    <StatTile
                      label="Tm"
                      value={r.melting_temperature.nearest_neighbour}
                      unit="°C"
                      hint={`Wallace ${r.melting_temperature.wallace}°C`}
                    />
                  ) : (
                    <StatTile label="Tm" value="—" hint="primer-length only (8–200 bp)" />
                  )}
                </div>
                <div className="border-t border-line px-5 py-4">
                  <BaseComposition counts={r.base_counts} length={r.length} />
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Open reading frames"
                  count={r.orfs.length}
                  subtitle="All six frames, on forward-strand coordinates"
                />
                <div className="p-4">
                  {r.orfs.length === 0 ? (
                    <p className="py-4 text-center text-[12px] text-ink-3">
                      No ORFs of at least {r.min_orf_aa} aa. Try lowering the minimum.
                    </p>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
                          <span className="h-2.5 w-2.5 rounded-[3px] bg-res-hydrophobic" />
                          Forward strand
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-2">
                          <span className="h-2.5 w-2.5 rounded-[3px] bg-res-charged" />
                          Reverse strand
                        </span>
                      </div>
                      <OrfMap
                        orfs={r.orfs}
                        length={r.length}
                        onSelect={setSelectedOrf}
                        selectedIndex={selectedOrf}
                      />
                    </>
                  )}
                </div>

                {orf && (
                  <div className="border-t border-line p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12px]">
                        <span className="font-medium text-ink">
                          Frame {orf.frame > 0 ? `+${orf.frame}` : orf.frame}
                        </span>
                        <span className="mx-1.5 text-ink-3">·</span>
                        <span className="tnum text-ink-2">
                          {orf.start.toLocaleString()}–{orf.end.toLocaleString()}
                        </span>
                        <span className="mx-1.5 text-ink-3">·</span>
                        <span className="tnum text-ink-2">{orf.length_aa} aa</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          add({
                            id: `orf:${orf.frame}:${orf.start}-${orf.end}`,
                            label: `ORF ${orf.frame > 0 ? '+' : ''}${orf.frame} ${orf.start}–${orf.end}`,
                            sublabel: `${orf.length_aa} aa translated`,
                            sequence: orf.protein,
                            type: 'protein',
                            source: 'ORF',
                          })
                        }
                      >
                        Send protein to tray <ArrowRight size={12} />
                      </Button>
                    </div>
                    <SequenceViewer
                      sequence={orf.protein}
                      label={`ORF ${orf.frame}`}
                      onSelectionToTray={add}
                      compact
                    />
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="GC landscape"
                  subtitle={`${r.gc_window}-base sliding window`}
                />
                <div className="p-4">
                  <LineChart
                    data={gcData}
                    height={180}
                    yMin={0}
                    yMax={100}
                    fillArea
                    color="var(--res-polar)"
                    xLabel="position (bp)"
                    yLabel="GC %"
                    formatX={(v) => Math.round(v)}
                    formatY={(v) => `${Math.round(v)}`}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                    Overall GC is {r.gc_content}%. Sustained stretches well above the average are
                    GC islands, which often mark promoter regions — a single averaged percentage
                    hides them entirely.
                  </p>
                </div>
              </Card>

              <Card>
                <CardHeader title="Sequences" />
                <div className="space-y-3 p-4">
                  <CopyLine label="Reverse complement" value={r.reverse_complement} />
                  <CopyLine label="RNA" value={r.rna} />
                </div>
              </Card>
            </motion.div>
          )}

          {!r && !dna.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={Dna}
                title="Read a nucleotide sequence"
                description="Finds open reading frames in all six frames and maps them positionally, plots the GC landscape, and gives you the reverse complement and RNA — rather than a table of coordinates to decode by hand."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
