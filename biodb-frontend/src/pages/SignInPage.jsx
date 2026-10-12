import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpenText, FolderOpen, Link2 } from 'lucide-react'
import { Logo } from '../components/Logo'
import { AuthForm } from '../components/AuthForm'
import { useAuth } from '../context/Auth'

/**
 * The sign-in page: what an account is for, beside the form. Says plainly
 * that every tool works without one — accounts exist for projects.
 */

const BENEFITS = [
  { icon: FolderOpen, title: 'Projects', text: 'Collect records and alignments, each with the database release it came from.' },
  { icon: BookOpenText, title: 'Methods export', text: 'A methods section and references written from what you saved.' },
  { icon: Link2, title: 'Read-only links', text: 'Share a project with a reviewer or collaborator — no account needed to view it.' },
]

/** Only same-app paths, so ?next= can't send someone to another site. */
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/projects'
}

export function SignInPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const { user } = useAuth()

  if (user) return <Navigate to={next} replace />

  return (
    <div className="flex min-h-screen bg-paper">
      {/* What an account is for */}
      <aside className="hidden w-[44%] max-w-[560px] flex-col justify-between border-r border-line bg-surface px-12 py-10 lg:flex">
        <Link to="/" aria-label="Helix home" className="self-start rounded-lg">
          <Logo />
        </Link>
        <div>
          <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Your account
          </p>
          <h1 className="font-display m-0 mt-4 text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink">
            Keep your work,
            <br />
            and where it came from.
          </h1>
          <ul className="m-0 mt-10 list-none space-y-6 p-0">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon size={16} />
                </span>
                <div>
                  <p className="m-0 text-[14px] font-medium text-ink">{title}</p>
                  <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 text-[12.5px] leading-relaxed text-ink-3">
          Every tool works without an account. You only need one to save.
        </p>
      </aside>

      {/* The form */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[380px]">
          <Link to="/" aria-label="Helix home" className="mb-10 inline-block rounded-lg lg:hidden">
            <Logo />
          </Link>

          <AuthForm
            initialMode={params.get('mode') === 'register' ? 'register' : 'signin'}
            onDone={() => navigate(next, { replace: true })}
          />

          <div className="mt-10 border-t border-line pt-5">
            <Link
              to="/lookup"
              className="inline-flex items-center gap-1 text-[13px] text-ink-2 transition-colors hover:text-ink"
            >
              Continue without an account <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
