#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "wind_provider.h"

#ifdef __cplusplus
extern "C" {
#endif

#define OPEN_METEO_FREE_ENDPOINT "https://api.open-meteo.com/v1/forecast"
#define OPEN_METEO_RESPONSE_LIMIT (16u * 1024u)

typedef struct {
    int perform_result;
    int http_status;
    int parse_result;
    size_t response_length;
    bool too_large;
    bool allocation_failed;
} open_meteo_knmi_diagnostics_t;

void open_meteo_knmi_get_diagnostics(open_meteo_knmi_diagnostics_t *out_diagnostics);
#define OPEN_METEO_REQUEST_TIMEOUT_MS 15000

typedef struct {
    const char *endpoint;
    const char *api_key;
    bool development_mode;
    bool commercial_mode;
    const char *spot_id;
    const char *spot_name;
    double latitude;
    double longitude;
    const char *timezone;
    const char *model;
} open_meteo_knmi_config_t;

bool open_meteo_knmi_config_valid(const open_meteo_knmi_config_t *config);
esp_err_t open_meteo_knmi_parse_json(const open_meteo_knmi_config_t *config, const char *json,
                                     size_t length, int64_t retrieved_at, const char *first_date,
                                     wind_forecast_t *out_forecast);
void open_meteo_knmi_provider_init(wind_provider_t *provider, open_meteo_knmi_config_t *config);

#ifdef __cplusplus
}
#endif
