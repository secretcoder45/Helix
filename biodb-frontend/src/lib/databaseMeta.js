import { Database as DatabaseIcon } from 'lucide-react'
import { DATABASE_ICONS } from './nav'

// Icon per database category, keyed to what the backend's /databases endpoint
// returns. Colour lives in the design tokens (see SourceBadge), keyed by
// source database rather than category — a protein search returns both UniProt
// and PDB rows, and those should stay visually distinguishable.
export function iconFor(key) {
  return DATABASE_ICONS[key] || DatabaseIcon
}
