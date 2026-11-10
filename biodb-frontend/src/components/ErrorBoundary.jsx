import { Component } from 'react'
import { API_URL } from '../lib/config'

/**
 * Contains a rendering crash to the part of the page that crashed.
 *
 * Without one, an exception in any tool unmounts the whole app and leaves a
 * blank page. Inside the workspace a boundary wraps the page area only, so the
 * navigation keeps working and the researcher can move on; it resets when the
 * route changes (the caller keys it by path).
 *
 * Crashes are reported to the backend's /client-errors, which logs them next
 * to server errors — no tracking SDK in the bundle. Plain fetch, not the API
 * client, so the landing page can use this too.
 */

function report(error, info) {
  try {
    fetch(`${API_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: String(error?.message || error).slice(0, 500),
        page: window.location.pathname,
        stack: `${error?.stack || ''}\n${info?.componentStack || ''}`.slice(0, 2000),
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* reporting must never cause a second failure */
  }
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    report(error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    const { fullPage } = this.props
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 px-6 text-center ${
          fullPage ? 'min-h-screen bg-paper' : 'flex-1 py-16'
        }`}
      >
        <p className="font-display m-0 text-[18px] font-semibold text-ink">
          {fullPage ? 'Something went wrong' : 'This tool hit an error'}
        </p>
        <p className="m-0 max-w-sm text-[13px] leading-relaxed text-ink-2">
          {fullPage
            ? 'The page couldn’t be shown. The error has been reported.'
            : 'The error has been reported. Everything else in Helix still works — pick another tool, or reload to try this one again.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-1 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-[13px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          Reload
        </button>
      </div>
    )
  }
}
