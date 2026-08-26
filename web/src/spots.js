export const DEFAULT_SPOT_ID = 'brouwersdam'

export const SPOTS = Object.freeze([
  Object.freeze({
    id: 'edam',
    name: 'Edam',
    displayName: 'EDAM',
    latitude: 52.5126,
    longitude: 5.0486,
    timezone: 'Europe/Amsterdam',
  }),
  Object.freeze({
    id: 'brouwersdam',
    name: 'Brouwersdam',
    displayName: 'BROUWERSDAM',
    latitude: 51.7506,
    longitude: 3.8577,
    timezone: 'Europe/Amsterdam',
  }),
  Object.freeze({
    id: 'castricum-aan-zee',
    name: 'Castricum aan Zee',
    displayName: 'CASTRICUM AAN ZEE',
    latitude: 52.555,
    longitude: 4.609,
    timezone: 'Europe/Amsterdam',
  }),
])

export function getSpot(spotId) {
  return SPOTS.find((spot) => spot.id === spotId) ?? null
}
