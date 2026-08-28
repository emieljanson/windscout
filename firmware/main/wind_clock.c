#include "wind_clock.h"

#include <stdbool.h>

#define WIND_CLOCK_MIN_UNIX_SECONDS INT64_C(1735689600)
#define WIND_CLOCK_MAX_UNIX_SECONDS INT64_C(4102444800)

bool wind_clock_is_valid_unix(int64_t unix_seconds)
{
    return unix_seconds >= WIND_CLOCK_MIN_UNIX_SECONDS &&
           unix_seconds < WIND_CLOCK_MAX_UNIX_SECONDS;
}

esp_err_t wind_clock_set_unix(int64_t unix_seconds, void *context,
                              wind_clock_write_fn write_rtc,
                              wind_clock_write_fn write_system)
{
    if (!write_rtc || !write_system || !wind_clock_is_valid_unix(unix_seconds)) {
        return ESP_ERR_INVALID_ARG;
    }
    const time_t value = (time_t) unix_seconds;
    if ((int64_t) value != unix_seconds) return ESP_ERR_INVALID_ARG;
    esp_err_t result = write_rtc(context, value);
    if (result != ESP_OK) return result;
    return write_system(context, value);
}

esp_err_t wind_clock_restore_from_rtc(void *context, wind_clock_read_fn read_rtc,
                                      wind_clock_write_fn write_system)
{
    if (!read_rtc || !write_system) return ESP_ERR_INVALID_ARG;
    time_t value = 0;
    esp_err_t result = read_rtc(context, &value);
    if (result != ESP_OK) return result;
    if (!wind_clock_is_valid_unix((int64_t) value)) return ESP_ERR_INVALID_STATE;
    return write_system(context, value);
}
