import { expect, test } from '@playwright/test'
import { FORECAST_MODEL_IDS } from '../../src/forecast/models'

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
  const hourlyUnits = { time: 'iso8601' }
  const hourly = { time: times }
  FORECAST_MODEL_IDS.forEach((modelId, modelIndex) => {
    Object.assign(hourlyUnits, {
      [`wind_speed_10m_${modelId}`]: 'kn',
      [`wind_gusts_10m_${modelId}`]: 'kn',
      [`wind_direction_10m_${modelId}`]: '°',
      [`cloud_cover_${modelId}`]: '%',
      [`precipitation_${modelId}`]: 'mm',
      [`is_day_${modelId}`]: '',
      [`temperature_2m_${modelId}`]: '°C',
    })
    Object.assign(hourly, {
      [`wind_speed_10m_${modelId}`]: times.map((_, index) => 11 + offset + modelIndex * 3 + (index % 5)),
      [`wind_gusts_10m_${modelId}`]: times.map((_, index) => 17 + offset + modelIndex * 3 + (index % 5)),
      [`wind_direction_10m_${modelId}`]: times.map(() => 90 + modelIndex * 15),
      [`cloud_cover_${modelId}`]: times.map(() => 20 + modelIndex * 10),
      [`precipitation_${modelId}`]: times.map(() => 0),
      [`is_day_${modelId}`]: times.map(() => 1),
      [`temperature_2m_${modelId}`]: times.map((_, index) => 12 + modelIndex + (index % 5)),
    })
  })
  return {
    timezone: 'Europe/Amsterdam',
    hourly_units: hourlyUnits,
    hourly,
  }
}

async function mockForecastApi(page, state = { fail: false, tideUnsupported: false }) {
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
  await page.route('https://marine-api.open-meteo.com/v1/marine**', async (route) => {
    const firstDate = amsterdamDate()
    const start = Math.floor(Date.parse(`${firstDate}T00:00:00+02:00`) / 1000)
    const times = Array.from({ length: 120 }, (_, index) => start + index * 3600)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        timezone: 'Europe/Amsterdam',
        hourly_units: { time: 'unixtime', sea_level_height_msl: 'm' },
        hourly: {
          time: times,
          sea_level_height_msl: state.tideUnsupported
            ? times.map(() => null)
            : times.map((_, index) => Math.sin(index / 6) * 0.8),
        },
      }),
    })
  })
  return requests
}

async function mockGeoapify(page) {
  const autocompleteRequests = []
  const reverseRequests = []
  await page.route('https://api.geoapify.com/v1/geocode/autocomplete**', async (route) => {
    autocompleteRequests.push(new URL(route.request().url()))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{
        place_id: 'hindeloopen-id',
        name: 'Hindeloopen',
        city: 'Hindeloopen',
        state: 'Friesland',
        country: 'Netherlands',
        formatted: 'Hindeloopen, Friesland, Netherlands',
        lat: 52.9432,
        lon: 5.4007,
        timezone: { name: 'Europe/Amsterdam' },
      }] }),
    })
  })
  await page.route('https://api.geoapify.com/v1/geocode/reverse**', async (route) => {
    reverseRequests.push(new URL(route.request().url()))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [{
        place_id: 'confirmed-pin',
        lat: Number(new URL(route.request().url()).searchParams.get('lat')),
        lon: Number(new URL(route.request().url()).searchParams.get('lon')),
        timezone: { name: 'Europe/Amsterdam' },
      }] }),
    })
  })
  await page.route('https://maps.geoapify.com/v1/styles/positron/style.json**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
    }))
  return { autocompleteRequests, reverseRequests }
}

function forecastStatus(page) {
  return page.locator('.forecast-status')
}

async function selectWithKeyboard(page, name, search) {
  const control = page.getByRole('combobox', { name })
  await control.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.type(search)
  await page.keyboard.press('Enter')
  return control
}

