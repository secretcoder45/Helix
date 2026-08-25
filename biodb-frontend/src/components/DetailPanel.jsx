import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, X, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { colorFor } from '../lib/databaseMeta'
import { ACCENT } from '../lib/colorClasses'

function CopyId({ id }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id)
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } catch {
          // clipboard unavailable — ignore
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {id}
    </button>
  )
}

export function DetailPanel({ result, open, onOpenChange }) {
  if (!result) return null
  const accent = ACCENT[colorFor(result._database)] || ACCENT.slate
  const isPdb = result.database === 'PDB'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-black/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 ${
                  isPdb ? 'max-w-2xl' : 'max-w-md'
                }`}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-800">
                  <div>
                    <Dialog.Title className="text-base font-semibold">{result.name}</Dialog.Title>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${accent.bgSoft} ${accent.text}`}
                    >
                      {result.database}
                    </span>
                  </div>
                  <Dialog.Close className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                    <X size={18} />
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {isPdb && (
                    <div className="mb-5 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                      <iframe
                        title={`3D structure ${result.id}`}
                        src={`https://molstar.org/viewer/?pdb=${result.id}&hide-controls=1&collapse-left-panel=1`}
                        className="h-96 w-full"
                        loading="lazy"
                      />
                    </div>
                  )}

                  <dl className="space-y-4 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Description
                      </dt>
                      <dd className="mt-1 text-slate-700 dark:text-slate-300">
                        {result.description || 'No description available.'}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        ID
                      </dt>
                      <dd>
                        <CopyId id={result.id} />
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="border-t border-slate-200 p-5 dark:border-slate-800">
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white ${accent.bg} transition-opacity hover:opacity-90`}
                  >
                    Open on {result.database} <ExternalLink size={14} />
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
