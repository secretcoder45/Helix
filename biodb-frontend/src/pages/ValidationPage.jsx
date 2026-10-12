import { ExternalLink } from 'lucide-react'
import { useServerProvenance } from '../lib/api'
import { Card, PageHeader, Scroller, Skeleton } from '../components/ui'

/**
 * What is checked, against what, and by which test.
 *
 * Each claim names the tests that enforce it, linked to their source, so a
 * reader can verify the claim rather than take it on trust. "Against" says
 * what the result is compared with — an independent implementation, known
 * biology, or an invariant that must hold whatever the input — because a test
 * that only compares a function with itself proves very little.
 */

const REPO = 'https://github.com/secretcoder45/Helix'
const testsUrl = (file) => `${REPO}/blob/main/biodb-backend/${file}`

const AGAINST = {
  reference: { label: 'Independent implementation', tone: 'bg-accent-soft text-accent-hover dark:text-accent' },
  biology: { label: 'Known biology', tone: 'bg-ok-soft text-ok' },
  invariant: { label: 'Invariant', tone: 'bg-surface-2 text-ink-2' },
  live: { label: 'Live database', tone: 'bg-warn-soft text-warn' },
}

const GROUPS = [
  {
    tool: 'Alignment',
    file: 'test_alignment.py',
    checks: [
      {
        claim: 'Global and local scores agree with Biopython’s PairwiseAligner to within 0.01, across BLOSUM45, BLOSUM62, BLOSUM80, PAM250, DNA scoring and four gap settings.',
        against: 'reference',
        tests: [
          'test_protein_score_matches_biopython_across_matrices',
          'test_protein_score_matches_biopython_across_gap_penalties',
          'test_local_score_matches_biopython_across_matrices',
          'test_local_score_matches_biopython_across_gap_penalties',
          'test_dna_score_matches_biopython',
        ],
      },
      {
        claim: 'Removing the gaps from an alignment gives back the input sequences exactly, and a local alignment is always a true subsequence of each input.',
        against: 'invariant',
        tests: [
          'test_alignment_reconstructs_to_original_sequences_minus_gaps',
          'test_local_alignment_reconstructs_to_a_real_subsequence',
        ],
      },
      {
        claim: 'A local score is never lower than the global score for the same pair, and the textbook Smith–Waterman example is reproduced.',
        against: 'invariant',
        tests: ['test_local_never_scores_below_global', 'test_local_classic_textbook_example'],
      },
    ],
  },
  {
    tool: 'Protein properties',
    file: 'test_alignment.py',
    checks: [
      {
        claim: 'For human insulin, molecular weight, isoelectric point and GRAVY match Biopython’s ProtParam.',
        against: 'reference',
        tests: ['test_properties_match_biopython_reference'],
      },
      {
        claim: 'The titration curve crosses zero net charge at exactly the reported pI and falls monotonically with pH.',
        against: 'invariant',
        tests: [
          'test_titration_curve_crosses_zero_at_the_reported_pi',
          'test_titration_curve_is_monotonically_decreasing',
        ],
      },
    ],
  },
  {
    tool: 'DNA toolkit',
    file: 'test_dna.py',
    checks: [
      {
        claim: 'From human insulin’s coding sequence, the ORF finder recovers frame +1, positions 1–333, and translates it to the exact UniProt protein.',
        against: 'biology',
        tests: ['test_finds_the_real_insulin_orf'],
      },
      {
        claim: 'Every reported ORF’s coordinates — on either strand — translate back to the protein reported for it, and every ORF ends at a stop codon.',
        against: 'invariant',
        tests: ['test_orf_coordinates_round_trip_to_the_reported_protein', 'test_orfs_are_stop_terminated'],
      },
    ],
  },
  {
    tool: 'Phylogeny',
    file: 'test_phylo.py',
    checks: [
      {
        claim: 'UPGMA splits IGF-1 off first and keeps human, pig and mouse insulin together; neighbour-joining pairs the two closest sequences.',
        against: 'biology',
        tests: ['test_upgma_places_igf1_outside_the_insulins', 'test_nj_splits_the_closest_pair_from_the_rest'],
      },
      {
        claim: 'Distance matrices are symmetric with a zero diagonal, UPGMA trees are ultrametric, and every input sequence appears as exactly one leaf.',
        against: 'invariant',
        tests: [
          'test_distance_matrix_is_symmetric_with_zero_diagonal',
          'test_upgma_is_ultrametric',
          'test_tree_preserves_every_sequence_as_a_leaf',
        ],
      },
    ],
  },
  {
    tool: 'Restriction map',
    file: 'test_restriction.py',
    checks: [
      {
        claim: 'Fragments always sum to the sequence length, for linear and circular DNA, and a single cut linearises a circle but splits a line in two.',
        against: 'invariant',
        tests: [
          'test_fragments_sum_to_sequence_length_linear',
          'test_fragments_sum_to_sequence_length_circular',
          'test_single_cut_linearises_a_circle_but_splits_a_line',
        ],
      },
      {
        claim: 'The expected enzymes are found in a known polylinker, and enzymes reported as unique cutters cut exactly once.',
        against: 'biology',
        tests: ['test_finds_expected_polylinker_enzymes', 'test_unique_cutters_cut_exactly_once'],
      },
    ],
  },
  {
    tool: 'Primer design',
    file: 'test_primer.py',
    checks: [
      {
        claim: 'Every primer returned meets the stated Tm, GC and length criteria, matches the template at its reported coordinates, and gives the reported product size.',
        against: 'invariant',
        tests: [
          'test_every_primer_satisfies_the_stated_criteria',
          'test_forward_primer_matches_the_template_at_its_coordinates',
          'test_reverse_primer_matches_the_template_at_its_coordinates',
          'test_product_size_matches_the_coordinates',
        ],
      },
    ],
  },
  {
    tool: 'Cross-reference & variants',
    file: 'test_projects.py',
    checks: [
      {
        claim: 'For BRCA1, the KEGG identifier must match NCBI Gene 672 — if sources disagree, the records describe different genes.',
        against: 'live',
        tests: ['test_entity_cross_references_agree'],
      },
      {
        claim: 'Exact gene symbols win over substring matches: INS resolves to insulin (P01308), not the INS-IGF2 readthrough. BRCA1, TP53, EGFR and CFTR resolve to their reviewed human entries.',
        against: 'live',
        tests: [
          'test_exact_gene_symbol_beats_substring_match',
          'test_canonical_symbols_resolve_to_reviewed_human_entries',
        ],
      },
      {
        claim: 'BRCA1 p.Arg1699Trp, a known pathogenic variant, matches the reference residue, lands in the BRCT domain and is reported as non-conservative.',
        against: 'live',
        file: 'test_variant.py',
        tests: ['test_known_pathogenic_brca1_variant', 'test_reference_mismatch_is_reported_not_swallowed'],
      },
    ],
  },
  {
    tool: 'Provenance & methods export',
    file: 'test_provenance.py',
    checks: [
      {
        claim: 'Sequence checksums are UniProt’s own CRC64, so a saved sequence can be checked against UniProt without trusting Helix.',
        against: 'reference',
        tests: ['test_checksum_matches_uniprots_own_crc64'],
      },
      {
        claim: 'The methods export never states a database release that was not recorded, and states gap penalties with their scoring convention.',
        against: 'invariant',
        tests: [
          'test_methods_never_claims_a_release_that_was_not_recorded',
          'test_methods_states_alignment_parameters_and_gap_convention',
        ],
      },
      {
        claim: 'Databases created before migrations existed are upgraded in place without losing a row, and migrations produce exactly the schema the models describe.',
        against: 'invariant',
        tests: [
          'test_database_from_before_migrations_is_upgraded_in_place',
          'test_migrations_produce_exactly_the_schema_the_models_describe',
        ],
      },
    ],
  },
]

