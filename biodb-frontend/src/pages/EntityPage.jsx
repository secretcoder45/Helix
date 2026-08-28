import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Link2,
  Dna,
  FlaskConical,
  Boxes,
  Waypoints,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { useEntity } from '../lib/api'
import { useDebounce } from '../hooks/useDebounce'
import { SearchBar } from '../components/SearchBar'
import { SaveToProject } from '../components/SaveToProject'

const EXAMPLES = ['BRCA1', 'TP53', 'INS', 'EGFR']

function Section({ icon: Icon, title, count, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Icon size={14} /> {title}
        {count !== undefined && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  )
}

function SequenceBlock({ sequence }) {
  const [copied, setCopied] = useState(false)
  if (!sequence?.value) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`>${sequence.header || 'sequence'}\n${sequence.value}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {sequence.length} aa · {Math.round(sequence.molecular_weight / 1000)} kDa
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500 hover:text-indigo-600 dark:border-slate-700"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy FASTA'}
        </button>
      </div>
      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        {sequence.value}
      </pre>
    </div>
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

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Link2 size={18} className="text-indigo-500" /> Cross-reference
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          One lookup — gene, protein, structures, and pathways linked together.
        </p>
      </div>

      <SearchBar
        value={input}
        onChange={setInput}
        placeholder="Gene or protein name, e.g. BRCA1"
        isFetching={isFetching}
      />

      <div className="mt-6 flex-1 space-y-3 overflow-y-auto pb-8">
        {!debounced && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:text-slate-300"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {isLoading && debounced && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
            {error?.response?.status === 404
              ? `No entry found for "${debounced}". Try an official gene symbol like BRCA1.`
              : 'Something went wrong resolving that entity.'}
          </div>
        )}

        {entity && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Identity */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-500/30 dark:bg-indigo-500/5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">{entity.protein_name || entity.name}</h3>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    <em>{entity.organism}</em> · {entity.genes.join(', ')}
                  </p>
                </div>
                <a
                  href={entity.links.uniprot}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  {entity.accession} <ExternalLink size={12} />
                </a>
              </div>
              {entity.function && (
                <p className="mt-3 border-t border-indigo-200/60 pt-3 text-[15px] leading-relaxed text-slate-600 dark:border-indigo-500/20 dark:text-slate-300">
                  {entity.function}
                </p>
              )}
              <div className="mt-4">
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
              </div>
            </div>

            {/* Gene records */}
            {entity.genes_detail?.length > 0 && (
              <Section icon={Dna} title="Gene" count={entity.genes_detail.length}>
                <ul className="space-y-2">
                  {entity.genes_detail.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{g.name}</span>
                        <p className="truncate text-xs text-slate-500">{g.description}</p>
                      </div>
                      <a
                        href={g.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-indigo-500 hover:underline"
                      >
                        NCBI {g.id}
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Sequence */}
            {entity.sequence?.value && (
              <Section icon={FlaskConical} title="Sequence">
                <SequenceBlock
                  sequence={{ ...entity.sequence, header: `${entity.accession}|${entity.name}` }}
                />
              </Section>
            )}

            {/* Structures */}
            {entity.structures?.length > 0 && (
              <Section icon={Boxes} title="Structures" count={entity.structures.length}>
                <div className="flex flex-wrap gap-1.5">
                  {entity.structures.map((s) => (
                    <a
                      key={s.id}
                      href={s.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-slate-200 px-2 py-1 font-mono text-xs text-slate-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      {s.id}
                    </a>
                  ))}
                </div>
              </Section>
            )}

            {/* Pathways */}
            {entity.pathways?.length > 0 && (
              <Section icon={Waypoints} title="Pathways" count={entity.pathways.length}>
                <div className="flex flex-wrap gap-1.5">
                  {entity.pathways.map((p) => (
                    <a
                      key={p.id}
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-slate-200 px-2 py-1 font-mono text-xs text-slate-600 hover:border-amber-400 hover:text-amber-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      {p.id}
                    </a>
                  ))}
                </div>
              </Section>
            )}

            {entity.retrieved_at && (
              <p className="px-1 text-[11px] text-slate-400">
                Retrieved {new Date(entity.retrieved_at).toLocaleString()} from UniProt
                {entity.genes_detail?.length ? ', NCBI Gene' : ''}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
