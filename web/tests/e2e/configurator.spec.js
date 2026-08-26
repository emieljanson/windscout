import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const localModelAvailable = existsSync(resolve('public/devices/e1002/e1002.glb'))

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

test('keeps the product usable in the narrow reduced-motion composition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.getByTestId('flat-preview')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Wind threshold' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset view' })).toHaveCount(0)
})

test('loads the local CAD model into the constrained 3D scene', async ({ page }) => {
  test.skip(!localModelAvailable, 'Run npm run model:prepare for the licence-gated local CAD model')
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible()
  await page.getByRole('button', { name: 'Front' }).click()
  await page.getByRole('button', { name: 'View flat' }).click()
  await expect(page.getByTestId('flat-preview')).toBeVisible()
})
