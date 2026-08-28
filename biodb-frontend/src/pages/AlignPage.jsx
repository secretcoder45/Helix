import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GitCompareArrows, Play, Copy, Check, ChevronDown, AlertTriangle } from 'lucide-react'
import { useAlign } from '../lib/api'
import { Button, Card, EmptyState, PageHeader, Scroller } from '../components/ui'

const SAMPLE_1 = 'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN'
const SAMPLE_2 = 'MALWTRLLPLLALLALWAPAPTLAFVNQHLCGSHLVEALYLVCGERGFFYTPKGRREVEDPQVPQLELGGGPEAGDLQTLALEVAQQKRGIVDQCCTSICSLYQLENYCN'

const PROTEIN_MATRICES = ['BLOSUM62', 'BLOSUM45', 'BLOSUM80', 'PAM250']

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function AlignmentViewer({ result }) {
  // Break the alignment into fixed-width chunks (like real alignment tools do)
  // so it wraps legibly instead of one unreadable horizontal strip.
  const WIDTH = 60
  const chunks = useMemo(() => {
    const { aligned_seq1, aligned_seq2 } = result
    const rows = []
    for (let i = 0; i < aligned_seq1.length; i += WIDTH) {
      const a = aligned_seq1.slice(i, i + WIDTH)
      const b = aligned_seq2.slice(i, i + WIDTH)
      const mid = [...a].map((c, j) => (c === b[j] && c !== '-' ? '|' : c === '-' || b[j] === '-' ? ' ' : '.')).join('')
      rows.push({ start: i + 1, a, mid, b })
    }
    return rows
  }, [result])

  return (
    <div className="overflow-x-auto rounded-lg bg-surface-2/40 p-4">
      {chunks.map((chunk, i) => (
        <div key={i} className={`font-mono text-[12px] leading-[1.6] ${i > 0 ? 'mt-3' : ''}`}>
          <div className="flex gap-3">
            <span className="tnum w-10 shrink-0 text-right text-ink-3">{chunk.start}</span>
            <span className="whitespace-pre text-ink">{chunk.a}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-10 shrink-0" />
            <span className="whitespace-pre text-accent">{chunk.mid}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-10 shrink-0" />
            <span className="whitespace-pre text-ink">{chunk.b}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function AdvancedOptions({ open, setOpen, opts, setOpts, sequenceType }) {
  return (
    <div className="border-t border-line">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        Scoring parameters
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
          {sequenceType === 'protein' ? (
            <label className="text-[11px] text-ink-2">
              Matrix
              <select
                value={opts.matrix}
                onChange={(e) => setOpts((o) => ({ ...o, matrix: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
              >
                {PROTEIN_MATRICES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="text-[11px] text-ink-2">
                Match
                <input
                  type="number"
                  value={opts.match_score}
                  onChange={(e) => setOpts((o) => ({ ...o, match_score: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="text-[11px] text-ink-2">
                Mismatch
                <input
                  type="number"
                  value={opts.mismatch_score}
                  onChange={(e) => setOpts((o) => ({ ...o, mismatch_score: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
                />
              </label>
            </>
          )}
          <label className="text-[11px] text-ink-2">
            Gap open
            <input
              type="number"
              value={opts.gap_open}
              onChange={(e) => setOpts((o) => ({ ...o, gap_open: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="text-[11px] text-ink-2">
            Gap extend
            <input
              type="number"
              value={opts.gap_extend}
              onChange={(e) => setOpts((o) => ({ ...o, gap_extend: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
          </label>
        </div>
      )}
    </div>
  )
}

export function AlignPage() {
  const [seq1, setSeq1] = useState('')
  const [seq2, setSeq2] = useState('')
  const [sequenceType, setSequenceType] = useState('protein')
  const [showOptions, setShowOptions] = useState(false)
  const [opts, setOpts] = useState({
    matrix: 'BLOSUM62',
    gap_open: -10,
    gap_extend: -0.5,
    match_score: 5,
    mismatch_score: -4,
  })

  const align = useAlign()

  const run = (e) => {
    e.preventDefault()
    if (!seq1.trim() || !seq2.trim()) return
    align.mutate({
      seq1: seq1.replace(/\s/g, ''),
      seq2: seq2.replace(/\s/g, ''),
      sequence_type: sequenceType,
      ...opts,
    })
  }

  const result = align.data

  return (
    <>
      <PageHeader
        eyebrow="Pairwise alignment"
        title="Needleman-Wunsch"
        description="Global sequence alignment, computed locally — no external queue, no wait. Cross-validated against Biopython's reference implementation."
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <div className="grid gap-px bg-line sm:grid-cols-2">
                <div className="bg-surface">
                  <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                    Sequence 1
                  </p>
                  <textarea
                    value={seq1}
                    onChange={(e) => setSeq1(e.target.value)}
                    rows={5}
                    spellCheck={false}
                    placeholder="Paste a sequence…"
                    className="w-full resize-y bg-transparent px-4 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
                  />
                </div>
                <div className="bg-surface">
                  <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                    Sequence 2
                  </p>
                  <textarea
                    value={seq2}
                    onChange={(e) => setSeq2(e.target.value)}
                    rows={5}
                    spellCheck={false}
                    placeholder="Paste a sequence…"
                    className="w-full resize-y bg-transparent px-4 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <select
                    value={sequenceType}
                    onChange={(e) => setSequenceType(e.target.value)}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
                  >
                    <option value="protein">Protein</option>
                    <option value="dna">DNA</option>
                  </select>
                  {!seq1 && !seq2 && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setSeq1(SAMPLE_1)
                        setSeq2(SAMPLE_2)
                      }}
                    >
                      Use sample
                    </Button>
                  )}
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!seq1.trim() || !seq2.trim() || align.isPending}
                  loading={align.isPending}
                >
                  {!align.isPending && <Play size={12} />}
                  {align.isPending ? 'Aligning…' : 'Align'}
                </Button>
              </div>

              <AdvancedOptions
                open={showOptions}
                setOpen={setShowOptions}
                opts={opts}
                setOpts={setOpts}
                sequenceType={sequenceType}
              />
            </form>
          </Card>

          {align.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-ink">
                  {align.error?.response?.data?.detail || 'Alignment failed.'}
                </p>
              </div>
            </Card>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <Card>
                <div className="grid grid-cols-2 gap-4 border-b border-line px-4 py-3 sm:grid-cols-5">
                  {[
                    ['Score', result.score],
                    ['Identity', `${result.identity_pct}%`],
                    ['Similarity', `${result.similarity_pct}%`],
                    ['Gaps', result.gaps],
                    ['Length', result.length],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                        {label}
                      </p>
                      <p className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between px-4 pt-3">
                  <p className="text-[11px] text-ink-3">
                    Identity/similarity computed over aligned (non-gap) positions.
                  </p>
                  <CopyButton
                    text={`>seq1\n${result.aligned_seq1}\n>seq2\n${result.aligned_seq2}\n`}
                    label="Copy alignment"
                  />
                </div>

                <div className="p-4">
                  <AlignmentViewer result={result} />
                </div>
              </Card>
            </motion.div>
          )}

          {!result && !align.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={GitCompareArrows}
                title="Compare two sequences directly"
                description="Global alignment finds the best end-to-end correspondence between two sequences — useful for comparing orthologs, checking a mutation, or verifying a cloning construct. Computed here, not queued at an external API."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
