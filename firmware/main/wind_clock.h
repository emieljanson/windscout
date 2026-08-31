#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef esp_err_t (*wind_clock_read_fn)(void *context, time_t *value);
typedef esp_err_t (*wind_clock_write_fn)(void *context, time_t value);

bool wind_clock_is_valid_unix(int64_t unix_seconds);
esp_err_t wind_clock_set_unix(int64_t unix_seconds, void *context,
                              wind_clock_write_fn write_rtc,
                              wind_clock_write_fn write_system);
esp_err_t wind_clock_restore_from_rtc(void *context, wind_clock_read_fn read_rtc,
                                      wind_clock_write_fn write_system);

#ifdef __cplusplus
}
#endif
