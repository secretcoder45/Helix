import { Dna, FlaskConical, Network, Waypoints, Pill, Database as DatabaseIcon } from 'lucide-react'

// Icon per database category, keyed to what the backend's /databases endpoint
// returns. Colour now lives in the design tokens (see SourceBadge), keyed by
// source database rather than category — a protein search returns both UniProt
// and PDB rows, and those should stay visually distinguishable.
export const DB_ICONS = {
  genomics: Dna,
  proteins: FlaskConical,
  pathways: Waypoints,
  sequences: Network,
  drugs: Pill,
}

export function iconFor(key) {
  return DB_ICONS[key] || DatabaseIcon
}
