import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Dna,
  Play,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Trash2,
  ArrowUpDown,
} from 'lucide-react'
import { useBlastSubmit, useBlastStatus, useBlastResults } from '../lib/api'
import { SaveSelectionToProject } from '../components/SaveSelectionToProject'
import { Button, Card, EmptyState, PageHeader, Scroller, SourceBadge } from '../components/ui'

// Human insulin (P01308) — a recognisable query with obvious, checkable hits.
const SAMPLE =
  'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN'

const PROGRAMS = [
  { value: 'blastp', label: 'blastp — protein vs protein' },
  { value: 'blastn', label: 'blastn — nucleotide vs nucleotide' },
  { value: 'blastx', label: 'blastx — translated nucleotide vs protein' },
]

const DATABASES = [
  { value: 'swissprot', label: 'Swiss-Prot — curated, faster' },
  { value: 'nr', label: 'nr — everything, slower' },
  { value: 'nt', label: 'nt — nucleotide' },
]

function formatEvalue(e) {
  if (e === 0) return '0'
  if (e < 0.001) return e.toExponential(1)
  return e.toFixed(3)
}

function useElapsedSeconds(since) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [since])
  return since ? Math.floor((now - since) / 1000) : 0
}

function Elapsed({ seconds }) {
  const mins = Math.floor(seconds / 60)
  return (
    <span className="tnum">
      {mins > 0 ? `${mins}m ` : ''}
      {seconds % 60}s
    </span>
  )
}

