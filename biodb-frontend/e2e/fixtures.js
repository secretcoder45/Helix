// Shared setup for the browser tests.
//
// Every page is cut off from the internet: only the local frontend and the
// local test API answer. Fonts, the 3D viewer's structure files and links
// out to UniProt simply fail, so a test can't pass or fail because of a
// site we don't control.
import { test as base, expect } from '@playwright/test'

export const API = 'http://127.0.0.1:8765/v1'
export const PASSWORD = 'a long test passphrase'

const LOCAL = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/|data:|blob:)/

export const test = base.extend({
  // (Playwright calls the second argument `use`; renamed so the linter
  // doesn't take it for a React hook.)
  page: async ({ page }, provide) => {
    await page.route('**/*', (route) =>
      LOCAL.test(route.request().url()) ? route.fallback() : route.abort('blockedbyclient'),
    )
    // A crash anywhere fails the test, even if the page happens to look fine.
    const crashes = []
    page.on('pageerror', (error) => crashes.push(error.message))
    await provide(page)
    expect(crashes, 'uncaught errors in the page').toEqual([])
  },
})

export { expect }

export function newUsername() {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** Create an account through the API and sign this browser into it. Faster than the form. */
export async function signedIn(page, request, username = newUsername()) {
  const res = await request.post(`${API}/auth/register`, { data: { username, password: PASSWORD } })
  expect(res.status()).toBe(201)
  const { token } = await res.json()
  await page.goto('/signin')
  await page.evaluate((t) => localStorage.setItem('helix-session', t), token)
  return { username, token }
}
