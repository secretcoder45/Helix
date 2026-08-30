import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search,
  Dna,
  Boxes,
  Waypoints,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Link2,
  BookOpen,
} from 'lucide-react'
import { useEntity, useLiterature } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { SaveToProject } from '../components/SaveToProject'
import { AddToTrayButton } from '../components/SequenceTrayUI'
import { SequenceViewer } from '../components/SequenceViewer'
import { useSequenceTray } from '../context/SequenceTray'
import {
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Skeleton,
  SourceBadge,
  Scroller,
} from '../components/ui'

const EXAMPLES = ['BRCA1', 'TP53', 'INS', 'EGFR', 'CFTR']

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return [copied, copy]
}

function Stat({ label, value, mono }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </dt>
      <dd className={`mt-1 text-[13px] text-ink ${mono ? 'font-mono tnum' : ''}`}>{value}</dd>
    </div>
  )
}

function SequenceCard({ entity }) {
  const [copied, copy] = useCopy()
  const { add } = useSequenceTray()
  const seq = entity.sequence
  if (!seq?.value) return null

  const fasta = `>${entity.accession}|${entity.name} ${entity.protein_name}\n${seq.value.replace(
    /(.{60})/g,
    '$1\n',
  )}`

  return (
    <Card>
      <CardHeader
        title="Sequence"
        icon={Dna}
        action={
          <div className="flex items-center gap-1.5">
            <AddToTrayButton
              entry={{
                id: entity.accession,
                label: entity.name,
                sublabel: entity.protein_name,
                sequence: seq.value,
                type: 'protein',
                source: 'UniProt',
              }}
            />
            <button
              onClick={() => copy(fasta)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'FASTA'}
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-4 border-b border-line px-4 py-3 sm:grid-cols-3">
        <Stat label="Length" value={`${seq.length} aa`} mono />
        <Stat label="Mass" value={`${(seq.molecular_weight / 1000).toFixed(1)} kDa`} mono />
        <Stat label="Accession" value={entity.accession} mono />
      </div>
      <div className="p-4">
        <SequenceViewer
          sequence={seq.value}
          label={entity.name}
          accession={entity.accession}
          onSelectionToTray={add}
        />
      </div>
    </Card>
  )
}

function LiteratureCard({ geneSymbol }) {
  const { data: papers, isLoading } = useLiterature(geneSymbol)

  if (!geneSymbol) return null

  return (
    <Card>
      <CardHeader title="Literature" icon={BookOpen} count={papers?.length} subtitle="Related papers, via PubMed" />
      {isLoading && (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}
      {!isLoading && papers?.length === 0 && (
        <p className="px-4 py-4 text-[12px] text-ink-3">No indexed papers found for this gene.</p>
      )}
      {papers?.length > 0 && (
        <ul className="divide-y divide-line">
          {papers.map((paper) => (
            <li key={paper.pmid} className="px-4 py-3">
              <a
                href={paper.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium leading-snug text-ink hover:text-accent"
              >
                {paper.title}
              </a>
              <p className="mt-1 text-[11px] text-ink-3">
                {paper.authors} · <em className="not-italic">{paper.journal}</em>
                {paper.year ? ` · ${paper.year}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function EntityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || ''
  const [input, setInput] = useState(urlQuery)
  const debounced = useDebounce(input, 400)
  const { data: entity, isLoading, isFetching, isError, error } = useEntity(debounced)

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (debounced) next.set('q', debounced)
    else next.delete('q')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  useEffect(() => {
    if (urlQuery && urlQuery !== input) setInput(urlQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery])

  return (
    <>
      {/* Search header */}
      <div className="shrink-0 border-b border-line bg-surface px-8 py-5">
        <div className="mx-auto max-w-5xl">
          <div className="relative">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter a gene symbol or protein name — BRCA1, TP53, insulin…"
              className="h-11 w-full rounded-lg border border-line bg-paper pl-10 pr-10 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
            />
            {isFetching && (
              <Loader2
                size={15}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-accent"
              />
            )}
          </div>

          {!debounced && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] text-ink-3">Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-5xl">
          {!debounced && (
            <EmptyState
              icon={Link2}
              title="One lookup, every database"
              description="Resolve a gene or protein once and see its UniProt record, NCBI gene entry, solved structures, and pathways together — with the identifiers verified against each other."
            />
          )}

          {isLoading && debounced && (
            <div className="space-y-4">
              <Skeleton className="h-36 rounded-xl" />
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <Skeleton className="h-56 rounded-xl" />
                <Skeleton className="h-56 rounded-xl" />
              </div>
            </div>
          )}

          {isError && (
            <Card className="border-warn/30 bg-warn-soft p-4">
              <div className="flex gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="text-[13px] font-semibold text-ink">
                    {error?.response?.status === 404
                      ? `No entry found for “${debounced}”`
                      : 'Could not reach the database'}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    {error?.response?.status === 404
                      ? 'Try an official gene symbol such as BRCA1, or a full protein name.'
                      : 'The source APIs may be slow or temporarily unavailable. Try again shortly.'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {entity && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Identity */}
              <Card className="overflow-hidden">
                <div className="border-b border-line bg-surface-2/50 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <SourceBadge source="UniProt" />
                        <span className="font-mono text-[11px] text-ink-3">
                          {entity.accession}
                        </span>
                      </div>
                      <h2 className="font-display text-[20px] font-semibold leading-tight text-ink">
                        {entity.protein_name || entity.name}
                      </h2>
                      <p className="mt-1 text-[13px] text-ink-2">
                        <em className="not-italic text-ink-2">{entity.organism}</em>
                        {entity.genes?.length > 0 && (
                          <>
                            {' · '}
                            <span className="font-mono text-[12px]">
                              {entity.genes.join(', ')}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SaveToProject
                        result={{
                          id: entity.accession,
                          name: entity.name,
                          database: 'UniProt',
                          description: entity.protein_name,
                          link: entity.links.uniprot,
                          retrieved_at: entity.retrieved_at,
                        }}
                      />
                      <a
                        href={entity.links.uniprot}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
                      >
                        UniProt <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                </div>

                {entity.function && (
                  <div className="px-5 py-4">
                    <p className="font-display text-[15px] leading-[1.65] text-ink-2">
                      {entity.function}
                    </p>
                  </div>
                )}
              </Card>

              <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                <div className="space-y-4">
                  <SequenceCard entity={entity} />

                  {entity.structures?.length > 0 && (
                    <Card>
                      <CardHeader
                        title="Structures"
                        icon={Boxes}
                        count={entity.structures.length}
                        subtitle="Experimentally solved, via PDB"
                      />
                      <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto p-4">
                        {entity.structures.map((s) => (
                          <Chip key={s.id} href={s.link} target="_blank" rel="noopener noreferrer">
                            {s.id}
                          </Chip>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>

                <div className="space-y-4">
                  {entity.genes_detail?.length > 0 && (
                    <Card>
                      <CardHeader title="Gene" icon={Dna} />
                      <ul className="divide-y divide-line">
                        {entity.genes_detail.map((g) => (
                          <li key={g.id} className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[13px] font-medium text-ink">
                                {g.name}
                              </span>
                              <SourceBadge source="NCBI Gene" />
                            </div>
                            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                              {g.description}
                            </p>
                            <a
                              href={g.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
                            >
                              Gene ID {g.id} <ExternalLink size={10} />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}

                  {entity.pathways?.length > 0 && (
                    <Card>
                      <CardHeader
                        title="Pathways"
                        icon={Waypoints}
                        count={entity.pathways.length}
                      />
                      <div className="flex flex-wrap gap-1.5 p-4">
                        {entity.pathways.map((p) => (
                          <Chip key={p.id} href={p.link} target="_blank" rel="noopener noreferrer">
                            {p.id}
                          </Chip>
                        ))}
                      </div>
                    </Card>
                  )}

                  <LiteratureCard geneSymbol={entity.genes?.[0]} />
                </div>
              </div>

              {entity.retrieved_at && (
                <p className="pb-2 text-[11px] text-ink-3">
                  Retrieved {new Date(entity.retrieved_at).toLocaleString()} from UniProt
                  {entity.genes_detail?.length ? ' and NCBI Gene' : ''}. Identifiers
                  cross-checked between sources.
                </p>
              )}
            </motion.div>
          )}
        </div>
      </Scroller>
    </>
  )
}
