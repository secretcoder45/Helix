// The analysis tools compute on the real backend, so these check the whole
// path: form, request, the server's answer, and how it's drawn.
import { expect, test } from './fixtures'

test('align the sample sequences', async ({ page }) => {
  await page.goto('/align')
  await expect(page.getByRole('heading', { name: 'Needleman-Wunsch', level: 1 })).toBeVisible()
  const align = page.getByRole('button', { name: 'Align', exact: true })
  await expect(align).toBeDisabled()

  await page.getByRole('button', { name: 'Use sample' }).click()
  await expect(align).toBeEnabled()
  await align.click()
  await expect(page.getByRole('main')).toContainText(/identity/i)
  await expect(page.getByRole('main')).toContainText(/score/i)
})

test('the menu reaches every tool on a phone @phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the drawer only exists at phone width')
  await page.goto('/lookup')
  await page.getByRole('button', { name: /menu/i }).click()
  await page.getByRole('dialog').getByRole('link', { name: /align/i }).first().click()
  await expect(page).toHaveURL(/\/align/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
