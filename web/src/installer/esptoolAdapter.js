import { InstallerError, INSTALLER_ERROR_CODES } from './installerErrors'

export function createEsptoolAdapter({
  moduleLoader = async () => {
    const [esptool, sparkMd5] = await Promise.all([import('esptool-js'), import('spark-md5')])
    return { ...esptool, SparkMD5: sparkMd5.default }
  },
} = {}) {
  let calculateMD5Hash
  return {
    async identify(port, terminal = { clean() {}, writeLine() {}, write() {} }) {
      const { Transport, ESPLoader, SparkMD5 } = await moduleLoader()
      calculateMD5Hash = SparkMD5
        ? (image) => SparkMD5.ArrayBuffer.hash(
            image.byteOffset === 0 && image.byteLength === image.buffer.byteLength
              ? image.buffer
              : image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength),
          )
        : undefined
      const transport = new Transport(port, false)
      const loader = new ESPLoader({ transport, baudrate: 115200, terminal })
      try {
        const chip = await loader.main('default_reset')
        return { chipFamily: /ESP32-S3/i.test(chip) ? 'ESP32-S3' : chip, loader, transport }
      } catch (error) {
        await transport.disconnect().catch(() => {})
        throw new InstallerError(INSTALLER_ERROR_CODES.INCOMPATIBLE_DEVICE, 'This USB device is not a compatible WindScout.', { cause: error })
      }
    },
    async flash({ loader, transport, bundle, onProgress = () => {} }) {
      try {
        if (bundle.eraseFlash) await loader.eraseFlash()
        const fileArray = bundle.parts.map((part) => ({ data: part.data, address: part.offset }))
        await loader.writeFlash({
          fileArray,
          flashSize: 'keep',
          flashMode: 'keep',
          flashFreq: 'keep',
          eraseAll: false,
          compress: true,
          reportProgress: (fileIndex, written, total) => onProgress({ fileIndex, written, total }),
          calculateMD5Hash,
        })
        await loader.after('custom_reset', undefined, 'D0|R1|W100|R0|W500|D0')
      } catch (error) {
        throw new InstallerError(INSTALLER_ERROR_CODES.FLASH_FAILED, 'Firmware installation was interrupted. Reconnect the device to try again.', { cause: error, safeToDisconnect: true })
      } finally {
        await transport?.disconnect().catch(() => {})
      }
    },
  }
}
