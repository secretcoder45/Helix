import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, Play, Trash2, AlertTriangle, Info } from 'lucide-react'
import { useProperties } from '../lib/api'
import { useSequenceTray } from '../context/SequenceTray'
import { hydropathyProfile, composition, CLASS_OF } from '../lib/residues'
import { LineChart, BarChart, StatTile } from '../components/charts'
import { Button, Card, CardHeader, EmptyState, PageHeader, Scroller } from '../components/ui'

const SAMPLE =
  'MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN'

const CLASS_VAR = {
  hydrophobic: '--res-hydrophobic',
  polar: '--res-polar',
  charged: '--res-charged',
  special: '--res-special',
}

function TitrationCard({ result }) {
  const data = useMemo(
    () => result.titration_curve.map((p) => ({ x: p.ph, y: p.charge })),
    [result],
  )
  return (
    <Card>
      <CardHeader
        title="Titration curve"
        subtitle="Net charge across pH — the isoelectric point is where it crosses zero"
      />
      <div className="p-4">
        <LineChart
          data={data}
          height={210}
          zeroLine
          color="var(--res-basic)"
          xLabel="pH"
          yLabel="net charge"
          marker={{ x: result.isoelectric_point, label: `pI ${result.isoelectric_point}` }}
          formatX={(v) => v.toFixed(0)}
          formatY={(v) => v.toFixed(0)}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          Positive below the pI, negative above it. At pH 7 this protein carries a net charge of{' '}
          <span className="tnum font-medium text-ink-2">{result.charge_at_ph7}</span>, which is what
          determines how it behaves in ion-exchange chromatography and electrophoresis.
        </p>
      </div>
    </Card>
  )
}

