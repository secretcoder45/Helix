/**
 * Where the session token lives in the browser.
 *
 * localStorage rather than a cookie because the API is on a different site
 * from this page (see auth.py on the backend for the trade-off). Dependency-
 * free on purpose: the landing page reads it to decide whether to show
 * "Sign in", without pulling in the API client.
 */

const KEY = 'helix-session'
export const SIGNED_OUT_EVENT = 'helix-signed-out'

export function getToken() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    /* storage unavailable: the session lasts for this page only */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing stored */
  }
}
