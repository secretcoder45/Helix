import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Play, ShieldAlert, Check, Info, ExternalLink } from 'lucide-react'
import { useVariant } from '../lib/api'
import { StatTile } from '../components/charts'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

const EXAMPLES = [
  { gene: 'BRCA1', variant: 'p.Arg1699Trp', note: 'known pathogenic, BRCT domain' },
  { gene: 'TP53', variant: 'p.Arg175His', note: 'hotspot mutation' },
  { gene: 'CFTR', variant: 'p.Gly551Asp', note: 'cystic fibrosis' },
]

export function VariantPage() {
  const [gene, setGene] = useState('')
  const [variant, setVariant] = useState('')
  const v = useVariant()
  const r = v.data

  const run = (e) => {
    e.preventDefault()
    if (!gene.trim() || !variant.trim()) return
    v.mutate({ gene: gene.trim(), variant: variant.trim() })
  }

  return (
    <>
      <PageHeader
        eyebrow="Variant interpretation"
        title="Missense analysis"
        description="What is already known about a substitution — domain context, chemistry, and recorded clinical significance."
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Card className="p-4">
            <form onSubmit={run} className="flex flex-wrap items-end gap-2">
              <label className="min-w-[8rem] flex-1 text-[11px] text-ink-2">
                Gene or accession
                <input
                  value={gene}
                  onChange={(e) => setGene(e.target.value)}
                  placeholder="BRCA1"
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="min-w-[10rem] flex-1 text-[11px] text-ink-2">
                Variant
                <input
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  placeholder="p.Arg1699Trp or R1699W"
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent"
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                disabled={!gene.trim() || !variant.trim() || v.isPending}
                loading={v.isPending}
              >
                {!v.isPending && <Play size={13} />}
                {v.isPending ? 'Analysing…' : 'Analyse'}
              </Button>
            </form>

            {!r && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                <span className="mr-1 text-[11px] text-ink-3">Try</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.variant}
                    onClick={() => {
                      setGene(ex.gene)
                      setVariant(ex.variant)
                    }}
                    title={ex.note}
                    className="rounded-md border border-line px-2 py-1 font-mono text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
                  >
                    {ex.gene} {ex.variant}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {v.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-ink">
                  {v.error?.response?.data?.detail || 'Analysis failed.'}
                </p>
              </div>
            </Card>
          )}

          {r && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* The check that has to lead: does the reference residue match? */}
              {!r.reference_matches && (
                <Card className="border-warn/40 bg-warn-soft p-4">
                  <div className="flex gap-3">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        Reference residue doesn't match
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                        The variant says position {r.position} is{' '}
                        <span className="font-mono font-medium">{r.ref}</span>, but{' '}
                        {r.accession} has <span className="font-mono font-medium">{r.actual_residue}</span>{' '}
                        there. That usually means the numbering is against a different isoform —
                        everything below describes the wrong residue until it's resolved.
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              <Card>
                <div className="border-b border-line px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-[19px] font-semibold text-ink">
                      {r.gene} {r.notation}
                    </span>
                    <span className="font-mono text-[12px] text-ink-3">{r.accession}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-2">{r.protein_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
                  <StatTile
                    label="Position"
                    value={r.position}
                    hint={`of ${r.sequence_length}`}
                  />
                  <StatTile
                    label="Substitution"
                    value={`${r.ref} → ${r.alt}`}
                    tone={r.reference_matches ? undefined : 'warn'}
                  />
                  <StatTile
                    label="BLOSUM62"
                    value={r.blosum62 > 0 ? `+${r.blosum62}` : r.blosum62}
                    tone={r.conservative ? 'ok' : 'warn'}
                    hint={r.conservative ? 'conservative' : 'non-conservative'}
                  />
                  <StatTile
                    label="Charge change"
                    value={r.charge_change > 0 ? `+${r.charge_change}` : r.charge_change}
                    hint={`${r.class_change[0]} → ${r.class_change[1]}`}
                    tone={r.charge_change !== 0 ? 'warn' : undefined}
                  />
                </div>

                <div className="border-t border-line px-5 py-4">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                    Sequence context
                  </p>
                  <p className="font-mono text-[13px] leading-relaxed">
                    {[...r.context].map((ch, i) => {
                      const pos = r.context_offset + i
                      const isSite = pos === r.position
                      return (
                        <span
                          key={i}
                          className={
                            isSite
                              ? 'rounded bg-accent px-0.5 font-bold text-accent-contrast'
                              : 'text-ink-2'
                          }
                          title={`${pos}`}
                        >
                          {ch}
                        </span>
                      )
                    })}
                  </p>
                </div>
              </Card>

              {r.critical_features.length > 0 && (
                <Card className="border-warn/40 bg-warn-soft">
                  <div className="flex gap-3 p-4">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
                    <div>
                      <p className="text-[13px] font-semibold text-ink">
                        Falls on a functionally annotated residue
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {r.critical_features.map((f, i) => (
                          <li key={i} className="text-[12px] text-ink-2">
                            {f.type} · {f.description || 'no description'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              )}

              <Card>
                <CardHeader title="Structural context" count={r.features.length} />
                {r.features.length === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-ink-3">
                    No annotated feature covers this position.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {r.features.map((f, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                        <span className="text-[12px] text-ink">
                          <span className="font-medium">{f.type}</span>
                          {f.description && (
                            <span className="text-ink-2"> · {f.description}</span>
                          )}
                        </span>
                        <span className="tnum shrink-0 font-mono text-[11px] text-ink-3">
                          {f.start}–{f.end}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Known variants at this position"
                  count={r.known_variants.length}
                  subtitle="Curated in UniProt"
                />
                {r.known_variants.length === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-ink-3">
                    No variant is recorded at position {r.position}. That is not evidence of
                    benignity — most positions are simply unstudied.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {r.known_variants.map((k, i) => (
                      <li key={i} className="px-4 py-3">
                        <p className="text-[12px] leading-relaxed text-ink">{k.description}</p>
                        {k.dbsnp && (
                          <a
                            href={`https://www.ncbi.nlm.nih.gov/snp/${k.dbsnp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-accent hover:underline"
                          >
                            {k.dbsnp} <ExternalLink size={10} />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <p className="flex items-start gap-1.5 pb-2 text-[11px] leading-relaxed text-ink-3">
                <Info size={12} className="mt-0.5 shrink-0" />
                These are separate lines of evidence, deliberately not combined into a score.
                Collapsing them into one number would imply a calibrated predictor, which this is
                not — and a confident wrong number about a clinical variant is worse than none.
                Not for diagnostic use.
              </p>
            </motion.div>
          )}

          {!r && !v.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={ShieldAlert}
                title="Interpret a substitution"
                description="Checks the reference residue against the canonical sequence, locates the position within annotated domains and active sites, scores the chemistry of the swap, and surfaces any variant already recorded there."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
