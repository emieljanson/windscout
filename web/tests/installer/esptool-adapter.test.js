import { describe, expect, it, vi } from 'vitest'
import { createEsptoolAdapter } from '../../src/installer/esptoolAdapter'
import { INSTALLER_ERROR_CODES } from '../../src/installer/installerErrors'

describe('esptool adapter', () => {
  it('enters the bootloader, verifies writes with MD5, resets and disconnects', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    class Transport {
      constructor(port, tracing) { this.port = port; this.tracing = tracing }
      disconnect = disconnect
    }
    const loader = {
      main: vi.fn().mockResolvedValue('ESP32-S3'),
      writeFlash: vi.fn(async (options) => {
        expect(options.calculateMD5Hash(new Uint8Array([1, 2]))).toBe('verified-md5')
      }),
      after: vi.fn(),
    }
    class ESPLoader { constructor() { return loader } }
    const SparkMD5 = { ArrayBuffer: { hash: vi.fn(() => 'verified-md5') } }
    const adapter = createEsptoolAdapter({ moduleLoader: async () => ({ Transport, ESPLoader, SparkMD5 }) })

    const identity = await adapter.identify({ id: 'port' })
    expect(loader.main).toHaveBeenCalledWith('default_reset')
    await adapter.flash({ ...identity, bundle: { eraseFlash: false, parts: [{ offset: 0, data: new Uint8Array([1, 2]) }] } })
    expect(loader.writeFlash).toHaveBeenCalledOnce()
    expect(loader.after).toHaveBeenCalledWith(
      'custom_reset',
      undefined,
      'D0|R1|W100|R0|W500|D0',
    )
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('reports a failed write as safe after transport cleanup', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    class Transport { disconnect = disconnect }
    const loader = { main: vi.fn().mockResolvedValue('ESP32-S3'), writeFlash: vi.fn().mockRejectedValue(new Error('lost')), after: vi.fn() }
    class ESPLoader { constructor() { return loader } }
    const adapter = createEsptoolAdapter({ moduleLoader: async () => ({ Transport, ESPLoader }) })
    const identity = await adapter.identify({})

    await expect(adapter.flash({ ...identity, bundle: { eraseFlash: false, parts: [] } }))
      .rejects.toMatchObject({ code: INSTALLER_ERROR_CODES.FLASH_FAILED, safeToDisconnect: true })
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
