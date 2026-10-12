import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Check, Moon, Search, Sun } from 'lucide-react'
import { Logo } from '../components/Logo'
import { InsulinFigure } from '../components/InsulinFigure'
import { useDarkMode } from '../hooks/useDarkMode'
import { API_URL } from '../lib/config'

/**
 * The front door.
 *
 * Kept deliberately light — no react-query, axios or framer-motion — because
 * it ships in the main bundle and has to render before the free-tier backend
 * has woken up. Every number on this page is a real result from the running
 * tools or a claim backed by a named test in the backend suite; nothing here
 * is illustrative.
 */

const GITHUB = 'https://github.com/secretcoder45/Helix'
const TRY = ['BRCA1', 'TP53', 'EGFR', 'CFTR', 'INS']

const TOOL_GROUPS = [
  {
    name: 'Look up',
    blurb: 'Find the record, and every record that belongs with it.',
    tools: [
      {
        to: '/lookup',
        name: 'Cross-reference',
        desc: 'One gene or protein resolved across UniProt, NCBI Gene, PDB, KEGG and AlphaFold, with its feature map, model confidence and related papers.',
        via: 'UniProt · NCBI · PDB · KEGG',
      },
      {
        to: '/batch',
        name: 'Batch lookup',
        desc: 'Paste a list of identifiers and get one table back. A bad row is reported on its own line instead of failing the batch.',
        via: 'UniProt · NCBI',
      },
      {
        to: '/blast',
        name: 'BLAST',
        desc: 'Similarity search submitted to NCBI and polled for you, with hits you can send straight to alignment.',
        via: 'NCBI',
      },
    ],
  },
  {
    name: 'Compare',
    blurb: 'Put sequences side by side and see what they share.',
    tools: [
      {
        to: '/align',
        name: 'Alignment',
        desc: 'Needleman–Wunsch global and Smith–Waterman local alignment with BLOSUM45/62/80 or PAM250 and affine gaps.',
        via: null,
      },
      {
        to: '/compare',
        name: 'Dot plot',
        desc: 'Windowed similarity between two sequences, for spotting repeats, inversions and shuffled domains at a glance.',
        via: null,
      },
      {
        to: '/phylo',
        name: 'Phylogeny',
        desc: 'Neighbour-joining and UPGMA trees, with the distance matrix behind them on show.',
        via: null,
      },
    ],
  },
  {
    name: 'Characterise',
    blurb: 'What a single sequence is, and what changes when it mutates.',
    tools: [
      {
        to: '/properties',
        name: 'Protein properties',
        desc: 'Mass, isoelectric point with its titration curve, extinction coefficient, hydropathy and stability indices.',
        via: null,
      },
      {
        to: '/dna',
        name: 'DNA toolkit',
        desc: 'Six-frame ORF map, GC landscape, translation, reverse complement and transcription.',
        via: null,
      },
      {
        to: '/variant',
        name: 'Variants',
        desc: 'A protein substitution in context: the chemistry that changes, its BLOSUM62 score, and the domains it lands in.',
        via: 'UniProt',
      },
    ],
  },
  {
    name: 'Design',
    blurb: 'From a sequence to something you can run at the bench.',
    tools: [
      {
        to: '/primers',
        name: 'Primer design',
        desc: 'PCR primer pairs filtered on Tm, GC content and product size — and, when none qualify, the reasons why.',
        via: null,
      },
      {
        to: '/restriction',
        name: 'Restriction map',
        desc: 'Cut sites for common enzymes on linear or circular DNA, and the gel you should expect to see.',
        via: null,
      },
    ],
  },
  {
    name: 'Keep',
    blurb: 'So that a result can be found, and traced, next month.',
    tools: [
      {
        to: '/projects',
        name: 'Projects',
        desc: 'Entities and alignments saved with their parameters, source database and retrieval time.',
        via: null,
      },
      {
        to: '/chat',
        name: 'Assistant',
        desc: 'Questions in plain language, answered from live UniProt, NCBI and KEGG results, with links to the records used.',
        via: 'Claude',
      },
    ],
  },
]