function splitShadows(value) {
  const shadows = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    if (value[index] === ')') depth -= 1
    if (value[index] === ',' && depth === 0) {
      shadows.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  shadows.push(value.slice(start).trim())
  return shadows.filter(Boolean)
}

test('selects a catalog spot by keyboard and rejects an uncommitted draft', async ({ page }) => {
  const requests = await mockForecastApi(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  await expect(page.getByRole('region', { name: 'WindScout 3D preview' })).toBeVisible()
  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Brouwersdam', { timeout: 15_000 })
  expect(requests).toHaveLength(1)

  const spot = page.getByRole('combobox', { name: 'Spot' })
  await spot.focus()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('bro')
  await expect(page.getByRole('option', { name: 'Brouwersdam' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Edam' })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(spot).toHaveValue('Brouwersdam')
  await expect(spot).toBeFocused()
  expect(requests).toHaveLength(1)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('nowhere')
  await expect(page.getByText('No existing spots found', { exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(spot).toHaveValue('Brouwersdam')
  expect(requests).toHaveLength(1)
})

test('uses model typeahead and restores focus when its popup is dismissed', async ({ page }) => {
  const requests = await mockForecastApi(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Brouwersdam', { timeout: 15_000 })

  const model = await selectWithKeyboard(page, 'Model', 'gfs')
  await expect(model).toContainText('GFS')
  await expect(forecastStatus(page)).toContainText('Live GFS forecast for Brouwersdam')
  await expect(page.locator('.scene-host')).toHaveAttribute('data-forecast-model', 'gfs_seamless')
  expect(requests).toHaveLength(1)

  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: 'GFS' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(model).toBeFocused()
})

test('keeps threshold state explicit and redraws the live preview', async ({ page }) => {
  await mockForecastApi(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible({ timeout: 15_000 })
  const before = await page.locator('canvas').screenshot()

  const showThreshold = page.getByRole('switch', { name: 'Show threshold' })
  await showThreshold.focus()
  await page.keyboard.press('Space')
  await expect(showThreshold).toBeChecked()
  const threshold = page.getByRole('spinbutton', { name: 'Threshold' })
  await threshold.fill('24')
  await expect(threshold).toHaveValue('24')
  const withThreshold = await page.locator('canvas').screenshot()
  expect(withThreshold.equals(before)).toBe(false)

  await showThreshold.focus()
  await page.keyboard.press('Space')
  await expect(showThreshold).not.toBeChecked()
  await expect(threshold).toHaveCount(0)
  await page.keyboard.press('Space')
  await expect(page.getByRole('spinbutton', { name: 'Threshold' })).toHaveValue('24')
})

test('loads the local CAD model into the constrained 3D scene', async ({ page }) => {
  await mockForecastApi(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Reset view' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Front' })).toHaveCount(0)
  await expect(page.getByTestId('install-continuation')).toBeVisible()
})

test('switches the live preview to another supported spot without a page reload', async ({ page }) => {
  const requests = await mockForecastApi(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Brouwersdam', { timeout: 15_000 })

  const spot = page.getByRole('combobox', { name: 'Spot' })
  await spot.focus()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('eda')
  await page.keyboard.press('Enter')

  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Edam', { timeout: 15_000 })
  await expect(page.locator('.scene-host')).toHaveAttribute('data-forecast-spot', 'edam')
  await expect(page.getByTestId('forecast-label')).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[1].searchParams.get('latitude')).toBe('52.512600')
})

test('creates and remembers a personal spot only after the explicit map flow', async ({ page }) => {
  const forecastRequests = await mockForecastApi(page)
  const { autocompleteRequests, reverseRequests } = await mockGeoapify(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Brouwersdam', { timeout: 15_000 })

  const spot = page.getByRole('combobox', { name: 'Spot' })
  await spot.fill('Hindeloopen')
  await expect(page.getByRole('option', { name: 'Add “Hindeloopen” as a spot' })).toBeVisible()
  expect(autocompleteRequests).toHaveLength(0)
  await spot.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Add a spot' })
  await expect(dialog).toBeVisible()
  const placeSearch = dialog.getByRole('combobox', { name: 'Search for a place' })
  await expect(placeSearch).toBeFocused()
  await expect(page.getByRole('option', { name: /Hindeloopen.*Friesland/ })).toBeVisible()
  expect(autocompleteRequests).toHaveLength(1)
  await page.getByRole('option', { name: /Hindeloopen.*Friesland/ }).click()

  await expect(dialog.getByText('Move the map until the pin is on your spot by the water.')).toBeVisible()
  await expect(dialog.locator('.spot-dialog__pin')).toBeVisible()
  await expect(dialog.locator('.maplibregl-canvas')).toBeVisible()
  await dialog.getByRole('button', { name: 'Add spot' }).click()

  await expect(dialog).toHaveCount(0)
  await expect(spot).toHaveValue('Hindeloopen')
  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Hindeloopen', { timeout: 15_000 })
  expect(reverseRequests).toHaveLength(1)
  expect(forecastRequests.at(-1).searchParams.get('latitude')).toBe('52.943200')

  await page.reload()
  await expect(forecastStatus(page)).toContainText('Live Best Match forecast for Brouwersdam', { timeout: 15_000 })
  await page.getByRole('combobox', { name: 'Spot' }).fill('Hind')
  await expect(page.getByRole('option', { name: 'Hindeloopen' })).toBeVisible()
})

test('recomposes the preview when Weather, Temperature, and Tide change', async ({ page }) => {
  await mockForecastApi(page)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
  await expect(page.locator('[data-scene-status="ready"]')).toBeVisible({ timeout: 15_000 })
  const before = await page.locator('canvas').screenshot()

  const weather = page.getByRole('switch', { name: 'Weather' })
  await weather.focus()
  await page.keyboard.press('Space')
  await expect(weather).not.toBeChecked()

  const temperature = await selectWithKeyboard(page, 'Temperature', 'fahrenheit')
  await expect(temperature).toContainText('Fahrenheit')

  const tide = page.getByRole('switch', { name: 'Tide' })
  await expect(tide).toBeEnabled()
  await tide.focus()
  await page.keyboard.press('Space')
  await expect(tide).toBeChecked()
  const after = await page.locator('canvas').screenshot()
  expect(after.equals(before)).toBe(false)
})

test('announces why Tide is unavailable', async ({ page }) => {
  await mockForecastApi(page, { tideUnsupported: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const tide = page.getByRole('switch', { name: 'Tide' })
  await expect(tide).toBeDisabled({ timeout: 15_000 })
  await expect(tide).not.toBeChecked()
  await expect(tide).toHaveAttribute('aria-describedby', 'tide-capability-message')
  await expect(page.locator('#tide-capability-message')).toContainText('not available')
})

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900, radius: '20px' },
  { name: 'mobile', width: 390, height: 844, radius: '16px' },
  { name: 'minimum-width', width: 320, height: 700, radius: '16px' },
]) {
  test(`keeps the floating panel and popups polished at ${viewport.name} width`, async ({ page }) => {
    await mockForecastApi(page)
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('[data-scene-status="ready"]')).toBeVisible({ timeout: 15_000 })

    const panel = page.locator('.settings-panel')
    await expect(panel).toHaveCSS('border-top-width', '0px')
    await expect(panel).toHaveCSS('border-radius', viewport.radius)
    const panelMetrics = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        shadow: style.boxShadow,
        documentWidth: document.documentElement.scrollWidth,
      }
    })
    expect(panelMetrics.left).toBeGreaterThanOrEqual(0)
    expect(panelMetrics.right).toBeLessThanOrEqual(viewport.width)
    expect(panelMetrics.top).toBeGreaterThanOrEqual(0)
    expect(panelMetrics.bottom).toBeLessThanOrEqual(viewport.height)
    expect(panelMetrics.documentWidth).toBeLessThanOrEqual(viewport.width)
    expect(splitShadows(panelMetrics.shadow)).toHaveLength(2)

    const rowMetrics = await page.locator('.setting-row').evaluateAll((rows) => rows.map((row) => {
      const label = row.querySelector('.setting-row__label').getBoundingClientRect()
      const control = row.querySelector('.setting-row__control').getBoundingClientRect()
      return { labelLeft: Math.round(label.left), controlLeft: Math.round(control.left) }
    }))
    expect(new Set(rowMetrics.map(({ labelLeft }) => labelLeft)).size).toBe(1)
    expect(new Set(rowMetrics.map(({ controlLeft }) => controlLeft)).size).toBe(1)
    const controlHeights = await page.locator('.setting-control').evaluateAll((controls) =>
      controls.map((control) => control.getBoundingClientRect().height))
    expect(controlHeights.every((height) => Math.abs(height - 40) < 0.5)).toBe(true)

    const model = page.getByRole('combobox', { name: 'Model' })
    const triggerBox = await model.boundingBox()
    await model.focus()
    await page.keyboard.press('Enter')
    const popup = page.getByRole('listbox')
    await expect(popup).toBeVisible()
    const popupBox = await popup.boundingBox()
    expect(popupBox.x).toBeGreaterThanOrEqual(0)
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.width)
    expect(popupBox.width).toBeGreaterThanOrEqual(triggerBox.width - 1)
    await page.keyboard.press('Escape')
    await expect(model).toBeFocused()
    const focusStyle = await model.evaluate((element) => {
      const style = getComputedStyle(element)
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
    })
    expect(focusStyle).toEqual({ outlineStyle: 'solid', outlineWidth: '2px' })

    const spot = page.getByRole('combobox', { name: 'Spot' })
    await spot.focus()
    const spotPopup = page.getByRole('listbox')
    await expect(spotPopup).toBeVisible()
    const spotTriggerWidth = await spotPopup.evaluate((element) => {
      const value = getComputedStyle(element).getPropertyValue('--reka-combobox-trigger-width')
      return Number.parseFloat(value)
    })
    const spotPopupBox = await spotPopup.boundingBox()
    expect(spotPopupBox.x).toBeGreaterThanOrEqual(0)
    expect(spotPopupBox.x + spotPopupBox.width).toBeLessThanOrEqual(viewport.width)
    expect(spotPopupBox.width).toBeGreaterThanOrEqual(spotTriggerWidth - 1)
    await page.keyboard.press('Escape')
    await expect(spot).toBeFocused()
  })
}

test('labels a first network failure as demo outside the device screen', async ({ page }) => {
  await mockForecastApi(page, { fail: true })
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')

  await expect(page.getByTestId('forecast-label')).toHaveText('Demo')
  await expect(forecastStatus(page)).toContainText('Live forecast unavailable. Showing demo data.')
  await expect(page.getByTestId('forecast-label')).toBeVisible()
  await expect(page.getByTestId('forecast-label').locator('xpath=ancestor::aside')).toHaveCount(1)
})

test('keeps installation continuation and omits retired controls', async ({ page }) => {
  await mockForecastApi(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  await expect(page.getByText('Treatment', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Time format', { exact: true })).toHaveCount(0)
  await page.getByTestId('install-continuation').click()
  await expect(page.getByText(/USB installation is the next build step/)).toBeVisible()
})
