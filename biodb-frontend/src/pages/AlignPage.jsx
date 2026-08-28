import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { GitCompareArrows, Play, Copy, Check, ChevronDown, AlertTriangle, FlaskConical } from 'lucide-react'
import { useAlign } from '../lib/api'
import { SaveAlignmentToProject } from '../components/SaveAlignmentToProject'
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
  const [label1, setLabel1] = useState('Sequence 1')
  const [label2, setLabel2] = useState('Sequence 2')
  const [algorithm, setAlgorithm] = useState('needleman-wunsch')
  const [fromTray, setFromTray] = useState(false)
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

  // Sequences handed off from the tray arrive via sessionStorage rather than
  // the URL — a 1000-residue sequence would blow past practical URL limits.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('helix-align-handoff')
      if (!raw) return
      const picked = JSON.parse(raw)
      if (Array.isArray(picked) && picked.length === 2) {
        setSeq1(picked[0].sequence)
        setSeq2(picked[1].sequence)
        setLabel1(picked[0].label)
        setLabel2(picked[1].label)
        setSequenceType(picked[0].type || 'protein')
        setFromTray(true)
      }
      sessionStorage.removeItem('helix-align-handoff')
    } catch {
      /* no handoff, or unreadable — fall back to empty inputs */
    }
  }, [])

  const run = (e) => {
    e.preventDefault()
    if (!seq1.trim() || !seq2.trim()) return
    align.mutate({
      algorithm,
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
        title={algorithm === 'needleman-wunsch' ? 'Needleman-Wunsch' : 'Smith-Waterman'}
        description={
          algorithm === 'needleman-wunsch'
            ? 'Global alignment — best end-to-end correspondence between two sequences. Computed locally, cross-validated against Biopython.'
            : 'Local alignment — the single best-matching region, ignoring unrelated flanks. Computed locally, cross-validated against Biopython.'
        }
        actions={
          result && (
            <SaveAlignmentToProject
              alignment={{
                algorithm,
                label1,
                label2,
                seq1: seq1.replace(/\s/g, ''),
                seq2: seq2.replace(/\s/g, ''),
                aligned_seq1: result.aligned_seq1,
                aligned_seq2: result.aligned_seq2,
                score: result.score,
                identity_pct: result.identity_pct,
                similarity_pct: result.similarity_pct,
                gaps: result.gaps,
                length: result.length,
                params: { sequence_type: sequenceType, ...opts },
              }}
            />
          )
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {fromTray && (
            <div className="flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-3 py-2 text-[12px] text-ink">
              <FlaskConical size={13} className="shrink-0 text-accent" />
              Loaded {label1} and {label2} from the sequence tray.
            </div>
          )}

          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <div className="grid gap-px bg-line sm:grid-cols-2">
                <div className="bg-surface">
                  <input
                    value={label1}
                    onChange={(e) => setLabel1(e.target.value)}
                    className="w-full bg-transparent px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3 outline-none focus:text-accent"
                    aria-label="Label for sequence 1"
                  />
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
                  <input
                    value={label2}
                    onChange={(e) => setLabel2(e.target.value)}
                    className="w-full bg-transparent px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3 outline-none focus:text-accent"
                    aria-label="Label for sequence 2"
                  />
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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex overflow-hidden rounded-lg border border-line">
                    {[
                      ['needleman-wunsch', 'Global'],
                      ['smith-waterman', 'Local'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAlgorithm(value)}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          algorithm === value
                            ? 'bg-accent text-accent-contrast'
                            : 'bg-surface text-ink-2 hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
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
                    {result.seq1_start !== undefined ? (
                      <>
                        Aligned region: {label1} {result.seq1_start}–{result.seq1_end} vs {label2}{' '}
                        {result.seq2_start}–{result.seq2_end}
                      </>
                    ) : (
                      'Identity/similarity computed over aligned (non-gap) positions.'
                    )}
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
