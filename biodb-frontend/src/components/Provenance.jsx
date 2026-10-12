/**
 * How a result's provenance is shown: which release of which database, which
 * version of the record, and which Helix build fetched it.
 *
 * One component so the same facts read the same way on every page. It prints
 * only what was recorded — a missing release is simply absent, never filled
 * in — and says so when a record was captured at save time rather than at
 * retrieval.
 */

function shortDate(iso) {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** The facts as short labelled parts, most important first. */
function provenanceParts(p) {
  if (!p) return []
  const parts = []
  const db = p.database

  if (p.release) {
    parts.push({ key: 'release', text: `${db} ${p.release}` })
  } else if (p.release_date && db !== 'AlphaFold DB') {
    parts.push({ key: 'release', text: `${db}, updated ${shortDate(p.release_date)}` })
  } else if (db) {
    parts.push({ key: 'release', text: db })
  }

  if (p.record_version) {
    parts.push({
      key: 'version',
      text: db === 'AlphaFold DB' ? `model v${p.record_version}` : `entry v${p.record_version}`,
    })
  }
  if (p.sequence_version) parts.push({ key: 'seq', text: `sequence v${p.sequence_version}` })
  if (p.checksum) parts.push({ key: 'checksum', text: p.checksum, mono: true })
  if (p.helix?.version) {
    parts.push({
      key: 'helix',
      text: `Helix ${p.helix.version}${p.helix.commit ? ` (${p.helix.commit})` : ''}`,
    })
  }
  return parts
}

export function ProvenanceLine({ provenance, className = '' }) {
  const parts = provenanceParts(provenance)
  if (!parts.length) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}>
      {parts.map((part, i) => (
        <span key={part.key} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">·</span>}
          <span className={part.mono ? 'font-mono' : ''}>{part.text}</span>
        </span>
      ))}
      {provenance?.captured === 'save' && (
        <span className="text-warn" title="Saved by an older version, which did not record the release at retrieval">
          · recorded at save
        </span>
      )}
    </span>
  )
}
