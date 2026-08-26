#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "wind_renderer.h"

#ifdef __cplusplus
extern "C" {
#endif

#define WIND_DISPLAY_CONFIG_VERSION 1u

typedef struct {
    uint32_t version;
    uint8_t display_mode;
    uint8_t threshold_kt;
    bool show_weather;
    bool show_temperature;
    bool show_tide;
} wind_display_config_t;

void wind_display_config_default(wind_display_config_t *config);
bool wind_display_config_validate(const wind_display_config_t *config);
uint64_t wind_display_config_signature(const wind_display_config_t *config);

#ifdef __cplusplus
}
#endif
