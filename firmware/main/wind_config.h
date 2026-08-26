#pragma once

#define WIND_PROVIDER_ENDPOINT_KIND_UNSPECIFIED 0
#define WIND_PROVIDER_ENDPOINT_KIND_FREE 1
#define WIND_PROVIDER_ENDPOINT_KIND_LICENSED 2

#if __has_include("wind_config.local.h")
#include "wind_config.local.h"
#endif

#ifndef WIND_SPOT_ID
#define WIND_SPOT_ID "edam"
#endif
#ifndef WIND_SPOT_NAME
#define WIND_SPOT_NAME "Edam"
#endif
#ifndef WIND_SPOT_LATITUDE
#define WIND_SPOT_LATITUDE 52.5126
#endif
#ifndef WIND_SPOT_LONGITUDE
#define WIND_SPOT_LONGITUDE 5.0486
#endif
#ifndef WIND_TIMEZONE
#define WIND_TIMEZONE "Europe/Amsterdam"
#endif
#ifndef WIND_MODEL
#define WIND_MODEL "knmi_seamless"
#endif
#ifndef WIND_PROVIDER_ENDPOINT
#define WIND_PROVIDER_ENDPOINT ""
#endif
#ifndef WIND_PROVIDER_API_KEY
#define WIND_PROVIDER_API_KEY ""
#endif
#ifndef WIND_PROVIDER_DEVELOPMENT_MODE
#define WIND_PROVIDER_DEVELOPMENT_MODE 0
#endif
#ifndef WIND_PROVIDER_COMMERCIAL_MODE
#define WIND_PROVIDER_COMMERCIAL_MODE 0
#endif
#ifndef WIND_PROVIDER_ENDPOINT_KIND
#define WIND_PROVIDER_ENDPOINT_KIND WIND_PROVIDER_ENDPOINT_KIND_UNSPECIFIED
#endif

#include "wind_config_validate.h"

#define WIND_FORECAST_CACHE_PATH "/storage/wind-forecast.cache"
#define WIND_TIDE_CACHE_PATH "/storage/wind-tide.cache"
#define WIND_PANEL_CACHE_PATH "/storage/wind-panel.cache"
#define WIND_SCHEDULE_CACHE_PATH "/storage/wind-schedule.cache"
