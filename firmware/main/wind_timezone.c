#include "wind_timezone.h"

#include <stdio.h>
#include <string.h>

#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#else
#include <stdatomic.h>
#endif

#include "acetimec/common.h"
#include "acetimec/plain_date.h"
#include "acetimec/plain_date_time.h"
#include "acetimec/time_zone.h"
#include "acetimec/zone_processor.h"
#include "acetimec/zone_registrar.h"
#include "acetimec/zoned_date_time.h"
#include "zonedb2025/zone_registry.h"

#ifdef ESP_PLATFORM
static SemaphoreHandle_t s_lock;
#else
static atomic_flag s_lock = ATOMIC_FLAG_INIT;
#endif
static bool s_initialized;
static AtcZoneRegistrar s_registrar;
static AtcZoneProcessor s_processor;

typedef struct {
    const char *name;
    int64_t utc_cutoff;
    int16_t local_year;
    uint8_t local_month;
    uint8_t local_day;
    uint8_t local_hour;
    int32_t offset_seconds;
} timezone_overlay_t;

// AceTimeC 0.15.0 contains TZDB 2025b. These forward-only overlays apply the
// civil-time changes in IANA 2026b/2026c until upstream publishes fresh C data.
static const timezone_overlay_t TIMEZONE_OVERLAYS[] = {
    {"America/Edmonton", 1793520000, 2026, 6, 18, 0, -6 * 3600},
    {"Canada/Mountain", 1793520000, 2026, 6, 18, 0, -6 * 3600},
    {"America/Yellowknife", 1793520000, 2026, 6, 18, 0, -6 * 3600},
    {"America/Vancouver", 1793523600, 2026, 3, 9, 0, -7 * 3600},
    {"Canada/Pacific", 1793523600, 2026, 3, 9, 0, -7 * 3600},
    {"Africa/Casablanca", 1789866000, 2026, 9, 20, 2, 0},
    {"Africa/El_Aaiun", 1789866000, 2026, 9, 20, 2, 0},
};
static const timezone_overlay_t *find_overlay(const char *name)
{
    for (size_t i = 0; i < sizeof(TIMEZONE_OVERLAYS) / sizeof(TIMEZONE_OVERLAYS[0]); ++i) {
        if (strcmp(TIMEZONE_OVERLAYS[i].name, name) == 0) return &TIMEZONE_OVERLAYS[i];
    }
    return NULL;
}

static bool local_at_or_after_overlay(const wind_local_datetime_t *local,
                                      const timezone_overlay_t *overlay)
{
    if (local->year != overlay->local_year) return local->year > overlay->local_year;
    if (local->month != overlay->local_month) return local->month > overlay->local_month;
    if (local->day != overlay->local_day) return local->day > overlay->local_day;
    return local->hour >= overlay->local_hour;
}

static void local_from_fixed_offset(int64_t unix_seconds, int32_t offset_seconds,
                                    wind_local_datetime_t *local)
{
    AtcPlainDateTime plain;
    atc_plain_date_time_from_unix_seconds(&plain, unix_seconds + offset_seconds);
    *local = (wind_local_datetime_t) {
        .year = plain.year,
        .month = plain.month,
        .day = plain.day,
        .hour = plain.hour,
        .minute = plain.minute,
        .second = plain.second,
        .utc_offset_seconds = offset_seconds,
    };
}

static bool lock(void)
{
#ifdef ESP_PLATFORM
    return s_lock && xSemaphoreTake(s_lock, portMAX_DELAY) == pdTRUE;
#else
    while (atomic_flag_test_and_set_explicit(&s_lock, memory_order_acquire)) {
    }
    return true;
#endif
}

static void unlock(void)
{
#ifdef ESP_PLATFORM
    xSemaphoreGive(s_lock);
#else
    atomic_flag_clear_explicit(&s_lock, memory_order_release);
#endif
}

static void initialize(void)
{
    if (s_initialized) return;
    atc_registrar_init(&s_registrar, kAtcZonedb2025ZoneAndLinkRegistry,
                       kAtcZonedb2025ZoneAndLinkRegistrySize);
    atc_processor_init(&s_processor);
    s_initialized = true;
}

esp_err_t wind_timezone_init(void)
{
#ifdef ESP_PLATFORM
    // Boot calls this before worker tasks start, so every later caller shares
    // one mutex instead of racing during lazy initialization.
    if (!s_lock) {
        s_lock = xSemaphoreCreateMutex();
        if (!s_lock) return ESP_ERR_NO_MEM;
    }
#endif
    if (!lock()) return ESP_ERR_INVALID_STATE;
    initialize();
    unlock();
    return ESP_OK;
}

static esp_err_t resolve_timezone(const char *iana_timezone, AtcTimeZone *timezone,
                                  const timezone_overlay_t **overlay)
{
    if (!iana_timezone || !timezone || !overlay || iana_timezone[0] == '\0' ||
        strlen(iana_timezone) >= 64) {
        return ESP_ERR_INVALID_ARG;
    }
    initialize();
    const AtcZoneInfo *zone = atc_registrar_find_by_name(&s_registrar, iana_timezone);
    if (!zone) return ESP_ERR_NOT_FOUND;
    atc_processor_init(&s_processor);
    *timezone = (AtcTimeZone) {.zone_info = zone, .zone_processor = &s_processor};
    *overlay = find_overlay(iana_timezone);
    return ESP_OK;
}

