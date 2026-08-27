import 'maplibre-gl/dist/maplibre-gl.css'

export async function createGeoapifyMap(container, {
  apiKey,
  center,
  signal,
  onCenterChange = () => {},
}) {
  if (!container) throw new Error('The map container is unavailable.')
  if (!apiKey) throw new Error('Geoapify is not configured for this site.')
  const { Map, NavigationControl } = await import('maplibre-gl')
  const map = new Map({
    container,
    style: `https://maps.geoapify.com/v1/styles/positron/style.json?apiKey=${encodeURIComponent(apiKey)}`,
    center: [center.longitude, center.latitude],
    zoom: 13,
    attributionControl: true,
  })
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  const reportCenter = () => {
    const value = map.getCenter()
    onCenterChange({ latitude: value.lat, longitude: value.lng })
  }
  map.on('moveend', reportCenter)
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      map.off('load', loaded)
      map.off('error', failed)
      signal?.removeEventListener('abort', aborted)
    }
    const loaded = () => {
      cleanup()
      map.resize()
      resolve()
    }
    const fail = (error) => {
      cleanup()
      map.off('moveend', reportCenter)
      map.remove()
      reject(error)
    }
    const failed = () => fail(new Error('The map could not be loaded.'))
    const aborted = () => fail(new DOMException('Aborted', 'AbortError'))
    map.once('load', loaded)
    map.once('error', failed)
    if (signal?.aborted) aborted()
    else signal?.addEventListener('abort', aborted, { once: true })
  })
  return {
    destroy() {
      map.off('moveend', reportCenter)
      map.remove()
    },
  }
}
