import { useState } from 'react'
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { errorMessage, useSignIn } from '../lib/api'
import { useAuth } from '../context/Auth'

/**
 * Sign in / create an account: a username and a password, nothing else.
 *
 * One form used in two places — the full sign-in page, and a dialog opened
 * from a Save button, so signing in never navigates away from (and loses)
 * a batch result or an alignment that hasn't been saved yet.
 */

const USERNAME_RE = /^[a-z0-9][a-z0-9_.-]{2,31}$/
const MIN_PASSWORD = 8

const inputClass =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus-visible:outline-none'

function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="m-0 mt-1.5 text-[12px] text-danger">{error}</p>
      ) : hint ? (
        <p className="m-0 mt-1.5 text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

export function AuthForm({ initialMode = 'signin', onDone, heading = true }) {
  const { signedIn } = useAuth()
  const signIn = useSignIn()

  const [mode, setMode] = useState(initialMode)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)

  const registering = mode === 'register'
  const normalised = username.trim().toLowerCase()
  const problems = registering
    ? {
        username:
          normalised && !USERNAME_RE.test(normalised)
            ? '3–32 characters: lowercase letters, digits, and . _ -'
            : null,
        password:
          password && password.length < MIN_PASSWORD ? `At least ${MIN_PASSWORD} characters.` : null,
        confirm: confirm && confirm !== password ? 'Passwords don’t match.' : null,
      }
    : {}
  const ready = registering
    ? USERNAME_RE.test(normalised) && password.length >= MIN_PASSWORD && confirm === password
    : Boolean(normalised && password)

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!ready || signIn.isPending) return
    try {
      const data = await signIn.mutateAsync({ mode, username: normalised, password })
      signedIn(data)
      onDone?.(data.user)
    } catch {
      /* shown below */
    }
  }

  const switchMode = (m) => {
    setMode(m)
    setConfirm('')
    setTouched(false)
    signIn.reset()
  }

  return (
    <>
      {heading && (
        <>
          <h2 className="font-display m-0 text-[28px] font-semibold tracking-[-0.015em] text-ink">
            {registering ? 'Create your account' : 'Sign in'}
          </h2>
          <p className="m-0 mt-1.5 text-[13.5px] text-ink-2">
            {registering
              ? 'A username and a password — that’s all.'
              : 'Welcome back. Your projects are where you left them.'}
          </p>
        </>
      )}

      <div
        role="tablist"
        className={`${heading ? 'mt-7' : ''} grid grid-cols-2 rounded-lg border border-line bg-surface-2 p-1`}
      >
        {[
          ['signin', 'Sign in'],
          ['register', 'Create account'],
        ].map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`rounded-md py-1.5 text-[13px] transition-colors ${
              mode === m ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <Field
          id="username"
          label="Username"
          hint={registering ? 'Lowercase letters, digits, and . _ -' : null}
          error={problems.username}
        >
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          hint={
            registering
              ? `At least ${MIN_PASSWORD} characters. A passphrase is easiest to remember.`
              : null
          }
          error={problems.password}
        >
          <div className="relative">
            <input
              id="password"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={registering ? 'new-password' : 'current-password'}
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        {registering && (
          <Field id="confirm" label="Confirm password" error={problems.confirm}>
            <input
              id="confirm"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        )}

        {signIn.isError && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
            <p className="m-0 text-[13px] leading-relaxed text-ink">{errorMessage(signIn.error)}</p>
          </div>
        )}
        {touched && !ready && !signIn.isError && (
          <p className="m-0 text-[12.5px] text-ink-3">Fill in the fields above to continue.</p>
        )}

        <button
          type="submit"
          disabled={signIn.isPending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {signIn.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              {registering ? 'Create account' : 'Sign in'}
              <ArrowRight size={15} />
            </>
          )}
        </button>

        {registering && (
          <p className="m-0 text-[12px] leading-relaxed text-ink-3">
            There’s no email recovery, so keep your password somewhere safe — a password manager is
            ideal.
          </p>
        )}
      </form>
    </>
  )
}
