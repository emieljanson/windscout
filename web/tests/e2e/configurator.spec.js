import { expect, test } from '@playwright/test'

test('configures the live display with actual DialKit controls', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'See your next session.' })).toBeVisible()
  const treatment = page.getByRole('button', { name: /Treatment/ })
  await expect(treatment).toBeVisible()
  await treatment.click()
  await page.getByRole('button', { name: 'Threshold line' }).click()
  await expect(page.getByRole('button', { name: 'Treatment Threshold line' })).toBeVisible()

  const threshold = page.getByRole('slider', { name: 'Wind threshold' })
  await threshold.focus()
  await page.keyboard.press('ArrowUp')
  await expect(threshold).toHaveAttribute('aria-valuenow', '18')

  await page.getByTestId('install-continuation').click()
  await expect(page.getByText(/USB installation is the next build step/)).toBeVisible()
})

test('keeps the 3D product and controls usable in the narrow composition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Wind threshold' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View flat' })).toHaveCount(0)
})

test('loads the local CAD model into the constrained 3D scene', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible()
  await page.getByRole('button', { name: 'Front' }).click()
  await expect(page.getByTestId('flat-preview')).toHaveCount(0)
})
