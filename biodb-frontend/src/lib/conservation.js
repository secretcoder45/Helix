/**
 * Alignment column classification.
 *
 * "Similar" uses the Clustal strong-similarity groups — the same definition
 * behind the ':' symbol in Clustal output — rather than a home-grown notion of
 * similarity, so a column marked similar here means what it means everywhere
 * else a biologist has seen that symbol.
 */

const STRONG_GROUPS = [
  'STA', 'NEQK', 'NHQK', 'NDEQ', 'QHRK', 'MILV', 'MILF', 'HY', 'FYW',
].map((g) => new Set(g))

const WEAK_GROUPS = [
  'CSA', 'ATV', 'SAG', 'STNK', 'STPA', 'SGND', 'SNDEQK', 'NDEQHK', 'NEQHRK',
  'FVLIM', 'HFY',
].map((g) => new Set(g))

export const COLUMN = {
  IDENTICAL: 'identical',
  STRONG: 'strong',
  WEAK: 'weak',
  DIFFERENT: 'different',
  GAP: 'gap',
}

export function classifyColumn(a, b) {
  if (a === '-' || b === '-') return COLUMN.GAP
  if (a === b) return COLUMN.IDENTICAL
  if (STRONG_GROUPS.some((g) => g.has(a) && g.has(b))) return COLUMN.STRONG
  if (WEAK_GROUPS.some((g) => g.has(a) && g.has(b))) return COLUMN.WEAK
  return COLUMN.DIFFERENT
}

/** The conventional Clustal match line: '*' identical, ':' strong, '.' weak. */
export const MATCH_SYMBOL = {
  [COLUMN.IDENTICAL]: '*',
  [COLUMN.STRONG]: ':',
  [COLUMN.WEAK]: '.',
  [COLUMN.DIFFERENT]: ' ',
  [COLUMN.GAP]: ' ',
}

/** Ordinal strength, 0..1 — drives both the tint alpha and the minimap. */
export const COLUMN_STRENGTH = {
  [COLUMN.IDENTICAL]: 1,
  [COLUMN.STRONG]: 0.6,
  [COLUMN.WEAK]: 0.3,
  [COLUMN.DIFFERENT]: 0,
  [COLUMN.GAP]: 0,
}

export function classifyAlignment(alignedA, alignedB) {
  const out = []
  for (let i = 0; i < alignedA.length; i++) {
    out.push(classifyColumn(alignedA[i], alignedB[i]))
  }
  return out
}

/**
 * Downsample a per-column strength profile into `bins` buckets for the
 * minimap. A 1000-column alignment cannot render one mark per column in a
 * 600px strip, and drawing them anyway just produces moiré.
 */
export function binStrengths(columns, bins) {
  const n = columns.length
  if (!n) return []
  const size = n / bins
  const out = []
  for (let b = 0; b < bins; b++) {
    const from = Math.floor(b * size)
    const to = Math.max(from + 1, Math.floor((b + 1) * size))
    let sum = 0
    for (let i = from; i < to && i < n; i++) sum += COLUMN_STRENGTH[columns[i]] ?? 0
    out.push(sum / (to - from))
  }
  return out
}
