import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Download,
  Braces,
  BookOpenText,
  Table,
  GitCompareArrows,
  Link2,
  Copy,
  Check,
  LogIn,
} from 'lucide-react'
import {
  useProjects,
  useProject,
  useCreateProject,
  useDeleteProject,
  useRemoveItem,
  useRemoveAlignment,
  useShareProject,
} from '../lib/api'
import { useAuth } from '../context/Auth'
import { exportCsv, exportJson } from '../lib/export'
import { MethodsDialog } from '../components/MethodsDialog'
import { ProvenanceLine } from '../components/Provenance'
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Scroller,
  Skeleton,
  SourceBadge,
} from '../components/ui'

function ExportMenu({ projectName, items }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null

  const actions = [
    { label: 'CSV for spreadsheets', icon: Table, run: () => exportCsv(projectName, items) },
    { label: 'JSON', icon: Braces, run: () => exportJson(projectName, items) },
  ]

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        <Download size={12} /> Export
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop">
            {actions.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                onClick={() => {
                  run()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] text-ink transition-colors hover:bg-surface-2"
              >
                <Icon size={13} className="text-ink-3" /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AlignmentRows({ projectId, alignments }) {
  const removeAlignment = useRemoveAlignment()
  if (!alignments?.length) return null

  return (
    <>
      <div className="flex items-center gap-2 border-t border-line bg-surface-2/40 px-4 py-2">
        <GitCompareArrows size={12} className="text-ink-3" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          Alignments
        </span>
        <span className="tnum text-[11px] text-ink-3">{alignments.length}</span>
      </div>
      <ul className="divide-y divide-line last:overflow-hidden last:rounded-b-xl">
        {alignments.map((a) => (
          <li
            key={a.id}
            className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-mono text-[12px] font-medium text-ink">
                  {a.label1} vs {a.label2}
                </span>
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                  {a.algorithm === 'smith-waterman' ? 'Local' : 'Global'}
                </span>
              </div>
              <p className="tnum mt-1 text-[11px] text-ink-2">
                score {a.score} · {a.identity_pct}% identity · {a.gaps} gaps · {a.length} cols
              </p>
              {a.params?.matrix && (
                <p className="mt-0.5 font-mono text-[10px] text-ink-3">
                  {a.params.matrix}, gap {a.params.gap_open}/{a.params.gap_extend}
                  {a.provenance?.helix?.version &&
                    ` · Helix ${a.provenance.helix.version}${a.provenance.helix.commit ? ` (${a.provenance.helix.commit})` : ''}`}
                </p>
              )}
            </div>
            <button
              onClick={() => removeAlignment.mutate({ projectId, alignmentId: a.id })}
              className="shrink-0 rounded-md p-1.5 text-ink-3 opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Read-only share link for one project. The link is the whole credential, so
 * the copy says exactly what it grants — and that stopping is immediate.
 */
function ShareControl({ project }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const share = useShareProject()
  const url = project.share_token ? `${window.location.origin}/shared/${project.share_token}` : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable: the link is selectable in the field */
    }
  }

  return (
    <div className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)}>
        <Link2 size={12} />
        {url ? 'Shared' : 'Share'}
        {url && <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1.5 w-80 rounded-xl border border-line bg-surface p-4 shadow-pop">
            <p className="m-0 text-[13px] font-medium text-ink">Read-only link</p>
            <p className="m-0 mt-1 text-[12px] leading-relaxed text-ink-2">
              Anyone with the link can view this project and its methods export, without an
              account. They can’t change anything.
            </p>
            {url ? (
              <>
                <div className="mt-3 flex gap-1.5">
                  <input
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                    aria-label="Share link"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 font-mono text-[11px] text-ink outline-none"
                  />
                  <Button size="sm" onClick={copy}>
                    {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <button
                  onClick={() => share.mutate({ projectId: project.id, share: false })}
                  disabled={share.isPending}
                  className="mt-3 text-[12px] font-medium text-danger hover:underline disabled:opacity-50"
                >
                  Stop sharing
                </button>
                <span className="ml-2 text-[11px] text-ink-3">— the link stops working at once.</span>
              </>
            ) : (
              <Button
                size="sm"
                variant="primary"
                className="mt-3"
                loading={share.isPending}
                onClick={() => share.mutate({ projectId: project.id, share: true })}
              >
                Create link
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ProjectItems({ projectId }) {
  const { data: project, isLoading } = useProject(projectId)
  const removeItem = useRemoveItem()
  const [methodsOpen, setMethodsOpen] = useState(false)

  if (isLoading)
    return (
      <div className="space-y-2 border-t border-line p-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  if (!project) return null

  return (
    <div className="border-t border-line">
      <div className="flex items-center justify-between bg-surface-2/40 px-4 py-2">
        <span className="tnum text-[11px] text-ink-3">
          {project.items.length} {project.items.length === 1 ? 'record' : 'records'}
          {project.alignments?.length ? ` · ${project.alignments.length} alignments` : ''}
        </span>
        <div className="flex items-center gap-2">
          {(project.items.length > 0 || project.alignments?.length > 0) && (
            <Button size="sm" variant="primary" onClick={() => setMethodsOpen(true)}>
              <BookOpenText size={12} /> Methods & references
            </Button>
          )}
          <ShareControl project={project} />
          <ExportMenu projectName={project.name} items={project.items} />
        </div>
      </div>
      <MethodsDialog project={project} open={methodsOpen} onOpenChange={setMethodsOpen} />

      {project.items.length === 0 && !project.alignments?.length ? (
        <p className="px-4 py-6 text-center text-[12px] text-ink-3">
          Nothing saved yet. Cross-reference a gene, or run an alignment, and use Save.
        </p>
      ) : project.items.length === 0 ? null : (
        <ul className="divide-y divide-line last:overflow-hidden last:rounded-b-xl">
          {project.items.map((item) => (
            <li
              key={item.id}
              className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{item.name}</span>
                  <SourceBadge source={item.database} />
                </div>
                {item.description && (
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-2">
                    {item.description}
                  </p>
                )}
                <p className="mt-1 font-mono text-[11px] text-ink-3">
                  {item.external_id}
                  {item.retrieved_at &&
                    ` · retrieved ${new Date(item.retrieved_at).toLocaleDateString()}`}
                </p>
                {item.provenance && (
                  <p className="mt-0.5 text-[10.5px] text-ink-3">
                    <ProvenanceLine provenance={{ ...item.provenance, helix: null }} />
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-accent"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                <button
                  onClick={() => removeItem.mutate({ projectId, itemId: item.id })}
                  className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlignmentRows projectId={projectId} alignments={project.alignments} />
    </div>
  )
}

function SignedOut() {
  return (
    <Card className="border-dashed">
      <EmptyState
        icon={LogIn}
        title="Sign in to keep projects"
        description="Projects hold the records and alignments you save, with the database release each came from — and they belong to an account. Every tool works without one."
        action={
          <div className="flex items-center justify-center gap-2">
            <Link
              to="/signin?next=/projects"
              className="inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
            >
              Sign in
            </Link>
            <Link
              to="/signin?mode=register&next=/projects"
              className="inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-[13px] font-medium text-ink transition-colors hover:border-line-strong"
            >
              Create account
            </Link>
          </div>
        }
      />
    </Card>
  )
}

export function ProjectsPage() {
  const { user, checking } = useAuth()
  const { data: projects = [], isLoading: loadingProjects } = useProjects(Boolean(user))
  const isLoading = checking || (Boolean(user) && loadingProjects)
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState(null)

  const create = (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    createProject.mutate({ name }, { onSuccess: (p) => setExpanded(p.id) })
    setNewName('')
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Saved records keep the database release, entry version and checksum they came from, so a project can be written straight into a methods section."
        actions={
          user && (
            <form onSubmit={create} className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New project…"
                className="h-9 w-48"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!newName.trim() || createProject.isPending}
              >
                <Plus size={14} /> Create
              </Button>
            </form>
          )
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {isLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : !user ? (
            <SignedOut />
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={FolderOpen}
                title="No projects yet"
                description="Create a project to collect genes, proteins, and structures as you research — then export the set with citations intact."
              />
            </Card>
          ) : (
            <ul className="space-y-2.5">
              <AnimatePresence initial={false}>
                {projects.map((p) => (
                  <motion.li
                    key={p.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <Card>
                      <div className="group flex items-center gap-2 px-4 py-3">
                        <button
                          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          <ChevronRight
                            size={14}
                            className={`shrink-0 text-ink-3 transition-transform duration-150 ${
                              expanded === p.id ? 'rotate-90' : ''
                            }`}
                          />
                          <span className="truncate text-[14px] font-medium text-ink">
                            {p.name}
                          </span>
                          <span className="tnum shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-3">
                            {p.item_count + (p.alignment_count || 0)}
                          </span>
                        </button>
                        <button
                          onClick={() => deleteProject.mutate(p.id)}
                          className="rounded-md p-1.5 text-ink-3 opacity-0 transition-all hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {expanded === p.id && <ProjectItems projectId={p.id} />}
                    </Card>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </Scroller>
    </>
  )
}
