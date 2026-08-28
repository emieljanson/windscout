import { resolveInstallAction, INSTALL_ACTIONS } from './actionResolver'
import { CHIP_FAMILY, loadFirmwareParts, loadFirmwareRelease } from './firmwareManifest'
import { BOARD_ID, CONFIGURATION_VERSION } from '../config/configuration'
import { asInstallerError, InstallerError, INSTALLER_ERROR_CODES } from './installerErrors'
import { createEsptoolAdapter } from './esptoolAdapter'
import { createSerialProtocol, requestInstallerPort } from './serialPortAdapter'

const INITIAL_STATE = Object.freeze({
  phase: 'ready', progress: 0, safeToDisconnect: true, error: null, action: null,
})
const REQUIRED_CAPABILITIES = ['state', 'wifi', 'configuration', 'render-verification', 'clock-sync']
// A failed candidate may take 45 seconds, followed by up to 45 seconds to
// restore the previously saved network. Keep enough serial margin for both.
const WIFI_TEST_REQUEST_TIMEOUT_MS = 105000

function validHello(hello) {
  return hello?.status === 'ok' && typeof hello.boardId === 'string' &&
    typeof hello.firmwareVersion === 'string' && hello.protocolVersion === 1 &&
    hello.configurationVersion === CONFIGURATION_VERSION && Array.isArray(hello.capabilities) &&
    REQUIRED_CAPABILITIES.every((capability) => hello.capabilities.includes(capability))
}