const WORKFLOW = [
  {
    verb: 'Look up',
    text: 'Type INS. Helix returns human insulin, not the INS-IGF2 readthrough that also matches the symbol.',
    result: 'INS → P01308 · 110 aa',
  },
  {
    verb: 'Collect',
    text: 'Drop the sequence in the tray, beside IGF-1 and insulins from other species. Alignment, dot plot and phylogeny all read from it.',
    result: 'Sequence tray',
  },
  {
    verb: 'Compare',
    text: 'Smith–Waterman finds the region insulin and IGF-1 actually share (131.0); Needleman–Wunsch is dragged down by the ends (58.5).',
    result: 'SW 131.0 · NW 58.5',
  },
  {
    verb: 'Relate',
    text: 'A neighbour-joining tree sets IGF-1 on a long branch of its own, against 0.06–0.08 among the insulins.',
    result: 'IGF-1 branch 0.42',
  },
  {
    verb: 'Keep',
    text: 'Save the entity and the alignment to a project, with the parameters, source and time they were retrieved.',
    result: 'Provenance kept',
  },
]

const CHECKS = [
  {
    figure: '±0.01',
    claim:
      'Alignment scores agree with Biopython’s PairwiseAligner across four substitution matrices and four gap settings, for both global and local alignment.',
    test: 'test_protein_score_matches_biopython_across_matrices',
  },
  {
    figure: '1–333',
    claim:
      'Given human insulin’s raw coding sequence, the ORF finder recovers it in frame +1 and translates it back to the exact UniProt protein.',
    test: 'test_finds_the_real_insulin_orf',
  },
  {
    figure: 'hsa:672',
    claim:
      'For BRCA1, the KEGG identifier must match NCBI Gene 672. If sources disagree, the records describe different genes and should not be stitched together.',
    test: 'test_entity_cross_references_agree',
  },
  {
    figure: 'P01308',
    claim:
      'INS once resolved to the INS-IGF2 readthrough. Exact gene symbols now win over substring matches, and the bug is pinned by a regression test.',
    test: 'test_exact_gene_symbol_beats_substring_match',
  },
  {
    figure: 'IGF-1',
    claim:
      'UPGMA must split IGF-1 off first and keep human, pig and mouse insulin together — the tree has to agree with known biology.',
    test: 'test_upgma_places_igf1_outside_the_insulins',
  },
  {
    figure: 'R1699W',
    claim:
      'BRCA1 p.Arg1699Trp, a known pathogenic variant, must match the reference residue, land in the BRCT domain and report a non-conservative change.',
    test: 'test_known_pathogenic_brca1_variant',
  },
]

const SOURCES = [
  'UniProt',
  'NCBI Gene',
  'PubMed',
  'RCSB PDB',
  'KEGG',
  'AlphaFold DB',
  'NCBI BLAST',
  'REBASE via Biopython',
]

// ---------------------------------------------------------------------------

/**
 * The backend sleeps when idle. Pinging it as soon as the landing page opens
 * means it is usually awake by the time someone has typed a query, and the
 * status line tells them honestly if it isn't yet.
 */
function useServerWarmup() {
  const [state, setState] = useState('waking')
  useEffect(() => {
    // While the host is booting, the proxy in front of it can answer with an
    // error before the app is up. One failed ping therefore isn't "down" —
    // keep trying for as long as a cold start can plausibly take.
    const GIVE_UP_AFTER = 90_000
    const started = Date.now()
    let cancelled = false
    let retry
    const slow = setTimeout(() => setState((s) => (s === 'waking' ? 'slow' : s)), 2500)
    const ping = () => {
      fetch(`${API_URL}/health`, { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status))
          if (!cancelled) setState('ready')
        })
        .catch(() => {
          if (cancelled) return
          if (Date.now() - started > GIVE_UP_AFTER) setState('down')
          else retry = setTimeout(ping, 4000)
        })
    }
    ping()
    return () => {
      cancelled = true
      clearTimeout(slow)
      clearTimeout(retry)
    }
  }, [])
  return state
}

