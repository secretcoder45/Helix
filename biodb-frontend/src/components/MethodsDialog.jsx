import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Check, Copy, Download, ExternalLink, X } from 'lucide-react'
import { useMethods } from '../lib/api'
import { downloadFile, slug } from '../lib/export'
import { Button, Skeleton } from './ui'

/**
 * The methods export for a project.
 *
 * Three views of the same record: prose to paste into a manuscript, the
 * references that prose cites (with BibTeX for LaTeX users), and the
 * per-record table — releases, entry versions, checksums — that belongs in
 * supplementary material. All of it is generated server-side from what the
 * project's provenance actually recorded; warnings say where that is thin.
 */

const TABS = [
  { id: 'methods', label: 'Methods' },
  { id: 'references', label: 'References' },
  { id: 'records', label: 'Records' },
]

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </Button>
  )
}

function referencesText(refs) {
  return refs.map((r) => r.text).join('\n\n')
}

const TSV_COLUMNS = [
  ['kind', 'Kind'],
  ['identifier', 'Identifier'],
  ['name', 'Name'],
  ['database', 'Database'],
  ['release', 'Release / build'],
  ['release_date', 'Release date'],
  ['record_version', 'Entry version'],
  ['sequence_version', 'Sequence version'],
  ['checksum', 'Checksum'],
  ['retrieved_at', 'Retrieved / computed'],
  ['helix_version', 'Helix version'],
  ['helix_commit', 'Helix commit'],
  ['captured', 'Provenance captured at'],
]

function recordsTsv(records) {
  const clean = (v) => String(v ?? '').replace(/[\t\n]/g, ' ')
  return [
    TSV_COLUMNS.map(([, h]) => h).join('\t'),
    ...records.map((r) => TSV_COLUMNS.map(([k]) => clean(r[k])).join('\t')),
  ].join('\n')
}

