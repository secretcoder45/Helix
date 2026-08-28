import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, X, Copy, Check, Boxes } from 'lucide-react'
import { SaveToProject } from './SaveToProject'
import { SourceBadge } from './ui'

function CopyValue({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1400)
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
      {value}
    </button>
  )
}

export function DetailPanel({ result, open, onOpenChange }) {
  if (!result) return null
  const isPdb = result.database === 'PDB'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-line bg-surface shadow-pop ${
                  isPdb ? 'max-w-3xl' : 'max-w-md'
                }`}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 340 }}
              >
                <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="min-w-0">
                    <div className="mb-1.5">
                      <SourceBadge source={result.database} />
                    </div>
                    <Dialog.Title className="font-display text-[17px] font-semibold leading-tight text-ink">
                      {result.name}
                    </Dialog.Title>
                  </div>
                  <Dialog.Close className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                    <X size={16} />
                  </Dialog.Close>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {isPdb && (
                    <div className="border-b border-line">
                      <div className="flex items-center gap-2 px-5 pb-2 pt-3">
                        <Boxes size={13} className="text-ink-3" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                          Structure
                        </span>
                      </div>
                      <iframe
                        title={`3D structure ${result.id}`}
                        src={`https://molstar.org/viewer/?pdb=${result.id}&hide-controls=1&collapse-left-panel=1`}
                        className="h-[420px] w-full border-t border-line"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <dl className="space-y-4 px-5 py-4">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                        Description
                      </dt>
                      <dd className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                        {result.description || 'No description available.'}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                        Identifier
                      </dt>
                      <dd>
                        <CopyValue value={result.id} />
                      </dd>
                    </div>
                    {result.retrieved_at && (
                      <div>
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                          Provenance
                        </dt>
                        <dd className="mt-1 text-[12px] text-ink-3">
                          Retrieved {new Date(result.retrieved_at).toLocaleString()} from{' '}
                          {result.database}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="flex items-center gap-2 border-t border-line px-5 py-4">
                  <SaveToProject result={result} />
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
                  >
                    Open on {result.database} <ExternalLink size={13} />
                  </a>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