/** Fetch the workspace chunks once the page is idle, so the first click is instant. */
function usePrefetchWorkspace() {
  useEffect(() => {
    const load = () => {
      import('../app/Workspace')
      import('./EntityPage')
    }
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(load, 1500)
    return () => clearTimeout(t)
  }, [])
}

function Container({ className = '', children }) {
  return <div className={`mx-auto w-full max-w-[1120px] px-4 sm:px-8 ${className}`}>{children}</div>
}

function Eyebrow({ children }) {
  return (
    <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
      {children}
    </p>
  )
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="max-w-[640px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display m-0 mt-3 text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[38px]">
        {title}
      </h2>
      {children && (
        <p className="m-0 mt-4 text-[15px] leading-relaxed text-ink-2">{children}</p>
      )}
    </div>
  )
}

function LookupForm({ autoFocus = false, size = 'lg' }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const go = (term) => {
    const t = term.trim()
    navigate(t ? `/lookup?q=${encodeURIComponent(t)}` : '/lookup')
  }
  const big = size === 'lg'
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(q)
        }}
        className={`flex items-center gap-2 rounded-2xl border border-line-strong bg-surface shadow-card transition-colors focus-within:border-accent ${
          big ? 'p-2' : 'p-1.5'
        }`}
      >
        <Search size={18} className="ml-2.5 shrink-0 text-ink-3" aria-hidden="true" />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Gene, protein or UniProt accession"
          placeholder="Gene, protein or accession"
          spellCheck={false}
          autoCapitalize="characters"
          className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none ${
            big ? 'h-11 text-[15.5px]' : 'h-10 text-[14.5px]'
          }`}
        />
        <button
          type="submit"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent font-medium text-accent-contrast transition-colors hover:bg-accent-hover ${
            big ? 'h-11 px-4 text-[14px] sm:px-5' : 'h-10 px-4 text-[13.5px]'
          }`}
        >
          Look up
          <ArrowRight size={15} className="hidden sm:block" aria-hidden="true" />
        </button>
      </form>
      <div className="mt-3.5 flex flex-wrap items-center gap-x-1 gap-y-2 text-[12.5px]">
        <span className="mr-1.5 text-ink-3">Try</span>
        {TRY.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => go(t)}
            className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[12px] text-ink-2 transition-colors hover:border-accent-line hover:bg-accent-soft hover:text-accent-hover"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

function ServerStatus({ state }) {
  const map = {
    waking: { dot: 'bg-ink-3', text: 'Checking the server…' },
    slow: {
      dot: 'bg-warn animate-pulse',
      text: 'Waking the server — it sleeps when idle, so the first lookup can take up to a minute',
    },
    ready: { dot: 'bg-ok', text: 'Server ready' },
    down: { dot: 'bg-danger', text: 'Server unreachable right now — try again shortly' },
  }
  const s = map[state]
  return (
    <span className="inline-flex items-center gap-2" aria-live="polite">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  )
}

// ---------------------------------------------------------------------------

function Header() {
  const [dark, setDark] = useDarkMode()
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Link to="/" aria-label="Helix home" className="rounded-lg">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-ink-2 md:flex">
          <a href="#tools" className="transition-colors hover:text-ink">
            Tools
          </a>
          <a href="#workflow" className="transition-colors hover:text-ink">
            Workflow
          </a>
          <a href="#checked" className="transition-colors hover:text-ink">
            How it’s checked
          </a>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 transition-colors hover:text-ink"
          >
            Source <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </nav>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link
            to="/lookup"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[13px] font-medium text-paper transition-opacity hover:opacity-85"
          >
            Open workspace
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </header>
  )
}

