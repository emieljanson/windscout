#ifndef WIND_RENDERER_FIXTURE_H
#define WIND_RENDERER_FIXTURE_H

#include <stddef.h>

#include "wind_renderer.h"

#ifdef __cplusplus
extern "C" {
#endif

enum {
    WIND_RENDERER_FIXTURE_THRESHOLD_MIN = 0,
    WIND_RENDERER_FIXTURE_THRESHOLD_DEFAULT,
    WIND_RENDERER_FIXTURE_THRESHOLD_MAX,
    WIND_RENDERER_FIXTURE_SOLID,
    WIND_RENDERER_FIXTURE_ROWS_NONE,
    WIND_RENDERER_FIXTURE_ROWS_WEATHER,
    WIND_RENDERER_FIXTURE_ROWS_TEMPERATURE,
    WIND_RENDERER_FIXTURE_ROWS_TIDE,
    WIND_RENDERER_FIXTURE_ROWS_WEATHER_TEMPERATURE,
    WIND_RENDERER_FIXTURE_ROWS_WEATHER_TIDE,
    WIND_RENDERER_FIXTURE_ROWS_TEMPERATURE_TIDE,
    WIND_RENDERER_FIXTURE_ROWS_ALL,
    WIND_RENDERER_FIXTURE_ROWS_ALL_MISSING,
    WIND_RENDERER_FIXTURE_COUNT,
};

const char *wind_renderer_fixture_name(size_t fixture_index);

int wind_renderer_fixture_build(size_t fixture_index,
                                wind_renderer_input_v2_t *input);

#ifdef __cplusplus
}
#endif

#endif
