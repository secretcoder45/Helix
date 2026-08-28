import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FolderOpen,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Download,
  FileText,
  Braces,
  Table,
} from 'lucide-react'
import {
  useProjects,
  useProject,
  useCreateProject,
  useDeleteProject,
  useRemoveItem,
} from '../lib/api'
import { exportCsv, exportCitations, exportJson } from '../lib/export'
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
    {
      label: 'Citations for methods',
      icon: FileText,
      run: () => exportCitations(projectName, items),
    },
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

function ProjectItems({ projectId }) {
  const { data: project, isLoading } = useProject(projectId)
  const removeItem = useRemoveItem()

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
        </span>
        <ExportMenu projectName={project.name} items={project.items} />
      </div>

      {project.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-ink-3">
          Nothing saved yet. Cross-reference a gene and use Save.
        </p>
      ) : (
        <ul className="divide-y divide-line">
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
    </div>
  )
}

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects()
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
        description="Saved records keep their source and retrieval date, so a collection can be exported straight into a methods section."
        actions={
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
        }
      />

      <Scroller className="px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {isLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
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
                    <Card className="overflow-hidden">
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
                            {p.item_count}
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
