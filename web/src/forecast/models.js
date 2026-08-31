const always = (id, label, screenLabel = label.toUpperCase()) => Object.freeze({
  id, apiId: id, label, screenLabel, availability: 'always',
})

const regional = (id, apiId, label, countryCodes, options = {}) => Object.freeze({
  id,
  apiId,
  label,
  screenLabel: options.screenLabel ?? label.toUpperCase(),
  availability: 'regional',
  countryCodes: Object.freeze(countryCodes),
  coordinateCheck: options.coordinateCheck,
})

const WORLDWIDE_MODELS = [
  always('best_match', 'Best Match'),
  always('ecmwf_ifs', 'ECMWF IFS'),
  always('icon_seamless', 'DWD ICON'),
  always('ncep_gfs_seamless', 'NOAA GFS'),
]

const DMI_COUNTRIES = [
  'at', 'be', 'ch', 'cz', 'de', 'dk', 'ee', 'fi', 'fr', 'gb', 'ie', 'is',
  'lt', 'lu', 'lv', 'nl', 'no', 'pl', 'se',
]

const REGIONAL_MODELS = [
  regional('knmi_harmonie', 'knmi_harmonie_arome_netherlands', 'KNMI HARMONIE', ['nl', 'be']),
  regional('dmi_harmonie', 'dmi_harmonie_arome_europe', 'DMI HARMONIE', DMI_COUNTRIES),
  regional('met_nordic', 'metno_nordic', 'MET Nordic', ['dk', 'fi', 'no', 'se']),
  regional('meteofrance_arome', 'meteofrance_arome_france_hd', 'Météo-France AROME', ['fr']),
  regional('ukmo_ukv', 'ukmo_uk_deterministic_2km', 'UK Met Office UKV', ['gb', 'ie']),
  regional('meteoswiss_icon', 'meteoswiss_icon_ch1', 'MeteoSwiss ICON', ['ch', 'li']),
  regional('geosphere_arome', 'geosphere_arome_austria', 'GeoSphere AROME', ['at']),
  regional('italiameteo_icon', 'italia_meteo_arpae_icon_2i', 'ItaliaMeteo ICON', ['it']),
  regional('chmi_aladin', 'chmi_aladin_cz_1km', 'CHMI ALADIN', ['cz']),
  regional('noaa_hrrr', 'ncep_hrrr_conus', 'NOAA HRRR', ['us'], {
    coordinateCheck: ({ latitude, longitude }) =>
      latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66,
  }),
  regional('canada_hrdps', 'cmc_gem_hrdps', 'Environment Canada HRDPS', ['ca']),
  regional('jma_msm', 'jma_msm', 'JMA MSM', ['jp']),
  regional('kma_ldps', 'kma_ldps', 'KMA LDPS', ['kr']),
]

export const FORECAST_MODELS = Object.freeze([...WORLDWIDE_MODELS, ...REGIONAL_MODELS])

export const ALWAYS_FORECAST_MODEL_IDS = Object.freeze(WORLDWIDE_MODELS.map((model) => model.id))
export const DEFAULT_FORECAST_MODEL_ID = 'best_match'

export function getForecastModel(modelId) {
  return FORECAST_MODELS.find((model) => model.id === modelId) ?? null
}

export function forecastModelsForSpot(spot) {
  const countryCode = String(spot?.countryCode ?? '').toLowerCase()
  const latitude = Number(spot?.latitude)
  const longitude = Number(spot?.longitude)
  const regionalModels = REGIONAL_MODELS.filter((model) =>
    model.countryCodes.includes(countryCode) &&
    (!model.coordinateCheck || model.coordinateCheck({ latitude, longitude })))
  return [...WORLDWIDE_MODELS, ...regionalModels]
}
