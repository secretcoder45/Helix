// Looking things up: the cross-referenced record, side-by-side search, and
// what happens when a source is down or nothing matches.
import { expect, test } from './fixtures'

test('the landing page search opens the cross-referenced record @phone', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/One lookup\.\s*Every database\./)
  // The hero's search box; the page repeats it at the bottom.
  await page.getByRole('textbox', { name: 'Gene, protein or UniProt accession' }).first().fill('INS')
  await page.getByRole('button', { name: 'Look up' }).first().click()

  await expect(page).toHaveURL(/\/lookup\?q=INS/)
  await expect(page.getByRole('heading', { name: 'Insulin', level: 2 })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('P01308')
})

test('a record shows its sequence, structures and where it came from', async ({ page }) => {
  await page.goto('/lookup?q=INS')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Insulin', level: 2 })).toBeVisible()
  await expect(main.getByText('110 aa')).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Structures' })).toBeVisible()
  await expect(main.getByRole('link', { name: '1A7F' })).toHaveAttribute('href', 'https://www.rcsb.org/structure/1A7F')
})

test('an unknown gene says so, rather than showing an empty page', async ({ page }) => {
  await page.goto('/lookup?q=NOTAGENE123')
  await expect(page.getByRole('main')).toContainText(/no .*found|couldn’t find|not found/i)
})

test('a source that is down is named, not shown as "no results"', async ({ page }) => {
  await page.route('**/v1/entity/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: "UniProt isn't responding right now. Try again in a minute.", source: 'UniProt' }),
    }),
  )
  await page.goto('/lookup?q=INS')
  await expect(page.getByRole('main')).toContainText(/UniProt isn.t responding/)
})

test('searching all databases gives each source its own column', async ({ page }) => {
  await page.goto('/db/all?q=insulin')
  await expect(page.getByRole('heading', { name: 'All databases', level: 1 })).toBeVisible()

  for (const source of ['UniProt', 'PDB', 'NCBI Gene', 'KEGG']) {
    await expect(page.getByRole('region', { name: `${source} results` })).toBeVisible()
  }
  const uniprot = page.getByRole('region', { name: 'UniProt results' })
  await expect(uniprot.getByRole('button', { name: /INS_HUMAN P01308/ })).toBeVisible()
  const pdb = page.getByRole('region', { name: 'PDB results' })
  await expect(pdb.getByRole('button', { name: /opens in 3D/ }).first()).toBeVisible()
})

test('an unknown address shows the not-found page', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page.getByRole('main')).toContainText('Nothing lives at this address')
})
