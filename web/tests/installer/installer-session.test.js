import { describe, expect, it, vi } from 'vitest'
import { createInstallerSession } from '../../src/installer/createInstallerSession'
import { InstallerError, INSTALLER_ERROR_CODES } from '../../src/installer/installerErrors'

const configuration = { digest: 'wanted' }
const release = { manifest: { version: '2.0.0', boardId: 'seeedstudio_reterminal_e1002', chipFamily: 'ESP32-S3' }, manifestUrl: new URL('https://example.test/manifest.json') }

function appProtocol(state = {}) {
  let activeDigest = state.digest ?? 'wanted'
  return {
    open: vi.fn(), close: vi.fn(), request: vi.fn(async (command) => {
      if (command === 'hello') return {
        status: 'ok', boardId: release.manifest.boardId, chipFamily: 'ESP32-S3',
        firmwareVersion: state.firmwareVersion ?? '2.0.0', protocolVersion: 1,
        configurationVersion: 2,
        capabilities: ['state', 'wifi', 'configuration', 'render-verification', 'clock-sync'],
      }
      if (command === 'get_state') return { configurationDigest: activeDigest, wifi: state.wifiHealthy === false ? 'disconnected' : 'connected', render: 'valid' }
      if (command === 'stage_configuration') return { status: 'configuration_staged' }
      if (command === 'apply_configuration') { activeDigest = 'wanted'; return { status: 'complete' } }
      return { ok: true }
    }),
  }
}