export function createInstallerSession({
  configuration,
  navigatorApi = globalThis.navigator,
  releaseLoader = loadFirmwareRelease,
  partsLoader = loadFirmwareParts,
  protocolFactory = createSerialProtocol,
  esptool = createEsptoolAdapter(),
  requestPort = () => requestInstallerPort(navigatorApi),
  waitFor = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now(),
} = {}) {
  let state = { ...INITIAL_STATE }
  let port = null
  let protocol = null
  let release = null
  let device = null
  let action = null
  let attempt = 0
  let confirmed = false
  let operationController = null
  const listeners = new Set()

  function update(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }

  async function releaseConnections({ clearDevice = false } = {}) {
    const activeProtocol = protocol
    const bootloaderTransport = device?.bootloader?.transport
    protocol = null
    if (clearDevice) device = null
    await Promise.allSettled([
      activeProtocol?.close(),
      bootloaderTransport?.disconnect?.(),
    ].filter(Boolean))
  }

  function isCurrent(expectedAttempt) {
    return expectedAttempt === attempt
  }

  async function probeApp(selectedPort) {
    const candidate = protocolFactory(selectedPort)
    let hello
    try {
      await candidate.open()
      hello = await candidate.request('hello')
      if (!validHello(hello)) throw new Error('Incomplete WindScout identity')
    } catch {
      try { await candidate.close() } catch {}
      return null
    }
    try {
      const current = await candidate.request('get_state')
      return {
        protocol: candidate,
        device: {
          kind: 'windscout',
          verifiedBoard: hello.boardId === BOARD_ID,
          boardId: hello.boardId,
          chipFamily: hello.chipFamily ?? CHIP_FAMILY,
          firmwareVersion: hello.firmwareVersion,
          // Firmware released before this field was introduced uses the same
          // original partition layout, so it is safely version 1.
          firmwareLayoutVersion: hello.firmwareLayoutVersion ?? 1,
          configurationDigest: current.configurationDigest ?? null,
          wifiHealthy: current.wifiHealthy ?? current.wifi === 'connected',
          damaged: false,
        },
      }
    } catch (error) {
      try { await candidate.close() } catch {}
      throw new InstallerError(INSTALLER_ERROR_CODES.CONNECTION_LOST, 'WindScout disconnected while its setup was checked.', { cause: error })
    }
  }

  async function connect() {
    const currentAttempt = ++attempt
    confirmed = false
    operationController?.abort()
    operationController = new AbortController()
    update({ phase: 'choosing-device', error: null })
    let selectedPort
    try {
      selectedPort = await requestPort()
    } catch (error) {
      if (currentAttempt !== attempt) return state
      const installerError = asInstallerError(error, INSTALLER_ERROR_CODES.DEVICE_NOT_ALLOWED, 'WindScout could not access the selected USB device.')
      update({ phase: 'error', error: installerError, safeToDisconnect: true })
      return state
    }
    if (currentAttempt !== attempt) return state
    if (!selectedPort) {
      update({ ...INITIAL_STATE, phase: 'ready' })
      return state
    }
    port = selectedPort
    update({ phase: 'checking-device' })
    try {
      await releaseConnections({ clearDevice: true })
      const [releaseResult, probeResult] = await Promise.allSettled([
        releaseLoader({ signal: operationController.signal }),
        probeApp(port),
      ])
      const appProbe = probeResult.status === 'fulfilled' ? probeResult.value : null
      if (releaseResult.status === 'rejected' || probeResult.status === 'rejected') {
        try { await appProbe?.protocol.close() } catch {}
        throw releaseResult.status === 'rejected' ? releaseResult.reason : probeResult.reason
      }
      const loadedRelease = releaseResult.value
      if (currentAttempt !== attempt) {
        try { await appProbe?.protocol.close() } catch {}
        return state
      }
      release = loadedRelease
      protocol = appProbe?.protocol ?? null
      device = appProbe?.device ?? null
      if (!device) {
        const identity = await esptool.identify(port)
        if (currentAttempt !== attempt) {
          try { await identity.transport?.disconnect() } catch {}
          return state
        }
        device = { kind: 'rom', chipFamily: identity.chipFamily, verifiedBoard: false, firmwareVersion: null, bootloader: identity }
      }
      action = resolveInstallAction({ device, release: release.manifest, configurationDigest: configuration.digest })
      if (action.action === INSTALL_ACTIONS.BLOCKED) {
        throw new InstallerError(INSTALLER_ERROR_CODES.INCOMPATIBLE_DEVICE, 'This is not a supported reTerminal E1002.', { recoverable: false })
      }
      update({ phase: action.action === INSTALL_ACTIONS.CONFIRM_E1002 ? 'confirm-device' : 'review', action })
    } catch (error) {
      if (currentAttempt !== attempt) return state
      await releaseConnections({ clearDevice: true })
      const installerError = asInstallerError(error, INSTALLER_ERROR_CODES.INVALID_RESPONSE, 'WindScout could not check this device.')
      update({ phase: installerError.code === INSTALLER_ERROR_CODES.CONNECTION_LOST ? 'reconnect' : 'error', error: installerError, safeToDisconnect: installerError.safeToDisconnect })
    }
    return state
  }

  function confirmDevice() {
    if (state.phase !== 'confirm-device') return
    confirmed = true
    action = { action: INSTALL_ACTIONS.INSTALL, reason: 'confirmed-e1002' }
    update({ phase: 'review', action })
  }

  async function scanNetworks() {
    if (!protocol) return []
    const response = await protocol.request('scan_networks', {}, 45000)
    return Array.isArray(response.networks) ? response.networks : []
  }

  async function configure(credentials, expectedAttempt = attempt) {
    if (!protocol) throw new InstallerError(INSTALLER_ERROR_CODES.CONNECTION_LOST, 'Reconnect WindScout to finish setup.')
    update({ phase: 'configuring', progress: 0.82, safeToDisconnect: true })
    const unixTime = Math.floor(now() / 1000)
    if (!Number.isSafeInteger(unixTime)) {
      throw new InstallerError(INSTALLER_ERROR_CODES.INVALID_RESPONSE, 'WindScout could not read this computer’s time.')
    }
    const begun = await protocol.request('begin', { unixTime })
    if (begun.status === 'clock_rejected') {
      throw new InstallerError(INSTALLER_ERROR_CODES.INVALID_RESPONSE, 'WindScout could not set its clock from this computer.')
    }
    if (!isCurrent(expectedAttempt)) return false
    const staged = await protocol.request('stage_configuration', { configuration })
    if (!isCurrent(expectedAttempt)) return false
    if (staged.status !== 'configuration_staged') throw new InstallerError(INSTALLER_ERROR_CODES.INVALID_RESPONSE, 'WindScout rejected this configuration.')
    if (credentials) {
      const wifi = await protocol.request('test_wifi', credentials, WIFI_TEST_REQUEST_TIMEOUT_MS)
      credentials.password = ''
      if (!isCurrent(expectedAttempt)) return false
      if (wifi.status !== 'wifi_ready') throw new InstallerError(INSTALLER_ERROR_CODES.WIFI_FAILED, 'WindScout could not connect to that Wi-Fi network.')
    }
    update({ phase: 'verifying', progress: 0.92 })
    const applied = await protocol.request('apply_configuration')
    if (!isCurrent(expectedAttempt)) return false
    if (!['applying', 'complete'].includes(applied.status)) {
      throw new InstallerError(INSTALLER_ERROR_CODES.VERIFICATION_FAILED, 'WindScout could not apply the new setup.')
    }
    for (let poll = 0; poll < 180; poll += 1) {
      if (poll > 0 || applied.status === 'applying') await waitFor(1000)
      if (!isCurrent(expectedAttempt)) return false
      const status = await protocol.request('get_state')
      if (!isCurrent(expectedAttempt)) return false
      if (['render_failed', 'commit_failed'].includes(status.apply)) {
        throw new InstallerError(INSTALLER_ERROR_CODES.VERIFICATION_FAILED, 'WindScout could not apply the new setup.')
      }
      const applyComplete = status.apply === 'complete' ||
        (applied.status === 'complete' && [undefined, 'idle'].includes(status.apply))
      if (applyComplete && status.configurationDigest === configuration.digest &&
          status.wifi === 'connected' && status.render === 'valid') return true
    }
    throw new InstallerError(INSTALLER_ERROR_CODES.VERIFICATION_FAILED, 'WindScout could not verify the new setup.')
  }

  async function run() {
    if (state.phase !== 'review') return state
    const currentAttempt = attempt
    try {
      if (action.action === INSTALL_ACTIONS.UP_TO_DATE) {
        update({ phase: 'complete', progress: 1 })
        return state
      }
      if ([INSTALL_ACTIONS.INSTALL, INSTALL_ACTIONS.REINSTALL, INSTALL_ACTIONS.UPDATE_FIRMWARE].includes(action.action)) {
        if (!device.verifiedBoard && !confirmed) throw new InstallerError(INSTALLER_ERROR_CODES.UNCONFIRMED_DEVICE, 'Confirm the reTerminal E1002 before installing.')
        const mode = action.action === INSTALL_ACTIONS.UPDATE_FIRMWARE ? 'preservingUpdate' : 'cleanInstall'
        update({ phase: 'downloading', progress: 0.05 })
        const bundle = await partsLoader({ ...release, mode, signal: operationController?.signal })
        if (currentAttempt !== attempt) return state
        update({ phase: 'installing-firmware', progress: 0.15, safeToDisconnect: false })
        if (!device.bootloader) {
          await protocol?.close()
          protocol = null
        }
        const identity = device.bootloader ?? await esptool.identify(port)
        const totalBytes = bundle.parts.reduce((sum, part) => sum + part.size, 0)
        await esptool.flash({
          ...identity,
          bundle,
          onProgress: ({ fileIndex, written }) => {
            const completedBytes = bundle.parts.slice(0, fileIndex).reduce((sum, part) => sum + part.size, 0)
            if (isCurrent(currentAttempt)) {
              update({ progress: 0.15 + ((completedBytes + written) / totalBytes) * 0.62 })
            }
          },
        })
        protocol = null
        update({ phase: 'reconnect', progress: 0.78, safeToDisconnect: true })
        return state
      }
      if (!device.wifiHealthy) {
        update({ phase: 'wifi', progress: 0.8, safeToDisconnect: true })
        return state
      }
      if (!await configure(undefined, currentAttempt)) return state
      update({ phase: 'complete', progress: 1, safeToDisconnect: true })
    } catch (error) {
      if (currentAttempt !== attempt) return state
      const installerError = asInstallerError(error, INSTALLER_ERROR_CODES.INVALID_RESPONSE, 'WindScout setup could not continue.')
      update({
        phase: installerError.code === INSTALLER_ERROR_CODES.FLASH_FAILED ? 'reconnect' : 'error',
        error: installerError,
        safeToDisconnect: installerError.safeToDisconnect,
      })
    }
    return state
  }

  async function attachReconnectedPort(reconnectedPort, expectedAttempt = attempt) {
    port = reconnectedPort
    const appProbe = await probeApp(port)
    if (expectedAttempt !== attempt) {
      try { await appProbe?.protocol.close() } catch {}
      return state
    }
    if (!appProbe) {
      const identity = await esptool.identify(port)
      if (expectedAttempt !== attempt) {
        try { await identity.transport?.disconnect() } catch {}
        return state
      }
      device = {
        kind: 'rom', chipFamily: identity.chipFamily, verifiedBoard: false,
        firmwareVersion: null, bootloader: identity,
      }
      release ??= await releaseLoader({ signal: operationController?.signal })
      if (expectedAttempt !== attempt) {
        try { await identity.transport?.disconnect() } catch {}
        return state
      }
      action = resolveInstallAction({ device, release: release.manifest, configurationDigest: configuration.digest })
      if (action.action === INSTALL_ACTIONS.BLOCKED) {
        throw new InstallerError(INSTALLER_ERROR_CODES.INCOMPATIBLE_DEVICE, 'This is not a supported reTerminal E1002.', { recoverable: false })
      }
      confirmed = false
      update({ phase: 'confirm-device', progress: 0, safeToDisconnect: true, action })
      return state
    }
    protocol = appProbe.protocol
    device = appProbe.device
    if (!device.wifiHealthy) update({ phase: 'wifi', progress: 0.8, safeToDisconnect: true })
    else {
      if (!await configure(undefined, expectedAttempt)) return state
      update({ phase: 'complete', progress: 1, safeToDisconnect: true })
    }
    return state
  }

  async function reconnect() {
    const currentAttempt = ++attempt
    operationController?.abort()
    operationController = new AbortController()
    update({ phase: 'reconnecting', error: null, safeToDisconnect: true })
    // A timed-out read cancels the stream but may leave its locks and port
    // open. Release that session before asking Chrome to grant the port again.
    try { await protocol?.close() } catch {}
    protocol = null
    try {
      const selectedPort = await requestPort()
      if (currentAttempt !== attempt) return state
      if (!selectedPort) {
        update({ phase: 'reconnect', safeToDisconnect: true })
        return state
      }
      return await attachReconnectedPort(selectedPort, currentAttempt)
    } catch (error) {
      if (currentAttempt !== attempt) return state
      await releaseConnections({ clearDevice: true })
      const installerError = asInstallerError(error, INSTALLER_ERROR_CODES.CONNECTION_LOST, 'WindScout did not reconnect yet.')
      update({ phase: 'reconnect', error: installerError, safeToDisconnect: true })
      return state
    }
  }

  async function submitWifi({ ssid, password }) {
    if (state.phase !== 'wifi') return state
    const currentAttempt = attempt
    const credentials = { ssid: String(ssid), password: String(password) }
    try {
      if (!await configure(credentials, currentAttempt)) return state
      update({ phase: 'complete', progress: 1, safeToDisconnect: true })
    } catch (error) {
      credentials.password = ''
      if (currentAttempt !== attempt) return state
      const installerError = asInstallerError(error, INSTALLER_ERROR_CODES.WIFI_FAILED, 'WindScout could not connect to that Wi-Fi network.')
      const phase = installerError.code === INSTALLER_ERROR_CODES.WIFI_FAILED
        ? 'wifi'
        : installerError.code === INSTALLER_ERROR_CODES.CONNECTION_LOST ? 'reconnect' : 'error'
      update({ phase, error: installerError, safeToDisconnect: true })
    }
    return state
  }

  async function cancel() {
    if (!state.safeToDisconnect) return state
    attempt += 1
    confirmed = false
    operationController?.abort()
    operationController = null
    await releaseConnections({ clearDevice: true })
    port = null
    update({ ...INITIAL_STATE })
    return state
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
    connect,
    confirmDevice,
    run,
    scanNetworks,
    submitWifi,
    attachReconnectedPort,
    reconnect,
    cancel,
  }
}
