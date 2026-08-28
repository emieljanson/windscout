import { expect, test } from '@playwright/test'

async function installFakeDevice(page) {
  await page.addInitScript(() => {
    globalThis.__WINDSCOUT_INSTALLER_SESSION_FACTORY__ = () => {
      let state = { phase: 'ready', progress: 0, safeToDisconnect: true, error: null }
      const listeners = new Set()
      const update = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener(state)) }
      return {
        subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
        async connect() { update({ phase: 'confirm-device' }) },
        confirmDevice() { update({ phase: 'review', action: { action: 'install' } }) },
        async run() { update({ phase: 'reconnect', progress: 0.78, safeToDisconnect: true }) },
        async reconnect() { update({ phase: 'wifi', progress: 0.8, safeToDisconnect: true }) },
        async scanNetworks() { return [{ ssid: 'WindScout Test', rssi: -40, secured: true }] },
        async submitWifi() { update({ phase: 'complete', progress: 1, safeToDisconnect: true }) },
        async cancel() { state = { phase: 'ready', progress: 0, safeToDisconnect: true, error: null } },
      }
    }
  })
}

test('guides a fake E1002 through confirmation, reconnect, Wi-Fi and completion', async ({ page }) => {
  await installFakeDevice(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

  const install = page.getByRole('button', { name: 'Install', exact: true })
  await install.click()
  await expect(page.getByRole('heading', { name: 'Connect your reTerminal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused()

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Is this a reTerminal E1002?' })).toBeVisible()
  await page.getByRole('button', { name: 'Yes, continue' }).click()
  await expect(page.getByText('A clean install will replace software and saved setup on this device.')).toBeVisible()
  await page.getByRole('button', { name: 'Install WindScout' }).click()

  await expect(page.getByRole('heading', { name: 'Reconnect WindScout' })).toBeVisible()
  await page.getByRole('button', { name: 'Reconnect device' }).click()
  await expect(page.getByRole('heading', { name: 'Select a network for WindScout' })).toBeVisible()
  await page.getByRole('combobox', { name: 'Network' }).selectOption('WindScout Test')
  await page.getByLabel('Password').fill('not-retained')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Done, enjoy' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(install).toBeFocused()
  await expect(page.getByText('not-retained')).toHaveCount(0)
})

test('keeps the installer available at narrow desktop zoom without horizontal overflow', async ({ page }) => {
  await installFakeDevice(page)
  await page.setViewportSize({ width: 640, height: 720 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Install', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Connect your reTerminal' })).toBeVisible()
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(640)
})