function HitsTable({ hits, selected, onToggle, onToggleAll, sort, onSort }) {
  const columns = [
    { key: 'accession', label: 'Accession' },
    { key: 'definition', label: 'Description' },
    { key: 'identity_pct', label: 'Identity', numeric: true },
    { key: 'evalue', label: 'E-value', numeric: true },
    { key: 'bit_score', label: 'Score', numeric: true },
    { key: 'length', label: 'Length', numeric: true },
  ]

  const allSelected = hits.length > 0 && hits.every((h) => selected.has(h.accession))

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="w-9 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
                aria-label="Select all hits"
              />
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3"
              >
                <button
                  onClick={() => onSort(c.key)}
                  className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                >
                  {c.label}
                  <ArrowUpDown
                    size={10}
                    className={sort.key === c.key ? 'text-accent' : 'opacity-35'}
                  />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hits.map((h) => (
            <tr
              key={h.accession}
              className={`border-b border-line transition-colors last:border-0 hover:bg-surface-2/50 ${
                selected.has(h.accession) ? 'bg-accent-soft/60' : ''
              }`}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(h.accession)}
                  onChange={() => onToggle(h.accession)}
                  className="h-3.5 w-3.5 accent-[var(--accent)]"
                  aria-label={`Select ${h.accession}`}
                />
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <a
                  href={`https://www.uniprot.org/uniprotkb/${h.accession}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                >
                  {h.accession} <ExternalLink size={9} />
                </a>
              </td>
              <td className="max-w-[26rem] truncate px-3 py-2 text-ink" title={h.definition}>
                {h.definition}
              </td>
              <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">
                {h.identity_pct}%
              </td>
              <td className="tnum whitespace-nowrap px-3 py-2 font-mono text-ink-2">
                {formatEvalue(h.evalue)}
              </td>
              <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">{h.bit_score}</td>
              <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">{h.length} aa</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BlastPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // The RID lives in the URL so a refresh (or a shared link) reconnects to a
  // search already running on NCBI's side rather than orphaning it — searches
  // routinely run for minutes, which is long enough for that to matter.
  const rid = searchParams.get('rid') || null

  const [sequence, setSequence] = useState('')
  const [program, setProgram] = useState('blastp')
  const [database, setDatabase] = useState('swissprot')
  const [startedAt, setStartedAt] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [sort, setSort] = useState({ key: 'bit_score', dir: 'desc' })

  const submit = useBlastSubmit()
  const { data: statusData } = useBlastStatus(rid)
  const status = statusData?.status
  const ready = status === 'READY'
  const { data: resultsData, isLoading: loadingResults } = useBlastResults(rid, ready)

  useEffect(() => {
    if (rid && !startedAt) setStartedAt(Date.now())
  }, [rid, startedAt])

  const run = (e) => {
    e.preventDefault()
    if (!sequence.trim()) return
    setSelected(new Set())
    submit.mutate(
      { sequence, program, database },
      {
        onSuccess: (data) => {
          setStartedAt(Date.now())
          setSearchParams({ rid: data.rid }, { replace: true })
        },
      },
    )
  }

  const reset = () => {
    setSequence('')
    setSelected(new Set())
    setStartedAt(null)
    submit.reset()
    setSearchParams({}, { replace: true })
  }

  const hits = resultsData?.hits ?? []

  const sortedHits = useMemo(() => {
    const copy = [...hits]
    copy.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [hits, sort])

  const toggleRow = (accession) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(accession) ? next.delete(accession) : next.add(accession)
      return next
    })

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === hits.length ? new Set() : new Set(hits.map((h) => h.accession)),
    )

  const onSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'evalue' ? 'asc' : 'desc' },
    )

  // BLAST hits carry accession + definition; map to the saved-item shape the
  // projects API expects, same boundary mapping as batch lookup.
  const selectedItems = hits
    .filter((h) => selected.has(h.accession))
    .map((h) => ({
      external_id: h.accession,
      name: h.accession,
      database: 'UniProt',
      description: h.definition,
      link: `https://www.uniprot.org/uniprotkb/${h.accession}`,
      retrieved_at: new Date().toISOString(),
    }))

  const running = Boolean(rid) && !ready && status !== 'FAILED'
  const elapsedSeconds = useElapsedSeconds(startedAt)
  const unusuallySlow = running && elapsedSeconds > 180 // NCBI's own site typically clears WAITING well under this

  return (
    <>
      <PageHeader
        eyebrow="Sequence similarity"
        title="BLAST search"
        description="Search a sequence against NCBI's live databases. Results are the same as blast.ncbi.nlm.nih.gov — searches take real time because the search itself does."
        actions={
          hits.length > 0 && (
            <SaveSelectionToProject
              items={selectedItems}
              onSaved={() => setSelected(new Set())}
            />
          )
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <textarea
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                rows={6}
                spellCheck={false}
                disabled={running}
                placeholder={'Paste a protein or nucleotide sequence.\nFASTA headers (>sp|...) are handled automatically.'}
                className="w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    disabled={running}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
                  >
                    {PROGRAMS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    disabled={running}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
                  >
                    {DATABASES.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <span className="tnum text-[11px] text-ink-3">
                    {sequence.replace(/^>.*$/gm, '').replace(/\s/g, '').length} residues
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!sequence && !rid && (
                    <Button type="button" size="sm" onClick={() => setSequence(SAMPLE)}>
                      Use sample
                    </Button>
                  )}
                  {(sequence || rid) && (
                    <Button type="button" size="sm" variant="ghost" onClick={reset}>
                      <Trash2 size={12} /> Clear
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!sequence.trim() || submit.isPending || running}
                    loading={submit.isPending}
                  >
                    {!submit.isPending && <Play size={12} />}
                    {submit.isPending ? 'Submitting…' : 'Run BLAST'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {submit.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <p className="text-[13px] text-ink">
                {submit.error?.response?.data?.detail || 'Submission failed. Try again.'}
              </p>
            </Card>
          )}

          {running && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">
                    Search queued at NCBI · running <Elapsed seconds={elapsedSeconds} />
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                    BLAST searches take anywhere from under a minute to several minutes
                    depending on NCBI's queue and the database size. This page keeps polling —
                    the search ID is in the URL, so you can close the tab and come back to it.
                  </p>

                  {unusuallySlow && (
                    <div className="mt-3 rounded-lg border border-warn/30 bg-warn-soft p-3">
                      <p className="text-[12px] leading-relaxed text-ink">
                        This is taking longer than usual — Swiss-Prot searches typically finish
                        in well under this time. NCBI's own servers appear to be under heavy
                        load right now, not a problem with this search specifically.
                      </p>
                      <a
                        href={`https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=${rid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-[11px] font-medium text-accent hover:underline"
                      >
                        Check this search directly on NCBI's own site →
                      </a>
                    </div>
                  )}

                  <p className="mt-2 font-mono text-[11px] text-ink-3">RID {rid}</p>
                </div>
              </div>
            </Card>
          )}

          {status === 'FAILED' && (
            <Card className="border-warn/30 bg-warn-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">NCBI reported the search failed</p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    This usually means the sequence didn't match the chosen program — check
                    that a protein sequence is using blastp, or a nucleotide one blastn.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {ready && loadingResults && (
            <p className="text-center text-[12px] text-ink-3">Fetching results…</p>
          )}

          {hits.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                <span className="text-ink-2">
                  <span className="tnum font-medium">{hits.length}</span> hits
                </span>
                <SourceBadge source="NCBI" />
                <span className="font-mono text-[11px] text-ink-3">RID {rid}</span>
              </div>

              <Card className="overflow-hidden">
                <HitsTable
                  hits={sortedHits}
                  selected={selected}
                  onToggle={toggleRow}
                  onToggleAll={toggleAll}
                  sort={sort}
                  onSort={onSort}
                />
              </Card>

              <p className="text-[11px] text-ink-3">
                E-value is the number of hits of this quality expected by chance — lower is
                stronger. Identity is over the aligned region, not the full sequence.
              </p>
            </motion.div>
          )}

          {!rid && !submit.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={Dna}
                title="Find sequences like yours"
                description="BLAST compares your sequence against every entry in the chosen database and ranks what it finds by statistical significance. Swiss-Prot is curated and returns faster; nr searches everything."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
