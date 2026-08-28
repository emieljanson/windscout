#pragma once

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
#define WIND_FORECAST_CACHE_PATH "/storage/wind-forecast.cache"
#define WIND_TIDE_CACHE_PATH "/storage/wind-tide.cache"
#define WIND_PANEL_CACHE_PATH "/storage/wind-panel.cache"
#define WIND_SCHEDULE_CACHE_PATH "/storage/wind-schedule.cache"
