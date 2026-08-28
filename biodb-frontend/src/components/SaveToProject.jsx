import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookmarkPlus, Check, Plus, Loader2, FolderOpen } from 'lucide-react'
import { useProjects, useCreateProject, useSaveItem } from '../lib/api'

/**
 * Save a result into a project, creating one inline if needed — collecting
 * shouldn't require leaving the record you're looking at.
 */
export function SaveToProject({ result, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [savedTo, setSavedTo] = useState(null)

  const { data: projects = [] } = useProjects()
  const createProject = useCreateProject()
  const saveItem = useSaveItem()

  const payload = {
    external_id: result.id,
    name: result.name,
    database: result.database,
    description: result.description || '',
    link: result.link || '',
    retrieved_at: result.retrieved_at || null,
  }

  const save = async (projectId, projectName) => {
    await saveItem.mutateAsync({ projectId, item: payload })
    setSavedTo(projectName)
    setOpen(false)
    setTimeout(() => setSavedTo(null), 2200)
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
  const height = size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors ${height} ${
          savedTo
            ? 'border-ok/30 bg-ok-soft text-ok'
            : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
        }`}
      >
        {savedTo ? (
          <>
            <Check size={14} /> Saved
          </>
        ) : (
          <>
            <BookmarkPlus size={14} /> Save
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
            >
              <p className="border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                Save to project
              </p>

              {projects.length > 0 ? (
                <div className="max-h-48 overflow-y-auto p-1.5">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      disabled={busy}
                      onClick={() => save(p.id, p.name)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      <FolderOpen size={14} className="shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="tnum shrink-0 text-[11px] text-ink-3">
                        {p.item_count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-3 text-[12px] text-ink-3">
                  No projects yet — name one below.
                </p>
              )}

              <form onSubmit={createAndSave} className="flex gap-1.5 border-t border-line p-1.5">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New project…"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-accent text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