function MethodsTab({ data }) {
  return (
    <div className="space-y-5">
      {data.warnings.length > 0 && (
        <div className="flex gap-2.5 rounded-lg border border-warn/25 bg-warn-soft px-3.5 py-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
          <ul className="m-0 list-none space-y-1 p-0 text-[12px] leading-relaxed text-ink-2">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-xl border border-line bg-paper px-6 py-5">
        {data.paragraphs.map((p, i) => (
          <p
            key={i}
            className="font-display m-0 text-[15px] leading-[1.7] text-ink [&+&]:mt-4"
          >
            {p}
          </p>
        ))}
      </div>
    </div>
  )
}

function ReferencesTab({ data }) {
  return (
    <ol className="m-0 list-none space-y-3 p-0">
      {data.references.map((r) => (
        <li
          key={r.key}
          className="rounded-lg border border-line bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2"
        >
          <span className="font-display text-[14px] text-ink">{r.text.replace(/ https:\/\/\S+$/, '')}</span>
          {r.doi && (
            <a
              href={`https://doi.org/${r.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-[11px] text-accent hover:text-accent-hover"
            >
              doi:{r.doi} <ExternalLink size={10} />
            </a>
          )}
          {!r.doi && r.url && (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1.5 inline-flex items-center gap-0.5 font-mono text-[11px] text-accent hover:text-accent-hover"
            >
              {r.url.replace(/^https:\/\//, '')} <ExternalLink size={10} />
            </a>
          )}
        </li>
      ))}
    </ol>
  )
}

function RecordsTab({ data }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
        <thead className="bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          <tr>
            {['Identifier', 'Source', 'Release', 'Version', 'Checksum', 'Retrieved', 'Helix'].map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.records.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="px-3 py-2 font-mono text-ink">{r.identifier}</td>
              <td className="px-3 py-2 text-ink-2">{r.database || r.name}</td>
              <td className="px-3 py-2 font-mono text-ink-2">
                {r.release || (r.release_date ? `updated ${r.release_date}` : '—')}
              </td>
              <td className="px-3 py-2 text-ink-2">
                {r.record_version ? `v${r.record_version}` : '—'}
                {r.sequence_version ? ` · seq v${r.sequence_version}` : ''}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-ink-3">{r.checksum || '—'}</td>
              <td className="tnum px-3 py-2 text-ink-3">
                {r.retrieved_at ? new Date(r.retrieved_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-ink-3">
                {r.helix_version ? `${r.helix_version}${r.helix_commit ? ` · ${r.helix_commit}` : ''}` : '—'}
                {r.captured === 'save' && <span className="ml-1 font-sans text-warn">(at save)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MethodsDialog({ project, shareToken, open, onOpenChange }) {
  const [tab, setTab] = useState('methods')
  const { data, isLoading, isError } = useMethods(
    shareToken ? { shareToken } : { projectId: project?.id },
    open,
  )
  const base = slug(project?.name || 'project')

  const actions = data && {
    methods: (
      <>
        <CopyButton text={data.text} label="Copy methods" />
        <Button
          size="sm"
          onClick={() =>
            downloadFile(
              `${base}-methods.txt`,
              `${data.text}\n\nReferences\n\n${referencesText(data.references)}\n`,
              'text/plain;charset=utf-8',
            )
          }
        >
          <Download size={12} /> Text with references
        </Button>
      </>
    ),
    references: (
      <>
        <CopyButton text={referencesText(data.references)} label="Copy references" />
        <Button
          size="sm"
          onClick={() =>
            downloadFile(
              `${base}.bib`,
              `${data.references.map((r) => r.bibtex).join('\n\n')}\n`,
              'application/x-bibtex;charset=utf-8',
            )
          }
        >
          <Download size={12} /> BibTeX
        </Button>
      </>
    ),
    records: (
      <Button
        size="sm"
        onClick={() =>
          downloadFile(`${base}-records.tsv`, `${recordsTsv(data.records)}\n`, 'text/tab-separated-values;charset=utf-8')
        }
      >
        <Download size={12} /> Records table (.tsv)
      </Button>
    ),
  }

  const counts = data && { references: data.references.length, records: data.records.length }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-32px)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-0 pt-5">
                  <div className="min-w-0">
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
                      Methods export
                    </p>
                    <Dialog.Title className="font-display m-0 mt-1 truncate text-[20px] font-semibold text-ink">
                      {project?.name}
                    </Dialog.Title>
                    <Dialog.Description className="m-0 mt-1 text-[12px] text-ink-3">
                      Written from this project’s recorded provenance. Check it before it goes in a
                      manuscript.
                    </Dialog.Description>
                    <div className="mt-4 flex gap-5" role="tablist">
                      {TABS.map((t) => (
                        <button
                          key={t.id}
                          role="tab"
                          aria-selected={tab === t.id}
                          onClick={() => setTab(t.id)}
                          className={`-mb-px border-b-2 pb-2.5 text-[13px] transition-colors ${
                            tab === t.id
                              ? 'border-accent font-medium text-ink'
                              : 'border-transparent text-ink-3 hover:text-ink-2'
                          }`}
                        >
                          {t.label}
                          {counts?.[t.id] != null && (
                            <span className="tnum ml-1.5 text-[11px] text-ink-3">{counts[t.id]}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Dialog.Close className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                    <X size={16} />
                    <span className="sr-only">Close</span>
                  </Dialog.Close>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {isLoading && (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  )}
                  {isError && (
                    <p className="text-[13px] text-danger">Couldn’t generate the methods export.</p>
                  )}
                  {data && tab === 'methods' && <MethodsTab data={data} />}
                  {data && tab === 'references' && <ReferencesTab data={data} />}
                  {data && tab === 'records' && <RecordsTab data={data} />}
                </div>

                {data && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-6 py-3">
                    <p className="m-0 font-mono text-[10.5px] text-ink-3">
                      Generated by Helix {data.generated_by.version}
                      {data.generated_by.commit ? ` · ${data.generated_by.commit}` : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">{actions[tab]}</div>
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
