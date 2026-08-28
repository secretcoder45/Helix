import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * A staging area for sequences, shared across every tool.
 *
 * This is the piece that makes the app one product rather than five separate
 * pages: cross-reference, batch lookup, BLAST, and projects all produce
 * sequences, and the alignment tools consume them. Without somewhere to put
 * a sequence in between, moving one from a BLAST hit into an alignment means
 * copy-pasting it by hand — the exact manual step this app exists to remove.
 *
 * Persisted to localStorage so the tray survives navigation and reloads;
 * a sequence picked up on one page is still there when you reach another.
 */

const TRAY_KEY = 'helix-sequence-tray'
const MAX_ENTRIES = 12

const SequenceTrayContext = createContext(null)

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(TRAY_KEY) || '[]')
    return Array.isArray(raw) ? raw.slice(0, MAX_ENTRIES) : []
  } catch {
    return []
  }
}

export function SequenceTrayProvider({ children }) {
  const [entries, setEntries] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(TRAY_KEY, JSON.stringify(entries))
    } catch {
      /* storage unavailable (private mode, quota) — tray still works in-memory */
    }
  }, [entries])

  const add = useCallback((entry) => {
    if (!entry?.sequence) return false
    setEntries((prev) => {
      // Same accession twice is almost always an accident, but the same
      // sequence under two labels is legitimate (comparing annotations), so
      // dedupe on id rather than on sequence content.
      const withoutDupe = prev.filter((e) => e.id !== entry.id)
      return [
        {
          id: entry.id,
          label: entry.label || entry.id,
          sublabel: entry.sublabel || '',
          sequence: entry.sequence.replace(/\s/g, '').toUpperCase(),
          type: entry.type || 'protein',
          source: entry.source || '',
          addedAt: Date.now(),
        },
        ...withoutDupe,
      ].slice(0, MAX_ENTRIES)
    })
    return true
  }, [])

  const remove = useCallback((id) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const clear = useCallback(() => setEntries([]), [])

  const has = useCallback((id) => entries.some((e) => e.id === id), [entries])

  const value = useMemo(
    () => ({ entries, add, remove, clear, has, count: entries.length }),
    [entries, add, remove, clear, has],
  )

  return <SequenceTrayContext.Provider value={value}>{children}</SequenceTrayContext.Provider>
}

export function useSequenceTray() {
  const ctx = useContext(SequenceTrayContext)
  if (!ctx) throw new Error('useSequenceTray must be used inside SequenceTrayProvider')
  return ctx
}
