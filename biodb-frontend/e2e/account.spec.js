// The account life cycle, through the interface: create, save work, cite it,
// take the data out, and delete it all.
import { readFile } from 'node:fs/promises'
import { API, PASSWORD, expect, newUsername, signedIn, test } from './fixtures'

test('create an account, sign out, and sign back in', async ({ page }) => {
  const username = newUsername()
  await page.goto('/signin')
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD)
  await page.getByRole('textbox', { name: 'Confirm password' }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  const account = page.getByRole('banner').getByRole('button', { name: new RegExp(username) })
  await expect(account).toBeVisible()

  await account.click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()

  await page.goto('/signin')
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('the wrong password')
  await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Username or password is incorrect.')).toBeVisible()

  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD)
  await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click()
  await expect(account).toBeVisible()
})

test('save a record to a project and export its methods section', async ({ page, request }) => {
  await signedIn(page, request)
  await page.goto('/lookup?q=INS')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByPlaceholder('New project…').fill('Insulin study')
  await page.getByRole('button', { name: 'Create project and save' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  await page.goto('/projects')
  await page.getByRole('button', { name: /^Insulin study/ }).click()
  const main = page.getByRole('main')
  await expect(main.getByText('INS_HUMAN')).toBeVisible()
  // Provenance travels with the saved record.
  await expect(main.getByText(/UniProtKB \d{4}_\d{2}/)).toBeVisible()

  await main.getByRole('button', { name: 'Methods & references' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('UniProt')
  await expect(dialog.getByRole('button', { name: 'Copy methods' })).toBeVisible()
})

test('download my data, then delete the account', async ({ page, request }) => {
  const { username, token } = await signedIn(page, request)
  const auth = { Authorization: `Bearer ${token}` }
  const project = await (await request.post(`${API}/projects`, { headers: auth, data: { name: 'To be deleted' } })).json()
  await request.post(`${API}/projects/${project.id}/items`, {
    headers: auth,
    data: { external_id: 'P01308', name: 'INS_HUMAN', database: 'UniProt' },
  })

  await page.goto('/lookup')
  await page.getByRole('banner').getByRole('button', { name: new RegExp(username) }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download my data' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(new RegExp(`^helix-${username}-\\d{4}-\\d{2}-\\d{2}\\.json$`))
  const data = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(data.account.username).toBe(username)
  expect(data.projects.map((p) => p.name)).toEqual(['To be deleted'])
  expect(data.projects[0].items[0].external_id).toBe('P01308')

  await page.getByRole('banner').getByRole('button', { name: new RegExp(username) }).click()
  await page.getByRole('button', { name: 'Delete account…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete account' })
  // Says exactly what goes with it.
  await expect(dialog).toContainText('1 project and 1 saved record')

  await dialog.getByLabel('Your password, to confirm').fill('not my password')
  await dialog.getByRole('button', { name: 'Delete account permanently' }).click()
  await expect(dialog).toContainText('Password is incorrect.')

  await dialog.getByLabel('Your password, to confirm').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Delete account permanently' }).click()
  await expect(page.getByRole('dialog', { name: 'Account deleted' })).toContainText(username)
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()

  // Gone on the server too.
  const login = await request.post(`${API}/auth/login`, { data: { username, password: PASSWORD } })
  expect(login.status()).toBe(401)
})
