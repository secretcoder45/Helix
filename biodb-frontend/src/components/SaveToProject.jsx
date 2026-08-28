import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookmarkPlus, Check, Plus, Loader2 } from 'lucide-react'
import { useProjects, useCreateProject, useSaveItem } from '../lib/api'

/**
 * Save a search result into a project. Shows the user's existing projects and
 * lets them create a new one inline — creating a project shouldn't require
 * leaving the result you're looking at.
 */
export function SaveToProject({ result }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [savedTo, setSavedTo] = useState(null)

  const { data: projects = [] } = useProjects()
  const createProject = useCreateProject()
  const saveItem = useSaveItem()

  const itemPayload = {
    external_id: result.id,
    name: result.name,
    database: result.database,
    description: result.description || '',
    link: result.link || '',
    retrieved_at: result.retrieved_at || null,
  }

  const save = async (projectId, projectName) => {
    await saveItem.mutateAsync({ projectId, item: itemPayload })
    setSavedTo(projectName)
    setOpen(false)
    setTimeout(() => setSavedTo(null), 2000)
  }

  const createAndSave = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const project = await createProject.mutateAsync({ name })
    setNewName('')
    await save(project.id, project.name)
  }

  const busy = saveItem.isPending || createProject.isPending

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-500"
      >
        {savedTo ? (
          <>
            <Check size={15} className="text-emerald-500" /> Saved to {savedTo}
          </>
        ) : (
          <>
            <BookmarkPlus size={15} /> Save to project
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-full z-20 mb-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            >
              {projects.length > 0 && (
                <div className="mb-2 max-h-48 space-y-0.5 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      disabled={busy}
                      onClick={() => save(p.id, p.name)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-700"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">
                        {p.item_count}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={createAndSave} className="flex gap-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New project name..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-900"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="flex shrink-0 items-center rounded-lg bg-indigo-500 px-2.5 text-white disabled:opacity-40"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
