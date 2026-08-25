#pragma once

/* Development/non-commercial example. Do not use the free endpoint commercially. */
#define WIND_PROVIDER_DEVELOPMENT_MODE 1
#define WIND_PROVIDER_COMMERCIAL_MODE 0
#define WIND_PROVIDER_ENDPOINT_KIND WIND_PROVIDER_ENDPOINT_KIND_FREE
#define WIND_PROVIDER_ENDPOINT "https://api.open-meteo.com/v1/forecast"
#define WIND_PROVIDER_API_KEY ""
#define WIND_SPOT_ID "edam"
#define WIND_SPOT_NAME "Edam"
#define WIND_SPOT_LATITUDE 52.5126
#define WIND_SPOT_LONGITUDE 5.0486
#define WIND_TIMEZONE "Europe/Amsterdam"

/* Commercial builds require a dedicated customer endpoint and non-empty key. */
