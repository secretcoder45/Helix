import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Rows3,
  Play,
  Download,
  Table,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { useBatch } from '../lib/api'
import { SaveSelectionToProject } from '../components/SaveSelectionToProject'
import { exportBatchCsv, exportBatchFasta } from '../lib/export'
import { Button, Card, EmptyState, PageHeader, Scroller, SourceBadge } from '../components/ui'

const SAMPLE = 'BRCA1\nTP53\nEGFR\nCFTR\nINS\nMTOR\nKRAS\nPTEN'

function ExportMenu({ rows }) {
  const [open, setOpen] = useState(false)
  const resolved = rows.filter((r) => r.resolved)
  if (!rows.length) return null

  const actions = [
    { label: 'CSV — full annotation table', icon: Table, run: () => exportBatchCsv(rows) },
    {
      label: `FASTA — ${resolved.length} sequences`,
      icon: FileText,
      run: () => exportBatchFasta(rows),
      disabled: resolved.length === 0,
    },
  ]

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        <Download size={12} /> Export
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop">
            {actions.map(({ label, icon: Icon, run, disabled }) => (
              <button
                key={label}
                disabled={disabled}
                onClick={() => {
                  run()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-40"
              >
                <Icon size={13} className="text-ink-3" /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ResultsTable({ rows, selected, onToggle, onToggleAll }) {
  const resolvedRows = rows.filter((r) => r.resolved)
  const allSelected = resolvedRows.length > 0 && resolvedRows.every((r) => selected.has(r.accession))

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
                disabled={resolvedRows.length === 0}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
                aria-label="Select all resolved rows"
              />
            </th>
            {['Query', 'Accession', 'Protein', 'Organism', 'Length', 'Mass', 'Structures'].map(
              (h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.query}-${i}`}
              className={`border-b border-line transition-colors last:border-0 hover:bg-surface-2/50 ${
                r.resolved ? '' : 'bg-warn-soft/40'
              } ${r.resolved && selected.has(r.accession) ? 'bg-accent-soft/60' : ''}`}
            >
              <td className="px-3 py-2">
                {r.resolved && (
                  <input
                    type="checkbox"
                    checked={selected.has(r.accession)}
                    onChange={() => onToggle(r.accession)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                    aria-label={`Select ${r.query}`}
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-ink">
                {r.query}
              </td>
              {r.resolved ? (
                <>
                  <td className="whitespace-nowrap px-3 py-2">
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                    >
                      {r.accession} <ExternalLink size={9} />
                    </a>
                  </td>
                  <td className="max-w-[22rem] truncate px-3 py-2 text-ink" title={r.protein_name}>
                    {r.protein_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 italic text-ink-2">{r.organism}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">{r.length} aa</td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">
                    {r.molecular_weight ? `${(r.molecular_weight / 1000).toFixed(1)} kDa` : '—'}
                  </td>
                  <td className="tnum whitespace-nowrap px-3 py-2 text-ink-2">
                    {r.structure_count}
                  </td>
                </>
              ) : (
                <td colSpan={6} className="px-3 py-2 text-warn">
                  No match{r.error ? ` — ${r.error}` : ''}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BatchPage() {
  const [text, setText] = useState('')
  const [includeGene, setIncludeGene] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const batch = useBatch()

  const count = text.split(/[\s,;]+/).filter(Boolean).length

  const run = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSelected(new Set())
    batch.mutate({ identifiers: [text], includeGene })
  }

  const data = batch.data
  const resolvedRows = data?.rows.filter((r) => r.resolved) ?? []

  const toggleRow = (accession) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(accession) ? next.delete(accession) : next.add(accession)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === resolvedRows.length ? new Set() : new Set(resolvedRows.map((r) => r.accession)),
    )
  }

  // Batch rows (accession/name/protein_name/link) don't match the saved-item
  // shape (external_id/name/database/description/link) the projects API
  // expects — map at the boundary rather than assuming the shapes align.
  const selectedItems = resolvedRows
    .filter((r) => selected.has(r.accession))
    .map((r) => ({
      external_id: r.accession,
      name: r.name,
      database: 'UniProt',
      description: r.protein_name || '',
      link: r.link || '',
      retrieved_at: r.retrieved_at || null,
    }))

  return (
    <>
      <PageHeader
        eyebrow="Bulk annotation"
        title="Batch lookup"
        description="Paste a gene list and get the full annotation table back in one pass — the same lookup you would otherwise repeat by hand for every row."
        actions={
          data && (
            <div className="flex items-center gap-2">
              <SaveSelectionToProject items={selectedItems} onSaved={() => setSelected(new Set())} />
              <ExportMenu rows={data.rows} />
            </div>
          )
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={'Paste gene symbols or accessions — separated by\nnewlines, commas, tabs, or spaces.'}
                className="w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex items-center gap-4">
                  <span className="tnum text-[11px] text-ink-3">
                    {count} {count === 1 ? 'identifier' : 'identifiers'}
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={includeGene}
                      onChange={(e) => setIncludeGene(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Include NCBI gene IDs
                    <span className="text-ink-3">(slower)</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {!text && (
                    <Button type="button" size="sm" onClick={() => setText(SAMPLE)}>
                      Use sample
                    </Button>
                  )}
                  {text && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setText('')
                        batch.reset()
                      }}
                    >
                      <Trash2 size={12} /> Clear
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!text.trim() || batch.isPending}
                    loading={batch.isPending}
                  >
                    {!batch.isPending && <Play size={12} />}
                    {batch.isPending ? 'Resolving…' : 'Resolve'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {batch.isPending && (
            <p className="text-center text-[12px] text-ink-3">
              Looking up {count} identifiers concurrently…
            </p>
          )}

          {batch.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4 text-[13px] text-ink">
              Batch failed. Check the backend is running and try again.
            </Card>
          )}

          {data && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center gap-4 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-ok">
                  <CheckCircle2 size={13} />
                  <span className="tnum font-medium">{data.stats.resolved}</span> resolved
                </span>
                {data.stats.unresolved > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-warn">
                    <AlertTriangle size={13} />
                    <span className="tnum font-medium">{data.stats.unresolved}</span> unmatched
                  </span>
                )}
                {data.stats.truncated && (
                  <span className="text-warn">
                    Truncated to the first {data.stats.max_batch}
                  </span>
                )}
              </div>

              <Card className="overflow-hidden">
                <ResultsTable
                  rows={data.rows}
                  selected={selected}
                  onToggle={toggleRow}
                  onToggleAll={toggleAll}
                />
              </Card>

              <p className="text-[11px] text-ink-3">
                Resolved against UniProt. Unmatched rows are kept in the table and in the CSV
                export so the list you get back matches the list you pasted.
              </p>
            </motion.div>
          )}

          {!data && !batch.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={Rows3}
                title="Annotate a whole list at once"
                description="Accessions, protein names, or gene symbols — mixed delimiters and duplicates are handled. Results come back as a table you can export to CSV or FASTA."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
