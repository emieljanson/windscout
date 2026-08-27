#pragma once

#include <stddef.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    const char *id;
    const char *display_name;
    double latitude;
    double longitude;
    const char *timezone;
} wind_spot_t;

size_t wind_spots_count(void);
const wind_spot_t *wind_spots_at(size_t index);
size_t wind_spots_offset(size_t current, int direction);
esp_err_t wind_spots_load_selected(size_t *out_index);
esp_err_t wind_spots_store_selected(size_t index);
esp_err_t wind_spots_reload_installed(void);

#ifdef __cplusplus
}
#endif