function HydropathyCard({ sequence }) {
  const [window, setWindow] = useState(9)
  const data = useMemo(
    () => hydropathyProfile(sequence, window).map((y, i) => ({ x: i + 1, y })),
    [sequence, window],
  )
  const peak = useMemo(() => data.reduce((a, b) => (b.y > a.y ? b : a), data[0]), [data])

  return (
    <Card>
      <CardHeader
        title="Hydropathy"
        subtitle={`Kyte–Doolittle, ${window}-residue window`}
        action={
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-ink-3">window</span>
            <select
              value={window}
              onChange={(e) => setWindow(Number(e.target.value))}
              className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink outline-none focus:border-accent"
            >
              {[5, 7, 9, 11, 13, 19, 21].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <div className="p-4">
        <LineChart
          data={data}
          height={190}
          yMin={-4.5}
          yMax={4.5}
          zeroLine
          fillArea
          color="var(--res-hydrophobic)"
          xLabel="residue position"
          yLabel="hydropathy"
          formatX={(v) => Math.round(v)}
          formatY={(v) => v.toFixed(1)}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          Above zero is hydrophobic. Sustained peaks over ~1.8 across a 19-residue window are the
          classic signature of a membrane-spanning helix; the strongest peak here is{' '}
          <span className="tnum font-medium text-ink-2">
            {peak.y.toFixed(2)} at residue {peak.x}
          </span>
          .
        </p>
      </div>
    </Card>
  )
}

function CompositionCard({ sequence }) {
  const comp = useMemo(() => composition(sequence), [sequence])
  return (
    <Card>
      <CardHeader title="Amino acid composition" count={comp.total} />
      <div className="p-4">
        <BarChart
          data={comp.entries.map((e) => ({
            label: e.residue,
            value: e.count,
            klass: e.klass,
          }))}
          colorOf={(d) => `var(${CLASS_VAR[d.klass] || '--res-neutral'})`}
          formatValue={(v) => `${((100 * v) / comp.total).toFixed(1)}%`}
        />
      </div>
    </Card>
  )
}

export function PropertiesPage() {
  const [sequence, setSequence] = useState('')
  const props = useProperties()
  const { entries } = useSequenceTray()

  const run = (e) => {
    e.preventDefault()
    if (!sequence.trim()) return
    props.mutate(sequence)
  }

  const result = props.data
  const clean = result?.sequence

  return (
    <>
      <PageHeader
        eyebrow="Protein analysis"
        title="Properties"
        description="Physicochemical properties computed locally — mass, isoelectric point, stability, and the curves behind them."
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card className="overflow-hidden">
            <form onSubmit={run}>
              <textarea
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                rows={4}
                spellCheck={false}
                placeholder={'Paste a protein sequence — FASTA headers are handled.'}
                className="w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tnum text-[11px] text-ink-3">
                    {sequence.replace(/^>.*$/gm, '').replace(/\s/g, '').length} residues
                  </span>
                  {entries.length > 0 && (
                    <select
                      onChange={(e) => {
                        const found = entries.find((x) => x.id === e.target.value)
                        if (found) setSequence(found.sequence)
                      }}
                      value=""
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-accent"
                    >
                      <option value="">From tray…</option>
                      {entries.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!sequence && (
                    <Button type="button" size="sm" onClick={() => setSequence(SAMPLE)}>
                      Use sample
                    </Button>
                  )}
                  {sequence && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSequence('')
                        props.reset()
                      }}
                    >
                      <Trash2 size={12} /> Clear
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!sequence.trim() || props.isPending}
                    loading={props.isPending}
                  >
                    {!props.isPending && <Play size={12} />}
                    {props.isPending ? 'Analysing…' : 'Analyse'}
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {props.isError && (
            <Card className="border-danger/30 bg-danger-soft p-4">
              <div className="flex gap-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[13px] text-ink">
                  {props.error?.response?.data?.detail || 'Analysis failed.'}
                </p>
              </div>
            </Card>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <Card>
                <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-3 lg:grid-cols-5">
                  <StatTile label="Length" value={result.length} unit="aa" />
                  <StatTile
                    label="Mass"
                    value={(result.molecular_weight / 1000).toFixed(2)}
                    unit="kDa"
                  />
                  <StatTile label="Isoelectric pt" value={result.isoelectric_point} unit="pI" />
                  <StatTile
                    label="GRAVY"
                    value={result.gravy.toFixed(3)}
                    hint={result.gravy > 0 ? 'overall hydrophobic' : 'overall hydrophilic'}
                  />
                  <StatTile
                    label="Instability"
                    value={result.instability_index}
                    tone={result.stable ? 'ok' : 'warn'}
                    hint={result.stable ? 'predicted stable' : 'predicted unstable (>40)'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-5 border-t border-line px-5 py-4 sm:grid-cols-4">
                  <StatTile
                    label="Charge at pH 7"
                    value={result.charge_at_ph7 > 0 ? `+${result.charge_at_ph7}` : result.charge_at_ph7}
                  />
                  <StatTile label="Aromaticity" value={result.aromaticity.toFixed(3)} />
                  <StatTile
                    label="ε (reduced)"
                    value={result.extinction_coefficient.reduced.toLocaleString()}
                    unit="M⁻¹cm⁻¹"
                  />
                  <StatTile
                    label="ε (cystines)"
                    value={result.extinction_coefficient.cystines.toLocaleString()}
                    unit="M⁻¹cm⁻¹"
                  />
                </div>
              </Card>

              <TitrationCard result={result} />
              <HydropathyCard sequence={clean} />
              <CompositionCard sequence={clean} />

              <p className="flex items-start gap-1.5 pb-2 text-[11px] leading-relaxed text-ink-3">
                <Info size={12} className="mt-0.5 shrink-0" />
                Computed with the same models as ExPASy ProtParam — Kyte–Doolittle hydropathy,
                Guruprasad instability index, and Bjellqvist pKa values for the titration curve.
                All computed locally; nothing is sent to an external service.
              </p>
            </motion.div>
          )}

          {!result && !props.isPending && (
            <Card className="border-dashed">
              <EmptyState
                icon={FlaskConical}
                title="Characterise a protein"
                description="Mass, isoelectric point, stability and extinction coefficient — plus the titration and hydropathy curves those numbers come from, rather than the numbers alone."
              />
            </Card>
          )}
        </div>
      </Scroller>
    </>
  )
}