function Hero({ server }) {
  return (
    <section className="pb-10 pt-12 sm:pb-12 sm:pt-16">
      <Container>
        <div className="land-rise" style={{ '--d': '0ms' }}>
          <Eyebrow>Bioinformatics workspace</Eyebrow>
        </div>
        <h1
          className="font-display land-rise m-0 mt-5 max-w-[13ch] text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink sm:text-[64px] lg:text-[76px]"
          style={{ '--d': '60ms' }}
        >
          One lookup.
          <br />
          <span className="text-accent">Every database.</span>
        </h1>
        <p
          className="land-rise m-0 mt-6 max-w-[66ch] text-[16px] leading-relaxed text-ink-2 sm:text-[17.5px]"
          style={{ '--d': '120ms' }}
        >
          Type a gene or protein. Helix resolves it across UniProt, NCBI Gene, PDB, KEGG and
          AlphaFold, finds the papers, and hands the sequence straight to alignment, phylogeny and
          primer design — without copying anything between browser tabs.
        </p>
        <div className="land-rise mt-8 max-w-[640px]" style={{ '--d': '180ms' }}>
          <LookupForm />
        </div>
        <p
          className="land-rise m-0 mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-3"
          style={{ '--d': '240ms' }}
        >
          <span>Free, no sign-up</span>
          <span aria-hidden="true">·</span>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-ink-2">
            Open source
          </a>
          <span aria-hidden="true">·</span>
          <ServerStatus state={server} />
        </p>
      </Container>
    </section>
  )
}

function FigurePlate() {
  return (
    <section className="pb-20 sm:pb-28">
      <Container>
        <div className="land-rise" style={{ '--d': '300ms' }}>
          <InsulinFigure />
        </div>
      </Container>
    </section>
  )
}

const TABS = [
  ['UniProt', 'accession, sequence, length'],
  ['NCBI Gene', 'gene ID, location, summary'],
  ['RCSB PDB', 'which structures exist'],
  ['KEGG', 'pathway membership'],
  ['AlphaFold DB', 'predicted model, confidence'],
  ['PubMed', 'the papers worth reading'],
]

const BRCA1_ROWS = [
  ['UniProt', 'var(--src-uniprot)', 'P38398', '1,863 aa · reviewed'],
  ['NCBI Gene', 'var(--src-ncbi)', '672', 'chromosome 17'],
  ['RCSB PDB', 'var(--src-pdb)', '33', 'experimental structures'],
  ['KEGG', 'var(--src-kegg)', 'hsa:672', 'pathway links'],
  ['AlphaFold', 'var(--text-3)', 'Model', 'per-residue confidence'],
  ['PubMed', 'var(--text-3)', 'Papers', 'linked to the gene'],
]

