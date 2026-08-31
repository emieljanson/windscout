#pragma once

#include <stdint.h>

#include "esp_err.h"
#include "wind_forecast.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef esp_err_t (*wind_provider_fetch_fn)(void *context, int64_t retrieved_at,
                                            wind_forecast_t *out_forecast);

typedef struct {
    wind_provider_fetch_fn fetch;
    void *context;
} wind_provider_t;

static inline esp_err_t wind_provider_fetch(const wind_provider_t *provider, int64_t retrieved_at,
                                            wind_forecast_t *out_forecast)
{
    return provider && provider->fetch && out_forecast
               ? provider->fetch(provider->context, retrieved_at, out_forecast)
               : ESP_ERR_INVALID_ARG;
}

#ifdef __cplusplus
}
#endif
