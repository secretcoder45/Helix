import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Download, KeyRound, LogOut, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { errorMessage, useChangePassword, useDeleteAccount, useExportAccount, useProjects } from '../lib/api'
import { Button } from './ui'

/** Header control: "Sign in" when signed out; the account and its actions when signed in. */

function ChangePasswordDialog({ open, onOpenChange }) {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const close = (o) => {
    onOpenChange(o)
    if (!o) {
      setCurrent('')
      setNext('')
      setConfirm('')
      change.reset()
    }
  }

  const mismatch = confirm && confirm !== next
  const submit = (e) => {
    e.preventDefault()
    if (!current || next.length < 8 || mismatch) return
    change.mutate({ current_password: current, new_password: next })
  }

  const input = INPUT

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <div className="flex items-start justify-between">
            <Dialog.Title className="font-display m-0 text-[19px] font-semibold text-ink">
              Change password
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
              <X size={16} />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>
          <Dialog.Description className="m-0 mt-1 text-[12.5px] text-ink-3">
            Other devices will be signed out. This one stays signed in.
          </Dialog.Description>

          {change.isSuccess ? (
            <div className="mt-5 flex items-center gap-2 rounded-lg bg-ok-soft px-3.5 py-3 text-[13px] text-ink">
              <Check size={15} className="text-ok" /> Password changed.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                type="password"
                placeholder="Current password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={input}
              />
              <input
                type="password"
                placeholder="New password (at least 8 characters)"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className={input}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={input}
              />
              {mismatch && <p className="m-0 text-[12px] text-danger">Passwords don’t match.</p>}
              {change.isError && <p className="m-0 text-[12px] text-danger">{errorMessage(change.error)}</p>}
              <Button
                type="submit"
                variant="primary"
                loading={change.isPending}
                disabled={!current || next.length < 8 || mismatch || change.isPending}
                className="w-full justify-center"
              >
                Change password
              </Button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13.5px] text-ink outline-none focus:border-accent focus-visible:outline-none'

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Permanent, so it asks for the password, says exactly what goes with the
 * account, and offers the download first. Stays mounted after the account is
 * gone, so the confirmation can be read.
 */
function DeleteAccountDialog({ open, onOpenChange, username }) {
  const { endSession } = useAuth()
  const remove = useDeleteAccount()
  const exporter = useExportAccount()
  const projects = useProjects(open && !remove.isSuccess)
  const [password, setPassword] = useState('')

  const close = (o) => {
    onOpenChange(o)
    if (!o) {
      setPassword('')
      remove.reset()
      exporter.reset()
    }
  }

  const submit = (e) => {
    e.preventDefault()
    if (!password || remove.isPending) return
    remove.mutate(password, { onSuccess: () => endSession() })
  }

  const list = projects.data || []
  const records = list.reduce((n, p) => n + (p.item_count || 0) + (p.alignment_count || 0), 0)
  const shared = list.filter((p) => p.share_token).length

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <div className="flex items-start justify-between">
            <Dialog.Title className="font-display m-0 text-[19px] font-semibold text-ink">
              {remove.isSuccess ? 'Account deleted' : 'Delete account'}
            </Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
              <X size={16} />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>

          {remove.isSuccess ? (
            <>
              <Dialog.Description className="m-0 mt-2 text-[13px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">{username}</span> and everything in it have been removed.
                Every tool still works without an account.
              </Dialog.Description>
              <Button variant="secondary" onClick={() => close(false)} className="mt-5 w-full justify-center">
                Close
              </Button>
            </>
          ) : (
            <>
              <Dialog.Description className="m-0 mt-2 text-[13px] leading-relaxed text-ink-2">
                This permanently deletes <span className="font-medium text-ink">{username}</span>
                {projects.isSuccess && list.length > 0 ? (
                  <>
                    {' '}with {plural(list.length, 'project')} and {plural(records, 'saved record')}
                    {shared > 0 && <>, and turns off {plural(shared, 'share link')}</>}
                  </>
                ) : (
                  ' and everything saved in it'
                )}
                . It can’t be undone.
              </Dialog.Description>

              <button
                type="button"
                onClick={() => exporter.mutate()}
                disabled={exporter.isPending}
                className="mt-4 flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left text-[12.5px] text-ink transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-60"
              >
                {exporter.isSuccess ? (
                  <Check size={14} className="shrink-0 text-ok" />
                ) : (
                  <Download size={14} className="shrink-0 text-ink-3" />
                )}
                <span>
                  {exporter.isSuccess ? 'Downloaded ' : 'Download my data first'}
                  {exporter.isSuccess && <span className="font-mono text-[11.5px]">{exporter.data.filename}</span>}
                </span>
              </button>
              {exporter.isError && (
                <p className="m-0 mt-1.5 text-[12px] text-danger">{errorMessage(exporter.error)}</p>
              )}

              <form onSubmit={submit} className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] text-ink-3">Your password, to confirm</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={INPUT}
                  />
                </label>
                {remove.isError && <p className="m-0 text-[12px] text-danger">{errorMessage(remove.error)}</p>}
                <Button
                  type="submit"
                  variant="danger"
                  loading={remove.isPending}
                  disabled={!password || remove.isPending}
                  className="w-full justify-center border border-danger/40"
                >
                  <Trash2 size={14} /> Delete account permanently
                </Button>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function AccountMenu() {
  const { user, checking, signOut } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Kept so the confirmation can still name the account once it's gone.
  const [deletedName, setDeletedName] = useState('')
  const exporter = useExportAccount()

  if (checking) return <span className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />

  const deleteDialog = (
    <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} username={user?.username || deletedName} />
  )

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    // Same shape as the signed-in return below — [control, dialog] — so the
    // delete dialog keeps its place, and its "Account deleted" state, when
    // deleting the account flips this to signed out.
    return (
      <>
        <Link
          to={`/signin?next=${next}`}
          className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          Sign in
        </Link>
        {deleteDialog}
      </>
    )
  }

  const item =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2'

  return (
    <>
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold uppercase text-accent">
          {user.username[0]}
        </span>
        <span className="hidden max-w-[120px] truncate text-[12.5px] font-medium text-ink sm:inline">
          {user.username}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-pop">
            <p className="m-0 border-b border-line px-2.5 pb-2 pt-1 text-[11px] text-ink-3">
              Signed in as <span className="font-medium text-ink">{user.username}</span>
            </p>
            <button
              onClick={() => {
                setOpen(false)
                setChanging(true)
              }}
              className={`mt-1 ${item}`}
            >
              <KeyRound size={13} className="text-ink-3" /> Change password
            </button>
            <button
              onClick={() => {
                setOpen(false)
                // The menu is closed by now, so a failure needs saying out loud.
                exporter.mutate(undefined, {
                  onError: (e) => window.alert(errorMessage(e, 'Couldn’t download your data. Try again.')),
                })
              }}
              className={item}
            >
              <Download size={13} className="text-ink-3" /> Download my data
            </button>
            <button
              onClick={() => {
                setOpen(false)
                signOut()
              }}
              className={item}
            >
              <LogOut size={13} className="text-ink-3" /> Sign out
            </button>
            <div className="mt-1 border-t border-line pt-1">
              <button
                onClick={() => {
                  setOpen(false)
                  setDeletedName(user.username)
                  setDeleting(true)
                }}
                className={`${item} text-danger hover:bg-danger-soft`}
              >
                <Trash2 size={13} /> Delete account…
              </button>
            </div>
          </div>
        </>
      )}
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} />
    </div>
    {deleteDialog}
    </>
  )
}
