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
} from 'lucide-react'
import {
  useProjects,
  useProject,
  useCreateProject,
  useDeleteProject,
  useRemoveItem,
} from '../lib/api'
import { exportCsv, exportCitations, exportJson } from '../lib/export'

function ExportMenu({ projectName, items }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null

  const actions = [
    { label: 'CSV (spreadsheet)', icon: Download, run: () => exportCsv(projectName, items) },
    { label: 'Citations (.txt)', icon: FileText, run: () => exportCitations(projectName, items) },
    { label: 'JSON', icon: Braces, run: () => exportJson(projectName, items) },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
      >
        <Download size={13} /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            {actions.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                onClick={() => {
                  run()
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <Icon size={13} className="text-slate-400" /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ProjectDetail({ projectId }) {
  const { data: project, isLoading } = useProject(projectId)
  const removeItem = useRemoveItem()

  if (isLoading) return <p className="p-4 text-sm text-slate-400">Loading…</p>
  if (!project) return null

  return (
    <div className="border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-slate-400">
          {project.items.length} saved {project.items.length === 1 ? 'item' : 'items'}
        </span>
        <ExportMenu projectName={project.name} items={project.items} />
      </div>

      {project.items.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-400">
          Nothing saved yet — search a database and use “Save to project”.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {project.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {item.database}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{item.description}</p>
                {item.retrieved_at && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {item.external_id} · retrieved{' '}
                    {new Date(item.retrieved_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-500 dark:hover:bg-slate-800"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button
                  onClick={() => removeItem.mutate({ projectId, itemId: item.id })}
                  className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
                >
                  <Trash2 size={14} />
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
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <FolderOpen size={18} className="text-indigo-500" /> Projects
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Saved results with provenance — export to CSV or citations for your methods section.
        </p>
      </div>

      <form onSubmit={create} className="mb-6 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name..."
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={!newName.trim() || createProject.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus size={15} /> Create
        </button>
      </form>

      <div className="flex-1 overflow-y-auto pb-8">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
            <p className="text-sm text-slate-400">
              No projects yet. Create one above, then save results into it as you search.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {projects.map((p) => (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-2 p-4">
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <ChevronRight
                        size={15}
                        className={`shrink-0 text-slate-400 transition-transform ${
                          expanded === p.id ? 'rotate-90' : ''
                        }`}
                      />
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {p.item_count}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteProject.mutate(p.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {expanded === p.id && <ProjectDetail projectId={p.id} />}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}
