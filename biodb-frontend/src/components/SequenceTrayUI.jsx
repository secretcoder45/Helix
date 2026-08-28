import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FlaskConical, Check, X, GitCompareArrows, Trash2, Loader2, Plus } from 'lucide-react'
import { useSequenceTray } from '../context/SequenceTray'
import { API_URL } from '../lib/api'
import axios from 'axios'

/**
 * Adds a sequence to the shared tray. Two modes:
 *  - the caller already has the sequence (entity page, batch results)
 *  - the caller only has an accession (BLAST hits, saved project items), in
 *    which case the sequence is fetched on demand so the user doesn't have
 *    to go find it themselves.
 */
export function AddToTrayButton({ entry, accession, size = 'sm', className = '' }) {
  const { add, has } = useSequenceTray()
  const [loading, setLoading] = useState(false)
  const [justAdded, setJustAdded] = useState(false)

  const id = entry?.id || accession
  const inTray = has(id)

  const handle = async (e) => {
    e.stopPropagation()
    if (inTray || loading) return

    if (entry?.sequence) {
      add(entry)
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 1400)
      return
    }

    setLoading(true)
    try {
      const { data } = await axios.get(`${API_URL}/sequence/${encodeURIComponent(accession)}`)
      add({
        id: data.accession,
        label: data.name || data.accession,
        sublabel: data.protein_name || data.organism,
        sequence: data.sequence,
        type: 'protein',
        source: 'UniProt',
      })
      setJustAdded(true)
      setTimeout(() => setJustAdded(false), 1400)
    } catch {
      /* sequence unavailable — button simply doesn't add */
    } finally {
      setLoading(false)
    }
  }

  const height = size === 'xs' ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]'

  return (
    <button
      onClick={handle}
      disabled={inTray || loading}
      title={inTray ? 'Already in sequence tray' : 'Add sequence to tray for alignment'}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border font-medium transition-colors ${height} ${
        inTray || justAdded
          ? 'border-ok/30 bg-ok-soft text-ok'
          : 'border-line text-ink-2 hover:border-accent hover:text-accent'
      } ${className}`}
    >
      {loading ? (
        <Loader2 size={11} className="animate-spin" />
      ) : inTray || justAdded ? (
        <Check size={11} />
      ) : (
        <Plus size={11} />
      )}
      {inTray || justAdded ? 'In tray' : 'Tray'}
    </button>
  )
}

/**
 * Tray indicator + panel, mounted in the app shell so it's reachable from
 * every page.
 */
export function SequenceTrayPanel() {
  const { entries, remove, clear, count } = useSequenceTray()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState([])
  const navigate = useNavigate()

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id],
    )
  }

  const alignSelected = () => {
    const picked = selected.map((id) => entries.find((e) => e.id === id)).filter(Boolean)
    if (picked.length !== 2) return
    // Hand off through sessionStorage rather than the URL: sequences can be
    // 1000 residues, which would blow past practical URL length limits.
    try {
      sessionStorage.setItem('helix-align-handoff', JSON.stringify(picked))
    } catch {
      /* fall through — AlignPage handles a missing handoff */
    }
    setOpen(false)
    setSelected([])
    navigate('/align?from=tray')
  }

  if (count === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[12px] font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent"
        title="Sequence tray"
      >
        <FlaskConical size={14} />
        <span className="tnum">{count}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.13 }}
              className="absolute right-5 top-14 z-50 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Sequence tray
                </p>
                <button
                  onClick={clear}
                  className="text-[11px] text-ink-3 transition-colors hover:text-danger"
                >
                  Clear
                </button>
              </div>

              <p className="border-b border-line bg-surface-2/40 px-3 py-2 text-[11px] text-ink-3">
                Pick two to align — {selected.length}/2 selected
              </p>

              <ul className="max-h-64 overflow-y-auto p-1.5">
                {entries.map((e) => {
                  const isSelected = selected.includes(e.id)
                  return (
                    <li key={e.id}>
                      <button
                        onClick={() => toggle(e.id)}
                        className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                          isSelected ? 'bg-accent-soft' : 'hover:bg-surface-2'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                            isSelected ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong'
                          }`}
                        >
                          {isSelected && <Check size={9} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[12px] font-medium text-ink">
                            {e.label}
                          </span>
                          <span className="block truncate text-[10px] text-ink-3">
                            {e.sublabel || e.source} · {e.sequence.length} aa
                          </span>
                        </span>
                        <span
                          onClick={(ev) => {
                            ev.stopPropagation()
                            remove(e.id)
                            setSelected((p) => p.filter((x) => x !== e.id))
                          }}
                          className="shrink-0 rounded p-1 text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <X size={11} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <div className="border-t border-line p-2">
                <button
                  onClick={alignSelected}
                  disabled={selected.length !== 2}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
                >
                  <GitCompareArrows size={13} /> Align selected
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
