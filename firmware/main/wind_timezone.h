#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int16_t year;
    uint8_t month;
    uint8_t day;
    uint8_t hour;
    uint8_t minute;
    uint8_t second;
    int32_t utc_offset_seconds;
} wind_local_datetime_t;

esp_err_t wind_timezone_init(void);
bool wind_timezone_is_supported(const char *iana_timezone);
esp_err_t wind_timezone_from_unix(const char *iana_timezone, int64_t unix_seconds,
                                  wind_local_datetime_t *local);
esp_err_t wind_timezone_to_unix(const char *iana_timezone,
                                const wind_local_datetime_t *local, int64_t *unix_seconds);
esp_err_t wind_timezone_shift_date(wind_local_datetime_t *local, int days);
int wind_timezone_weekday(const wind_local_datetime_t *local);
esp_err_t wind_timezone_format_date(const wind_local_datetime_t *local, char *output,
                                    size_t output_size);

#ifdef __cplusplus
}
#endif
