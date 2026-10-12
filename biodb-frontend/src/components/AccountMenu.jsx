import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, KeyRound, LogOut, X } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { errorMessage, useChangePassword } from '../lib/api'
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

  const input =
    'h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13.5px] text-ink outline-none focus:border-accent focus-visible:outline-none'

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

export function AccountMenu() {
  const { user, checking, signOut } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [changing, setChanging] = useState(false)

  if (checking) return <span className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return (
      <Link
        to={`/signin?next=${next}`}
        className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      >
        Sign in
      </Link>
    )
  }

  return (
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
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2"
            >
              <KeyRound size={13} className="text-ink-3" /> Change password
            </button>
            <button
              onClick={() => {
                setOpen(false)
                signOut()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-ink transition-colors hover:bg-surface-2"
            >
              <LogOut size={13} className="text-ink-3" /> Sign out
            </button>
          </div>
        </>
      )}
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} />
    </div>
  )
}
