import { expect, test } from '@playwright/test'

function amsterdamDate(offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offset))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function responseFor(latitude) {
  const times = Array.from({ length: 5 }, (_, day) => [8, 11, 14, 17, 20]
    .map((hour) => `${amsterdamDate(day)}T${String(hour).padStart(2, '0')}:00`)).flat()
  const offset = latitude > 52 ? 4 : 0
  return {
    timezone: 'Europe/Amsterdam',
    hourly_units: {
      wind_speed_10m: 'kn', wind_gusts_10m: 'kn', wind_direction_10m: '°',
      cloud_cover: '%', precipitation: 'mm',
    },
    hourly: {
      time: times,
      wind_speed_10m: times.map((_, index) => 11 + offset + (index % 5)),
      wind_gusts_10m: times.map((_, index) => 17 + offset + (index % 5)),
      wind_direction_10m: times.map(() => 90),
      cloud_cover: times.map(() => 35),
      precipitation: times.map(() => 0),
      is_day: times.map(() => 1),
    },
  }
}

async function mockForecastApi(page, state = { fail: false }) {
  const requests = []
  await page.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    if (state.fail) {
      await route.fulfill({ status: 503, body: 'Unavailable' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      responseFor(Number(url.searchParams.get('latitude'))),
    ) })
  })
  return requests
}

function forecastStatus(page) {
  return page.locator('.settings-panel [role="status"]')
}

test('configures the live display with actual DialKit controls', async ({ page }) => {
  const requests = await mockForecastApi(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.getByRole('region', { name: 'WindScout 3D preview' })).toBeVisible()
  await expect(page.locator('.configurator-header')).toHaveCount(0)
  await expect(forecastStatus(page)).toContainText('Live forecast for Brouwersdam', { timeout: 15_000 })
  await expect(page.getByTestId('forecast-label')).toHaveCount(0)
  expect(requests).toHaveLength(1)
  const treatment = page.getByRole('button', { name: /Treatment/ })
  await expect(treatment).toBeVisible()
  await treatment.click()
  await page.getByRole('button', { name: 'Threshold line' }).click()
  await expect(page.getByRole('button', { name: 'Treatment Threshold line' })).toBeVisible()

  const threshold = page.getByRole('slider', { name: 'Wind threshold' })
  await threshold.focus()
  await page.keyboard.press('ArrowUp')
  await expect(threshold).toHaveAttribute('aria-valuenow', '18')
  expect(requests).toHaveLength(1)

  await page.getByTestId('install-continuation').click()
  await expect(page.getByText(/USB installation is the next build step/)).toBeVisible()
})

test('keeps the 3D product and controls usable in the narrow composition', async ({ page }) => {
  await mockForecastApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Wind threshold' })).toBeVisible()
  await expect(page.locator('.settings-panel')).toHaveCSS('border-radius', '16px')
})

test('loads the local CAD model into the constrained 3D scene', async ({ page }) => {
  await mockForecastApi(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset view' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Front' })).toHaveCount(0)
  await expect(page.getByTestId('install-continuation')).toBeVisible()
})

test('switches the live preview to another supported spot without a page reload', async ({ page }) => {
  const requests = await mockForecastApi(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
  await expect(forecastStatus(page)).toContainText('Live forecast for Brouwersdam', { timeout: 15_000 })

  const spot = page.getByRole('button', { name: /Spot/ })
  await spot.click()
  await page.getByRole('button', { name: 'Edam' }).click()

  await expect(forecastStatus(page)).toContainText('Live forecast for Edam', { timeout: 15_000 })
  await expect(page.locator('.scene-host')).toHaveAttribute('data-forecast-spot', 'edam')
  await expect(page.getByTestId('forecast-label')).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[1].searchParams.get('latitude')).toBe('52.512600')
})

test('labels a first network failure as demo outside the device screen', async ({ page }) => {
  await mockForecastApi(page, { fail: true })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.getByTestId('forecast-label')).toHaveText('Demo')
  await expect(forecastStatus(page)).toContainText('Live forecast unavailable. Showing demo data.')
  await expect(page.getByTestId('forecast-label')).toBeVisible()
  await expect(page.getByTestId('forecast-label').locator('xpath=ancestor::aside')).toHaveCount(1)
})