describe('installer session', () => {
  it('returns to ready when the system chooser is cancelled', async () => {
    const reporter = { report: vi.fn() }
    const session = createInstallerSession({ configuration, requestPort: async () => null, reporter })
    await session.connect()
    expect(session.getState()).toMatchObject({ phase: 'ready', error: null })
    expect(reporter.report).not.toHaveBeenCalled()
  })

  it('turns a device chooser failure into a recoverable installer state', async () => {
    const session = createInstallerSession({
      configuration,
      requestPort: async () => { throw new Error('permission failed') },
    })
    await session.connect()
    expect(session.getState()).toMatchObject({ phase: 'error', safeToDisconnect: true })
  })

  it('releases app mode when loading the firmware release fails', async () => {
    const protocol = appProtocol()
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => { throw new Error('release unavailable') },
      protocolFactory: () => protocol,
    })

    await session.connect()

    expect(protocol.close).toHaveBeenCalledOnce()
    expect(session.getState().phase).toBe('error')
  })

  it('completes immediately when an installed WindScout is current', async () => {
    const protocol = appProtocol()
    const session = createInstallerSession({ configuration, requestPort: async () => ({}), releaseLoader: async () => release, protocolFactory: () => protocol })
    await session.connect()
    expect(session.getState().action.action).toBe('up-to-date')
    await session.run()
    expect(session.getState().phase).toBe('complete')
    expect(protocol.request).not.toHaveBeenCalledWith('stage_configuration', expect.anything())
  })

  it('updates a changed configuration without loading firmware', async () => {
    const protocol = appProtocol({ digest: 'old' })
    const partsLoader = vi.fn()
    const session = createInstallerSession({ configuration, requestPort: async () => ({}), releaseLoader: async () => release, partsLoader, protocolFactory: () => protocol })
    await session.connect(); await session.run()
    expect(partsLoader).not.toHaveBeenCalled()
    expect(protocol.request).toHaveBeenCalledWith('stage_configuration', { configuration })
    expect(session.getState().phase).toBe('complete')
  })

  it('sets the device clock from the browser before sending configuration', async () => {
    const protocol = appProtocol({ digest: 'old' })
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
      now: () => 1787932800123,
    })

    await session.connect()
    await session.run()

    expect(protocol.request).toHaveBeenCalledWith('begin', { unixTime: 1787932800 })
    const beginOrder = protocol.request.mock.invocationCallOrder[
      protocol.request.mock.calls.findIndex(([command]) => command === 'begin')
    ]
    const stageOrder = protocol.request.mock.invocationCallOrder[
      protocol.request.mock.calls.findIndex(([command]) => command === 'stage_configuration')
    ]
    expect(beginOrder).toBeLessThan(stageOrder)
  })

  it('stops before configuration when the device rejects the browser clock', async () => {
    const protocol = appProtocol({ digest: 'old' })
    const originalRequest = protocol.request.getMockImplementation()
    protocol.request.mockImplementation(async (command, values, timeout) => {
      if (command === 'begin') return { status: 'clock_rejected' }
      return originalRequest(command, values, timeout)
    })
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
    })

    await session.connect()
    await session.run()

    expect(session.getState()).toMatchObject({ phase: 'error' })
    expect(protocol.request).not.toHaveBeenCalledWith('stage_configuration', expect.anything())
  })

  it('stops before USB setup when the browser clock is unusable', async () => {
    const protocol = appProtocol({ digest: 'old' })
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
      now: () => Number.NaN,
    })

    await session.connect()
    await session.run()

    expect(session.getState()).toMatchObject({ phase: 'error' })
    expect(protocol.request).not.toHaveBeenCalledWith('begin', expect.anything())
    expect(protocol.request).not.toHaveBeenCalledWith('stage_configuration', expect.anything())
  })

  it('polls an asynchronous device render instead of timing out the USB request', async () => {
    let stateChecks = 0
    const protocol = appProtocol({ digest: 'old' })
    protocol.request.mockImplementation(async (command) => {
      if (command === 'hello') return {
        status: 'ok', boardId: release.manifest.boardId, chipFamily: 'ESP32-S3',
        firmwareVersion: '2.0.0', protocolVersion: 1, configurationVersion: 2,
        capabilities: ['state', 'wifi', 'configuration', 'render-verification', 'clock-sync'],
      }
      if (command === 'get_state') {
        stateChecks += 1
        if (stateChecks === 1) {
          return { configurationDigest: 'old', wifi: 'connected', render: 'pending', apply: 'idle' }
        }
        if (stateChecks < 4) {
          // A previous valid frame and the desired digest must not make an
          // in-progress physical panel refresh look complete.
          return { configurationDigest: 'wanted', wifi: 'connected', render: 'valid', apply: 'applying' }
        }
        return { configurationDigest: 'wanted', wifi: 'connected', render: 'valid', apply: 'complete' }
      }
      if (command === 'stage_configuration') return { status: 'configuration_staged' }
      if (command === 'apply_configuration') return { status: 'applying' }
      return { status: 'ok' }
    })
    const waitFor = vi.fn().mockResolvedValue(undefined)
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
      waitFor,
    })

    await session.connect()
    await session.run()

    expect(waitFor).toHaveBeenCalledTimes(3)
    expect(session.getState()).toMatchObject({ phase: 'complete', progress: 1 })
  })

  it('keeps the browser request alive beyond the device Wi-Fi timeout', async () => {
    const protocol = appProtocol({ wifiHealthy: false })
    const sentCredentials = []
    const originalRequest = protocol.request.getMockImplementation()
    protocol.request.mockImplementation(async (command, values, timeout) => {
      if (command === 'test_wifi') sentCredentials.push({ ...values })
      return originalRequest(command, values, timeout)
    })
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
    })

    await session.connect()
    await session.run()
    await session.submitWifi({ ssid: 'Home', password: 'secret' })

    expect(sentCredentials).toEqual([{ ssid: 'Home', password: 'secret' }])
    const transmittedReference = protocol.request.mock.calls.find(([command]) => command === 'test_wifi')[1]
    expect(transmittedReference.password).toBe('')
    expect(transmittedReference.ssid).toBe('')
  })

  it('reports a Wi-Fi failure only after credential references are cleared', async () => {
    const protocol = appProtocol({ wifiHealthy: false })
    const originalRequest = protocol.request.getMockImplementation()
    let transmittedReference
    protocol.request.mockImplementation(async (command, values, timeout) => {
      if (command === 'test_wifi') {
        transmittedReference = values
        throw new InstallerError(INSTALLER_ERROR_CODES.WIFI_FAILED, 'wifi rejected')
      }
      return originalRequest(command, values, timeout)
    })
    const reporter = { report: vi.fn(async () => ({ status: 'sent', reference: 'WS-TEST12345' })) }
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
      reporter,
    })

    await session.connect()
    await session.run()
    await session.submitWifi({ ssid: 'Home', password: 'secret' })
    await vi.waitFor(() => expect(reporter.report).toHaveBeenCalledOnce())

    expect(transmittedReference).toEqual({ ssid: '', password: '' })
    expect(JSON.stringify(reporter.report.mock.calls[0][0].snapshot)).not.toMatch(/Home|secret/)
  })

  it('reports a failed Wi-Fi scan once while leaving retry available', async () => {
    const protocol = appProtocol({ wifiHealthy: false })
    const originalRequest = protocol.request.getMockImplementation()
    protocol.request.mockImplementation(async (command, values, timeout) => {
      if (command === 'scan_networks') throw new Error('scan failed')
      return originalRequest(command, values, timeout)
    })
    const reporter = { report: vi.fn(async () => ({ status: 'failed' })) }
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
      reporter,
    })

    await session.connect()
    await session.run()
    await expect(session.scanNetworks()).rejects.toMatchObject({ code: INSTALLER_ERROR_CODES.WIFI_FAILED })
    await vi.waitFor(() => expect(reporter.report).toHaveBeenCalledOnce())

    expect(session.getState()).toMatchObject({ phase: 'wifi', safeToDisconnect: true })
  })

  it('releases a timed-out serial session before reopening the device', async () => {
    const timedOutProtocol = appProtocol({ wifiHealthy: false })
    const originalRequest = timedOutProtocol.request.getMockImplementation()
    timedOutProtocol.request.mockImplementation(async (command, values, timeout) => {
      if (command === 'test_wifi') {
        throw new InstallerError(INSTALLER_ERROR_CODES.CONNECTION_LOST, 'reader cancelled')
      }
      return originalRequest(command, values, timeout)
    })
    const recoveredProtocol = appProtocol()
    const protocolFactory = vi.fn()
      .mockReturnValueOnce(timedOutProtocol)
      .mockReturnValueOnce(recoveredProtocol)
    const requestPort = vi.fn()
      .mockResolvedValueOnce({ id: 'initial-port' })
      .mockResolvedValueOnce({ id: 'reconnected-port' })
    const session = createInstallerSession({
      configuration,
      requestPort,
      releaseLoader: async () => release,
      protocolFactory,
    })

    await session.connect()
    await session.run()
    await session.submitWifi({ ssid: 'Home', password: 'secret' })
    expect(session.getState().phase).toBe('reconnect')

    await session.reconnect()

    expect(timedOutProtocol.close).toHaveBeenCalledBefore(recoveredProtocol.open)
    expect(session.getState().phase).toBe('complete')
  })

  it('requires explicit E1002 confirmation before a clean flash', async () => {
    const esptool = { identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', loader: {}, transport: {} })), flash: vi.fn() }
    const brokenProtocol = { open: vi.fn().mockRejectedValue(new Error('no app')), close: vi.fn() }
    const session = createInstallerSession({ configuration, requestPort: async () => ({}), releaseLoader: async () => release, protocolFactory: () => brokenProtocol, esptool, partsLoader: async () => ({ eraseFlash: true, parts: [] }) })
    await session.connect()
    expect(session.getState().phase).toBe('confirm-device')
    session.confirmDevice()
    expect(session.getState().phase).toBe('review')
    await session.run()
    expect(esptool.flash).toHaveBeenCalledOnce()
    expect(session.getState().phase).toBe('reconnect')
  })

  it('ignores stale chooser responses after cancellation', async () => {
    let resolvePort
    const session = createInstallerSession({ configuration, requestPort: () => new Promise((resolve) => { resolvePort = resolve }) })
    const connecting = session.connect()
    await session.cancel()
    resolvePort({})
    await connecting
    expect(session.getState().phase).toBe('ready')
  })

  it('does not let cancelled configuration work overwrite the ready state', async () => {
    let finishStaging
    const protocol = appProtocol({ digest: 'old' })
    const originalRequest = protocol.request.getMockImplementation()
    protocol.request.mockImplementation(async (command, values, timeout) => {
      if (command === 'stage_configuration') {
        return new Promise((resolve) => { finishStaging = resolve })
      }
      return originalRequest(command, values, timeout)
    })
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      protocolFactory: () => protocol,
    })

    await session.connect()
    const running = session.run()
    await vi.waitFor(() => expect(finishStaging).toBeTypeOf('function'))
    await session.cancel()
    finishStaging({ status: 'configuration_staged' })
    await running

    expect(session.getState()).toMatchObject({ phase: 'ready', progress: 0, action: null })
  })

  it('cannot disconnect the device while firmware bytes are being written', async () => {
    let finishFlash
    const oldProtocol = appProtocol({ firmwareVersion: '1.0.0' })
    const esptool = {
      identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', loader: {}, transport: {} })),
      flash: vi.fn(() => new Promise((resolve) => { finishFlash = resolve })),
    }
    const session = createInstallerSession({
      configuration,
      requestPort: async () => ({}),
      releaseLoader: async () => release,
      partsLoader: async () => ({ eraseFlash: false, parts: [] }),
      protocolFactory: () => oldProtocol,
      esptool,
    })

    await session.connect()
    const running = session.run()
    await vi.waitFor(() => expect(session.getState().phase).toBe('installing-firmware'))

    await session.cancel()
    expect(session.getState().phase).toBe('installing-firmware')

    finishFlash()
    await running
    expect(session.getState().phase).toBe('reconnect')
  })

  it('requires a new enclosure confirmation after cancellation', async () => {
    const esptool = { identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', loader: {}, transport: { disconnect: vi.fn() } })), flash: vi.fn() }
    const brokenProtocol = { open: vi.fn().mockRejectedValue(new Error('no app')), close: vi.fn() }
    const session = createInstallerSession({ configuration, requestPort: async () => ({}), releaseLoader: async () => release, protocolFactory: () => brokenProtocol, esptool, partsLoader: async () => ({ eraseFlash: true, parts: [] }) })

    await session.connect()
    session.confirmDevice()
    await session.cancel()
    await session.connect()
    expect(session.getState().phase).toBe('confirm-device')
    await session.run()
    expect(esptool.flash).not.toHaveBeenCalled()
  })

  it('closes app mode before a firmware update and reuses a granted port after restart', async () => {
    const oldProtocol = appProtocol({ firmwareVersion: '1.0.0' })
    const restartedProtocol = appProtocol()
    const protocolFactory = vi.fn()
      .mockReturnValueOnce(oldProtocol)
      .mockReturnValueOnce(restartedProtocol)
    const esptool = {
      identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', loader: {}, transport: {} })),
      flash: vi.fn(),
    }
    const requestPort = vi.fn(async () => ({ id: 'initial-port' }))
    requestPort.mockResolvedValueOnce({ id: 'initial-port' }).mockResolvedValueOnce({ id: 'restarted-port' })
    const session = createInstallerSession({
      configuration,
      requestPort,
      releaseLoader: async () => release,
      partsLoader: async () => ({ eraseFlash: false, parts: [] }),
      protocolFactory,
      esptool,
    })

    await session.connect()
    expect(session.getState().action.action).toBe('update-firmware')
    await session.run()
    expect(oldProtocol.close).toHaveBeenCalledBefore(esptool.identify)
    expect(session.getState().phase).toBe('reconnect')
    await session.reconnect()
    expect(requestPort).toHaveBeenCalledTimes(2)
    expect(session.getState().phase).toBe('complete')
  })

  it('asks for reconnect when state probing or configuration loses USB', async () => {
    const protocol = appProtocol({ digest: 'old' })
    protocol.request.mockImplementationOnce(async () => ({
      status: 'ok', boardId: release.manifest.boardId, chipFamily: 'ESP32-S3',
      firmwareVersion: '2.0.0', protocolVersion: 1, configurationVersion: 2,
      capabilities: ['state', 'wifi', 'configuration', 'render-verification', 'clock-sync'],
    }))
      .mockRejectedValueOnce(new Error('disconnected'))
    const session = createInstallerSession({ configuration, requestPort: async () => ({}), releaseLoader: async () => release, protocolFactory: () => protocol })
    await session.connect()
    expect(session.getState().phase).toBe('reconnect')
  })

  it('recovers an interrupted flash through an explicit reconnect and confirmation', async () => {
    const transport = { disconnect: vi.fn() }
    const esptool = {
      identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', loader: {}, transport })),
      flash: vi.fn().mockRejectedValueOnce(new InstallerError(
        INSTALLER_ERROR_CODES.FLASH_FAILED,
        'Firmware installation was interrupted.',
        { safeToDisconnect: true },
      )),
    }
    const brokenProtocol = { open: vi.fn().mockRejectedValue(new Error('no app')), close: vi.fn() }
    const requestPort = vi.fn()
      .mockResolvedValueOnce({ id: 'initial-port' })
      .mockResolvedValueOnce({ id: 'reconnected-port' })
    const session = createInstallerSession({
      configuration, requestPort, releaseLoader: async () => release,
      partsLoader: async () => ({ eraseFlash: true, parts: [] }),
      protocolFactory: () => brokenProtocol, esptool,
    })

    await session.connect()
    session.confirmDevice()
    await session.run()
    expect(session.getState().phase).toBe('reconnect')

    await session.reconnect()
    expect(session.getState().phase).toBe('confirm-device')
    expect(requestPort).toHaveBeenCalledTimes(2)
  })

  it('keeps reconnect recoverable when the device chooser fails', async () => {
    const brokenProtocol = { open: vi.fn().mockRejectedValue(new Error('no app')), close: vi.fn() }
    const esptool = {
      identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', loader: {}, transport: {} })),
      flash: vi.fn(),
    }
    const requestPort = vi.fn()
      .mockResolvedValueOnce({ id: 'initial-port' })
      .mockRejectedValueOnce(new Error('permission failed'))
    const session = createInstallerSession({
      configuration, requestPort, releaseLoader: async () => release,
      partsLoader: async () => ({ eraseFlash: true, parts: [] }),
      protocolFactory: () => brokenProtocol, esptool,
    })

    await session.connect()
    session.confirmDevice()
    await session.run()
    await session.reconnect()

    expect(session.getState()).toMatchObject({ phase: 'reconnect', safeToDisconnect: true })
    expect(session.getState().error).toBeInstanceOf(InstallerError)
  })

  it('never trusts an incomplete hello as a verified E1002', async () => {
    const incomplete = {
      open: vi.fn(), close: vi.fn(),
      request: vi.fn(async () => ({ boardId: release.manifest.boardId, firmwareVersion: '2.0.0' })),
    }
    const esptool = { identify: vi.fn(async () => ({ chipFamily: 'ESP32-S3', transport: {} })) }
    const session = createInstallerSession({
      configuration, requestPort: async () => ({}), releaseLoader: async () => release,
      protocolFactory: () => incomplete, esptool,
    })
    await session.connect()
    expect(incomplete.close).toHaveBeenCalled()
    expect(session.getState().phase).toBe('confirm-device')
  })
})
