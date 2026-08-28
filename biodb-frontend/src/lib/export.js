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