function shortDate(iso) {
  if (!iso) return null
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function ServerPanel() {
  const { data, isLoading, isError } = useServerProvenance()
  const rows = data && [
    [
      'Helix',
      <>
        {data.helix.version}
        {data.helix.commit && (
          <a
            href={`${REPO}/commit/${data.helix.commit}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-accent hover:text-accent-hover"
          >
            {data.helix.commit}
          </a>
        )}
      </>,
    ],
    ['Biopython', data.libraries.biopython || '—'],
    ...Object.entries(data.sources).map(([name, s]) => [
      name,
      s.release
        ? `${s.release}${s.release_date ? ` · ${shortDate(s.release_date)}` : ''}`
        : s.release_date
          ? `updated ${shortDate(s.release_date)}`
          : '—',
    ]),
  ]

  return (
    <Card className="p-5">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        This server, right now
      </p>
      <p className="m-0 mt-1 text-[12px] leading-relaxed text-ink-3">
        The build answering your requests and the source releases it is reading. Saved results
        record these at the moment they are retrieved.
      </p>
      {isLoading && <Skeleton className="mt-4 h-32" />}
      {isError && <p className="mt-4 text-[12px] text-danger">Couldn’t reach the server.</p>}
      {rows && (
        <dl className="m-0 mt-4 divide-y divide-line border-y border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2">
              <dt className="text-[12px] text-ink-2">{k}</dt>
              <dd className="m-0 truncate font-mono text-[12px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}

function RunsPanel() {
  const runs = [
    {
      name: 'Offline suite',
      when: 'Every push to main',
      what: 'All tests that need nothing outside the repository, plus a production build of this interface.',
      workflow: 'tests.yml',
    },
    {
      name: 'Live checks',
      when: 'Weekly, Mondays',
      what: 'Tests that query UniProt, NCBI, KEGG and AlphaFold DB, to catch upstream changes the offline suite can’t.',
      workflow: 'live-checks.yml',
    },
  ]
  return (
    <Card className="p-5">
      <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        Test runs
      </p>
      <ul className="m-0 mt-3 list-none space-y-4 p-0">
        {runs.map((r) => (
          <li key={r.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{r.name}</span>
              <a
                href={`${REPO}/actions/workflows/${r.workflow}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${r.name} status on GitHub Actions`}
              >
                <img
                  src={`${REPO}/actions/workflows/${r.workflow}/badge.svg?branch=main`}
                  alt={`${r.name} status`}
                  className="h-5"
                />
              </a>
            </div>
            <p className="m-0 mt-0.5 text-[11.5px] text-ink-3">{r.when}</p>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-ink-2">{r.what}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function ValidationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Validation"
        title="How Helix is checked"
        description="Bugs in bioinformatics rarely crash — they return a plausible number that happens to be wrong. Each claim below names the tests that enforce it, and what the result is compared against."
      />
      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="grid gap-4 md:grid-cols-2">
            <ServerPanel />
            <RunsPanel />
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.values(AGAINST).map((a) => (
              <span key={a.label} className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${a.tone}`}>
                {a.label}
              </span>
            ))}
          </div>

          {GROUPS.map((g) => (
            <section key={g.tool}>
              <h2 className="font-display m-0 text-[18px] font-semibold text-ink">{g.tool}</h2>
              <Card className="mt-3 divide-y divide-line">
                {g.checks.map((c) => {
                  const file = c.file || g.file
                  const a = AGAINST[c.against]
                  return (
                    <div key={c.claim} className="px-5 py-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <p className="m-0 text-[13px] leading-relaxed text-ink">{c.claim}</p>
                        <span
                          className={`shrink-0 self-start whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-medium ${a.tone}`}
                        >
                          {a.label}
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {c.tests.map((t) => (
                          <code key={t} className="text-[10.5px] text-ink-3">
                            {t}
                          </code>
                        ))}
                        <a
                          href={testsUrl(file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[11px] text-accent hover:text-accent-hover"
                        >
                          {file} <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      </Scroller>
    </>
  )
}