function OneAnswer() {
  return (
    <section className="border-t border-line bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="Why it exists" title="Six tabs become one page.">
          Answering “what is known about this gene?” normally means visiting six databases and
          copying identifiers between them by hand — the step where mistakes get in. Helix does the
          stitching, and checks that the pieces belong together.
        </SectionHeading>

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          {/* The usual way */}
          <div>
            <p className="m-0 mb-4 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
              The usual way
            </p>
            <ol className="m-0 list-none space-y-2 p-0">
              {TABS.map(([site, what], i) => (
                <li
                  key={site}
                  className="flex items-baseline gap-3 rounded-lg border border-dashed border-line-strong px-3.5 py-2.5"
                >
                  <span className="tnum font-mono text-[11px] text-ink-3">{i + 1}</span>
                  <span className="text-[13.5px] font-medium text-ink-2">{site}</span>
                  <span className="ml-auto truncate text-right text-[12px] text-ink-3">{what}</span>
                </li>
              ))}
            </ol>
            <p className="m-0 mt-4 text-[12.5px] leading-relaxed text-ink-3">
              …then paste each identifier into the next site, and hope they all refer to the same
              gene.
            </p>
          </div>

          {/* With Helix */}
          <div>
            <p className="m-0 mb-4 text-[12px] font-medium uppercase tracking-[0.08em] text-accent">
              With Helix
            </p>
            <div className="overflow-hidden rounded-2xl border border-line-strong bg-paper shadow-pop">
              <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
                <Search size={13} className="text-ink-3" aria-hidden="true" />
                <span className="font-mono text-[12.5px] text-ink">BRCA1</span>
                <span className="ml-auto text-[11px] text-ink-3">one query</span>
              </div>
              <div className="px-5 pb-5 pt-5 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-display m-0 text-[26px] font-semibold tracking-[-0.015em] text-ink">
                    BRCA1
                  </h3>
                  <span className="text-[12px] italic text-ink-3">Homo sapiens</span>
                </div>
                <p className="m-0 mt-0.5 text-[13.5px] text-ink-2">
                  Breast cancer type 1 susceptibility protein
                </p>

                <dl className="m-0 mt-5 divide-y divide-line border-y border-line">
                  {BRCA1_ROWS.map(([source, color, value, note]) => (
                    <div
                      key={source}
                      className="grid grid-cols-[108px_minmax(0,1fr)] items-baseline gap-3 py-2.5 sm:grid-cols-[120px_88px_minmax(0,1fr)]"
                    >
                      <dt className="flex items-center gap-2 text-[12.5px] text-ink-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                        {source}
                      </dt>
                      <dd className="tnum m-0 font-mono text-[13px] font-medium text-ink">
                        {value}
                        <span className="ml-2 font-sans text-[12px] font-normal text-ink-3 sm:hidden">
                          {note}
                        </span>
                      </dd>
                      <dd className="m-0 hidden text-[12.5px] text-ink-3 sm:block">{note}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-ok-soft px-3 py-2.5">
                  <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                  <p className="m-0 text-[12.5px] leading-relaxed text-ink-2">
                    <span className="font-medium text-ink">Cross-checked.</span> KEGG{' '}
                    <span className="font-mono">hsa:672</span> agrees with NCBI Gene{' '}
                    <span className="font-mono">672</span> — same gene, not a namesake.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-3">
              <span>Real result, abridged. Counts change as the databases update.</span>
              <Link
                to="/lookup?q=BRCA1"
                className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
              >
                Run this lookup <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

function Tools() {
  return (
    <section id="tools" className="scroll-mt-14 border-t border-line py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="Tools" title="From an identifier to an experiment.">
          Lookups query the source databases live. Everything marked{' '}
          <span className="whitespace-nowrap font-medium text-ink">runs here</span> is computed on
          Helix’s own server — no external queue, and the same answer every time.
        </SectionHeading>

        <div className="mt-14 border-t border-line-strong">
          {TOOL_GROUPS.map((g) => (
            <div
              key={g.name}
              className="grid gap-4 border-b border-line py-8 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10"
            >
              <div>
                <h3 className="font-display m-0 text-[21px] font-semibold tracking-[-0.01em] text-ink">
                  {g.name}
                </h3>
                <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-ink-3">{g.blurb}</p>
              </div>
              <ul className="m-0 list-none p-0">
                {g.tools.map((t) => (
                  <li key={t.to}>
                    <Link
                      to={t.to}
                      className="group -mx-3 grid gap-x-6 gap-y-1 rounded-lg px-3 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-baseline"
                    >
                      <span className="flex items-center gap-1.5 text-[14.5px] font-medium text-ink">
                        {t.name}
                        <ArrowRight
                          size={13}
                          className="-translate-x-1 text-accent opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="text-[13px] leading-relaxed text-ink-2">{t.desc}</span>
                      <span
                        className={`justify-self-start whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10.5px] sm:justify-self-end ${
                          t.via
                            ? 'border border-line text-ink-3'
                            : 'bg-accent-soft text-accent-hover dark:text-accent'
                        }`}
                      >
                        {t.via || 'runs here'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-14 border-t border-line bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="Workflow" title="One sequence, carried through.">
          The tools share a sequence tray and a project store, so the output of one is the input to
          the next. Here is insulin, from a gene symbol to a saved result — with the numbers Helix
          actually returns.
        </SectionHeading>

        <ol className="m-0 mt-14 grid list-none gap-0 p-0 lg:grid-cols-5">
          {WORKFLOW.map((s, i) => (
            <li
              key={s.verb}
              className="relative border-l border-line-strong pb-10 pl-7 last:pb-0 lg:border-l-0 lg:border-t lg:pb-0 lg:pl-0 lg:pr-6 lg:pt-7"
            >
              <span className="absolute -left-[5px] top-1 h-[9px] w-[9px] rounded-full border-2 border-accent bg-surface lg:-top-[5px] lg:left-0" />
              <p className="tnum m-0 font-mono text-[11px] text-ink-3">
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="font-display m-0 mt-1.5 text-[20px] font-semibold text-ink">
                {s.verb}
              </h3>
              <p className="m-0 mt-2 text-[13px] leading-relaxed text-ink-2">{s.text}</p>
              <p className="m-0 mt-3 inline-block whitespace-nowrap rounded-md bg-paper px-2 py-1 font-mono text-[11px] text-ink">
                {s.result}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

function Checked() {
  return (
    <section id="checked" className="scroll-mt-14 border-t border-line py-20 sm:py-28">
      <Container>
        <SectionHeading eyebrow="How it’s checked" title="Checked, not assumed.">
          Bugs in bioinformatics rarely crash. They return a plausible number that happens to be
          wrong. So each algorithm is tested against a reference implementation or against biology
          that is already known — and the tests are public.
        </SectionHeading>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((c) => (
            <div key={c.test} className="flex flex-col bg-paper p-6">
              <p className="tnum font-display m-0 text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">
                {c.figure}
              </p>
              <p className="m-0 mt-4 flex-1 text-[13.5px] leading-relaxed text-ink-2">{c.claim}</p>
              <p className="m-0 mt-5 font-mono text-[10.5px] text-ink-3">
                {/* Long snake_case names: allow breaks only at underscores. */}
                {c.test.split('_').map((part, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <>
                        _<wbr />
                      </>
                    )}
                    {part}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4">
          <p className="m-0 text-[13.5px] text-ink-2">
            <span className="tnum font-semibold text-ink">176</span> automated tests: the offline
            suite on every push, live checks against UniProt, NCBI and KEGG every week.
          </p>
          <Link
            to="/validation"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            Every check, and the tests behind it <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </section>
  )
}

function Sources() {
  return (
    <section className="border-t border-line py-10">
      <Container className="flex flex-col gap-3 md:flex-row md:items-baseline md:gap-8">
        <p className="m-0 shrink-0 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
          Data from
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[14px] text-ink-2">
          {SOURCES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Container>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="border-t border-line bg-surface py-20 sm:py-28">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <h2 className="font-display m-0 text-[38px] font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-[52px]">
            Start with one gene.
          </h2>
          <p className="m-0 mt-4 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            No account and nothing to install. Search, then follow the sequence wherever the
            question goes.
          </p>
        </div>
        <LookupForm size="md" />
      </Container>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line py-10">
      <Container className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <Logo />
          <p className="m-0 mt-3 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-3">
            For research use — not for diagnostic or clinical decisions. Data belongs to, and
            should be cited from, its source databases.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-2">
          <Link to="/lookup" className="hover:text-ink">
            Workspace
          </Link>
          <a href="#tools" className="hover:text-ink">
            Tools
          </a>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:text-ink">
            Source code
          </a>
          <a href={`${GITHUB}/issues`} target="_blank" rel="noreferrer" className="hover:text-ink">
            Report an issue
          </a>
        </nav>
      </Container>
    </footer>
  )
}

export function LandingPage() {
  const [params] = useSearchParams()
  const server = useServerWarmup()
  usePrefetchWorkspace()

  // Links shared before the landing page existed pointed at /?q=GENE.
  const legacyQuery = params.get('q')
  if (legacyQuery) return <Navigate to={`/lookup?q=${encodeURIComponent(legacyQuery)}`} replace />

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Header />
      <main>
        <Hero server={server} />
        <FigurePlate />
        <OneAnswer />
        <Tools />
        <Workflow />
        <Checked />
        <Sources />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
