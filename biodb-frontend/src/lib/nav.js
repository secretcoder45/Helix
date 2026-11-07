import {
  BadgeCheck,
  Boxes,
  Crosshair,
  Dna,
  Fingerprint,
  FlaskConical,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
  Grid3x3,
  Link2,
  Rows3,
  ScanSearch,
  Scissors,
  ShieldAlert,
  Waypoints,
} from 'lucide-react'

/**
 * The workspace's navigation, defined once.
 *
 * The sidebar, the phone drawer and the command palette all read from here,
 * so a tool added or hidden in one place is added or hidden everywhere. The
 * grouping follows how work moves — find a record, compare, characterise,
 * design — and matches the landing page's tool index, so the map a visitor
 * read there is the map they navigate by.
 *
 * Every tool has its own icon: with the rail collapsed the icon is all there
 * is to go on, so no two may look alike.
 */

export const NAV_GROUPS = [
  {
    label: 'Look up',
    items: [
      { to: '/lookup', icon: Link2, label: 'Cross-reference', long: 'Cross-reference a gene or protein' },
      { to: '/batch', icon: Rows3, label: 'Batch lookup' },
      { to: '/blast', icon: ScanSearch, label: 'BLAST', long: 'BLAST similarity search' },
    ],
  },
  {
    label: 'Compare',
    items: [
      { to: '/align', icon: GitCompareArrows, label: 'Alignment', long: 'Pairwise alignment' },
      { to: '/compare', icon: Grid3x3, label: 'Dot plot' },
      { to: '/phylo', icon: GitBranch, label: 'Phylogeny', long: 'Phylogenetic tree' },
    ],
  },
  {
    label: 'Characterise',
    items: [
      { to: '/properties', icon: FlaskConical, label: 'Protein properties' },
      { to: '/dna', icon: Dna, label: 'DNA toolkit' },
      { to: '/variant', icon: ShieldAlert, label: 'Variants', long: 'Variant analysis' },
    ],
  },
  {
    label: 'Design',
    items: [
      { to: '/primers', icon: Crosshair, label: 'Primers', long: 'Primer design' },
      { to: '/restriction', icon: Scissors, label: 'Restriction map' },
    ],
  },
]

/** Pinned below the tools: where work is kept, and how it's checked. */
export const NAV_FOOTER = [
  { to: '/projects', icon: FolderOpen, label: 'Projects' },
  { to: '/validation', icon: BadgeCheck, label: 'Validation' },
]

export const DATABASE_ICONS = {
  genomics: Fingerprint,
  proteins: Boxes,
  pathways: Waypoints,
}

/** Every page, flat, for search in the command palette. */
export const ALL_PAGES = [...NAV_GROUPS.flatMap((g) => g.items), ...NAV_FOOTER]
