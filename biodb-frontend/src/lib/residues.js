/**
 * Residue reference data.
 *
 * These are published constants, not preferences — the Kyte-Doolittle values
 * in particular are the canonical 1982 hydropathy scale and a transcription
 * error here would quietly skew every hydropathy plot downstream.
 */

// Kyte & Doolittle (1982), J Mol Biol 157:105-132. Positive = hydrophobic.
export const KD_HYDROPATHY = {
  A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5,
  Q: -3.5, E: -3.5, G: -0.4, H: -3.2, I: 4.5,
  L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6,
  S: -0.8, T: -0.7, W: -0.9, Y: -1.3, V: 4.2,
}

export const KD_MIN = -4.5
export const KD_MAX = 4.5

export const THREE_LETTER = {
  A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys',
  Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile',
  L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro',
  S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val',
}

export const FULL_NAME = {
  A: 'Alanine', R: 'Arginine', N: 'Asparagine', D: 'Aspartic acid', C: 'Cysteine',
  Q: 'Glutamine', E: 'Glutamic acid', G: 'Glycine', H: 'Histidine', I: 'Isoleucine',
  L: 'Leucine', K: 'Lysine', M: 'Methionine', F: 'Phenylalanine', P: 'Proline',
  S: 'Serine', T: 'Threonine', W: 'Tryptophan', Y: 'Tyrosine', V: 'Valine',
}

// Four classes rather than five: the categorical palette validates four hues
// all-pairs, and in a sequence any residue can neighbour any other, so
// all-pairs is the gate that applies. Acidic/basic are not lost — they are a
// polarity, which the diverging "charge" mode encodes properly.
export const CLASS_OF = {
  A: 'hydrophobic', V: 'hydrophobic', L: 'hydrophobic', I: 'hydrophobic',
  M: 'hydrophobic', F: 'hydrophobic', W: 'hydrophobic', C: 'hydrophobic',
  S: 'polar', T: 'polar', N: 'polar', Q: 'polar', Y: 'polar',
  D: 'charged', E: 'charged', K: 'charged', R: 'charged', H: 'charged',
  G: 'special', P: 'special',
}

export const CLASS_LABEL = {
  hydrophobic: 'Hydrophobic',
  polar: 'Polar',
  charged: 'Charged',
  special: 'Special (Gly/Pro)',
}

// H is only weakly protonated at physiological pH; shown as positive by
// convention, which is why the tooltip says so rather than the colour alone.
export const CHARGE_OF = {
  D: -1, E: -1,
  K: 1, R: 1, H: 1,
}

export const NUCLEOTIDES = new Set(['A', 'C', 'G', 'T', 'U', 'N'])

export function isNucleotideSequence(seq) {
  if (!seq) return false
  const sample = seq.slice(0, 200).toUpperCase()
  let known = 0
  for (const ch of sample) if (NUCLEOTIDES.has(ch)) known += 1
  // Protein sequences do contain A/C/G/T, so require a strong majority
  // before treating a sequence as nucleotide.
  return known / sample.length > 0.9
}

/** Sliding-window mean hydropathy — the standard Kyte-Doolittle plot. */
export function hydropathyProfile(sequence, window = 9) {
  const seq = sequence.toUpperCase()
  const half = Math.floor(window / 2)
  const out = []
  for (let i = 0; i < seq.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(seq.length - 1, i + half); j++) {
      const v = KD_HYDROPATHY[seq[j]]
      if (v !== undefined) {
        sum += v
        n += 1
      }
    }
    out.push(n ? sum / n : 0)
  }
  return out
}

/** Counts per residue, descending. */
export function composition(sequence) {
  const counts = new Map()
  for (const ch of sequence.toUpperCase()) {
    if (KD_HYDROPATHY[ch] === undefined) continue
    counts.set(ch, (counts.get(ch) || 0) + 1)
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0)
  return {
    total,
    entries: [...counts.entries()]
      .map(([residue, count]) => ({
        residue,
        count,
        pct: total ? (100 * count) / total : 0,
        klass: CLASS_OF[residue],
      }))
      .sort((a, b) => b.count - a.count),
  }
}

/** Totals per property class, for the composition summary. */
export function classComposition(sequence) {
  const counts = { hydrophobic: 0, polar: 0, charged: 0, special: 0 }
  let total = 0
  for (const ch of sequence.toUpperCase()) {
    const k = CLASS_OF[ch]
    if (!k) continue
    counts[k] += 1
    total += 1
  }
  return Object.entries(counts).map(([klass, count]) => ({
    klass,
    count,
    pct: total ? (100 * count) / total : 0,
  }))
}