bool wind_timezone_is_supported(const char *iana_timezone)
{
#ifndef ESP_PLATFORM
    if (wind_timezone_init() != ESP_OK) return false;
#endif
    if (!lock()) return false;
    AtcTimeZone timezone;
    const timezone_overlay_t *overlay;
    const bool supported = resolve_timezone(iana_timezone, &timezone, &overlay) == ESP_OK;
    unlock();
    return supported;
}

esp_err_t wind_timezone_from_unix(const char *iana_timezone, int64_t unix_seconds,
                                  wind_local_datetime_t *local)
{
    if (!iana_timezone || !local) return ESP_ERR_INVALID_ARG;
#ifndef ESP_PLATFORM
    if (wind_timezone_init() != ESP_OK) return ESP_FAIL;
#endif
    if (!lock()) return ESP_ERR_INVALID_STATE;
    AtcTimeZone timezone;
    const timezone_overlay_t *overlay;
    esp_err_t result = resolve_timezone(iana_timezone, &timezone, &overlay);
    if (result != ESP_OK) {
        unlock();
        return result;
    }
    if (overlay && unix_seconds >= overlay->utc_cutoff) {
        local_from_fixed_offset(unix_seconds, overlay->offset_seconds, local);
        unlock();
        return ESP_OK;
    }
    AtcZonedDateTime value;
    atc_zoned_date_time_from_unix_seconds(&value, unix_seconds, &timezone);
    if (atc_zoned_date_time_is_error(&value)) {
        unlock();
        return ESP_ERR_INVALID_ARG;
    }
    *local = (wind_local_datetime_t) {
        .year = value.year,
        .month = value.month,
        .day = value.day,
        .hour = value.hour,
        .minute = value.minute,
        .second = value.second,
        .utc_offset_seconds = value.offset_seconds,
    };
    unlock();
    return ESP_OK;
}

esp_err_t wind_timezone_to_unix(const char *iana_timezone,
                                const wind_local_datetime_t *local, int64_t *unix_seconds)
{
    if (!iana_timezone || !local || !unix_seconds) return ESP_ERR_INVALID_ARG;
#ifndef ESP_PLATFORM
    if (wind_timezone_init() != ESP_OK) return ESP_FAIL;
#endif
    if (!lock()) return ESP_ERR_INVALID_STATE;
    AtcTimeZone timezone;
    const timezone_overlay_t *overlay;
    esp_err_t status = resolve_timezone(iana_timezone, &timezone, &overlay);
    if (status != ESP_OK) {
        unlock();
        return status;
    }
    const AtcPlainDateTime plain = {
        local->year, local->month, local->day, local->hour, local->minute, local->second,
    };
    if (overlay && local_at_or_after_overlay(local, overlay)) {
        const int64_t result = atc_plain_date_time_to_unix_seconds(&plain);
        if (result == kAtcInvalidUnixSeconds) {
            unlock();
            return ESP_ERR_INVALID_ARG;
        }
        *unix_seconds = result - overlay->offset_seconds;
        unlock();
        return ESP_OK;
    }
    AtcZonedDateTime value;
    atc_zoned_date_time_from_plain_date_time(&value, &plain, &timezone,
                                             kAtcDisambiguateCompatible);
    const int64_t result = atc_zoned_date_time_to_unix_seconds(&value);
    if (atc_zoned_date_time_is_error(&value) || result == kAtcInvalidUnixSeconds) {
        unlock();
        return ESP_ERR_INVALID_ARG;
    }
    *unix_seconds = result;
    unlock();
    return ESP_OK;
}

esp_err_t wind_timezone_shift_date(wind_local_datetime_t *local, int days)
{
    if (!local || days < -3660 || days > 3660) return ESP_ERR_INVALID_ARG;
    int32_t unix_days = atc_plain_date_to_unix_days(local->year, local->month, local->day);
    if (unix_days == kAtcInvalidUnixDays) return ESP_ERR_INVALID_ARG;
    unix_days += days;
    atc_plain_date_from_unix_days(unix_days, &local->year, &local->month, &local->day);
    return ESP_OK;
}

int wind_timezone_weekday(const wind_local_datetime_t *local)
{
    if (!local || !atc_plain_date_is_valid(local->year, local->month, local->day)) return -1;
    return atc_plain_date_day_of_week(local->year, local->month, local->day) % 7;
}

esp_err_t wind_timezone_format_date(const wind_local_datetime_t *local, char *output,
                                    size_t output_size)
{
    if (!local || !output || output_size < 11) return ESP_ERR_INVALID_ARG;
    const int written = snprintf(output, output_size, "%04d-%02u-%02u", local->year,
                                 local->month, local->day);
    return written == 10 ? ESP_OK : ESP_ERR_INVALID_SIZE;
}
