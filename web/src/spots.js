import generatedCatalog from './spots/catalog.generated.json'

export const DEFAULT_SPOT_ID = 'brouwersdam'

export const SPOTS = Object.freeze(generatedCatalog.map((spot) => Object.freeze(spot)))

const SPOTS_BY_ID = new Map(SPOTS.map((spot) => [spot.id, spot]))

export function getSpot(spotId) {
  return SPOTS_BY_ID.get(spotId) ?? null
}
