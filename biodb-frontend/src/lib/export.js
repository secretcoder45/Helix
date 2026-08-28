/**
 * Export helpers for saved project items.
 *
 * Researchers need to get data *out* of a tool to use it — into a spreadsheet,
 * a methods section, or a lab notebook. Provenance (source database + retrieval
 * date) travels with every export, since that's what makes a citation valid.
 */

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  const s = String(value ?? '')
  // Quote if the value contains a delimiter, quote, or newline
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(projectName, items) {
  const headers = ['id', 'name', 'database', 'description', 'link', 'retrieved_at', 'notes']
  const rows = items.map((i) =>
    [i.external_id, i.name, i.database, i.description, i.link, i.retrieved_at, i.notes]
      .map(csvCell)
      .join(','),
  )
  const csv = [headers.join(','), ...rows].join('\n')
  download(`${slug(projectName)}.csv`, csv, 'text/csv;charset=utf-8')
}

export function exportCitations(projectName, items) {
  const lines = items.map((i) => {
    const retrieved = i.retrieved_at
      ? new Date(i.retrieved_at).toISOString().split('T')[0]
      : 'unknown date'
    return `${i.name} (${i.external_id}). ${i.database}. Retrieved ${retrieved}. ${i.link}`
  })
  const text = `Data sources for: ${projectName}\n\n${lines.join('\n\n')}\n`
  download(`${slug(projectName)}-citations.txt`, text, 'text/plain;charset=utf-8')
}

export function exportJson(projectName, items) {
  download(
    `${slug(projectName)}.json`,
    JSON.stringify(items, null, 2),
    'application/json',
  )
}

function slug(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  )
}

/**
 * Export batch results. Separate from the project exporters because a batch
 * row is a flat annotation record, not a saved item — different columns, and
 * unresolved rows are kept so the researcher can see what didn't match rather
 * than silently getting a shorter list back than they pasted.
 */
export function exportBatchCsv(rows) {
  const headers = [
    'query',
    'resolved',
    'accession',
    'entry_name',
    'protein_name',
    'organism',
    'genes',
    'length_aa',
    'molecular_weight_da',
    'structure_count',
    'structures',
    'pathways',
    'gene_id',
    'link',
    'retrieved_at',
  ]

  const body = rows.map((r) =>
    [
      r.query,
      r.resolved ? 'yes' : 'no',
      r.accession,
      r.name,
      r.protein_name,
      r.organism,
      (r.genes || []).join('; '),
      r.length,
      r.molecular_weight,
      r.structure_count,
      (r.structures || []).join('; '),
      (r.pathways || []).join('; '),
      r.gene_id,
      r.link,
      r.retrieved_at,
    ]
      .map(csvCell)
      .join(','),
  )

  download(
    `batch-annotation-${new Date().toISOString().split('T')[0]}.csv`,
    [headers.join(','), ...body].join('\n'),
    'text/csv;charset=utf-8',
  )
}

export function exportBatchFasta(rows) {
  const withSeq = rows.filter((r) => r.resolved && r.sequence)
  if (!withSeq.length) return
  const text = withSeq
    .map(
      (r) =>
        `>${r.accession}|${r.name} ${r.protein_name} OS=${r.organism}\n${r.sequence.replace(
          /(.{60})/g,
          '$1\n',
        )}`,
    )
    .join('\n')
  download(
    `batch-sequences-${new Date().toISOString().split('T')[0]}.fasta`,
    `${text}\n`,
    'text/plain;charset=utf-8',
  )
}
