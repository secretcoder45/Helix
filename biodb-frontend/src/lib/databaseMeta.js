import { Dna, FlaskConical, Network, Waypoints, Pill, Database as DatabaseIcon } from 'lucide-react'

// Visual metadata per database category — icon + accent color.
// Keyed by the same keys the backend's /databases endpoint returns.
export const DB_META = {
  genomics: { icon: Dna, color: 'emerald' },
  proteins: { icon: FlaskConical, color: 'indigo' },
  pathways: { icon: Waypoints, color: 'amber' },
  sequences: { icon: Network, color: 'sky' },
  drugs: { icon: Pill, color: 'rose' },
}

export function iconFor(key) {
  return DB_META[key]?.icon || DatabaseIcon
}

export function colorFor(key) {
  return DB_META[key]?.color || 'slate'
}
