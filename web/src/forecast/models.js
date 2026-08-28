export const FORECAST_MODELS = Object.freeze([
  Object.freeze({ id: 'best_match', label: 'Best Match', screenLabel: 'BEST MATCH' }),
  Object.freeze({ id: 'knmi_seamless', label: 'KNMI', screenLabel: 'KNMI SEAMLESS' }),
  Object.freeze({ id: 'ecmwf_ifs025', label: 'ECMWF', screenLabel: 'ECMWF IFS' }),
  Object.freeze({ id: 'icon_seamless', label: 'ICON', screenLabel: 'DWD ICON' }),
  Object.freeze({ id: 'gfs_seamless', label: 'GFS', screenLabel: 'NOAA GFS' }),
])

export const FORECAST_MODEL_IDS = Object.freeze(FORECAST_MODELS.map((model) => model.id))
export const DEFAULT_FORECAST_MODEL_ID = 'best_match'

export function getForecastModel(modelId) {
  return FORECAST_MODELS.find((model) => model.id === modelId) ?? null
}
