#include "wind_schedule.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifdef ESP_PLATFORM
#include "wind_config.h"
#endif

static const int BOUNDARY_MINUTES[WIND_SCHEDULE_BOUNDARY_COUNT] = {5, 7 * 60, 11 * 60, 15 * 60,
                                                                  19 * 60};

typedef struct {
    uint32_t magic;
    wind_schedule_state_t state;
    uint32_t checksum;
} schedule_record_t;

static uint32_t checksum_bytes(const void *data, size_t length)
{
    const uint8_t *bytes = (const uint8_t *) data;
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < length; ++i) {
        hash = (hash ^ bytes[i]) * 16777619u;
    }
    return hash;
}

static const char *active_spot_id(void)
{
#ifdef ESP_PLATFORM
    return WIND_SPOT_ID;
#else
    return "host";
#endif
}

static const char *active_timezone(void)
{
#ifdef ESP_PLATFORM
    return WIND_TIMEZONE;
#else
    const char *timezone = getenv("TZ");
    return timezone && timezone[0] ? timezone : "UTC";
#endif
}

static esp_err_t initialize_scope(wind_schedule_state_t *state, const char *spot_id,
                                  const char *timezone)
{
    if (!state || !spot_id || !timezone || spot_id[0] == '\0' || timezone[0] == '\0' ||
        strlen(spot_id) >= sizeof(state->spot_id) || strlen(timezone) >= sizeof(state->timezone)) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(state, 0, sizeof(*state));
    state->schema_version = WIND_SCHEDULE_SCHEMA_VERSION;
    memcpy(state->spot_id, spot_id, strlen(spot_id) + 1);
    memcpy(state->timezone, timezone, strlen(timezone) + 1);
    return ESP_OK;
}

void wind_schedule_state_clear(wind_schedule_state_t *state)
{
    if (state) {
        initialize_scope(state, active_spot_id(), active_timezone());
    }
}

esp_err_t wind_schedule_state_set_scope(wind_schedule_state_t *state, const char *spot_id,
                                        const char *timezone)
{
    return initialize_scope(state, spot_id, timezone);
}

bool wind_schedule_state_matches_scope(const wind_schedule_state_t *state, const char *spot_id,
                                       const char *timezone)
{
    return state && spot_id && timezone &&
           state->schema_version == WIND_SCHEDULE_SCHEMA_VERSION &&
           strcmp(state->spot_id, spot_id) == 0 && strcmp(state->timezone, timezone) == 0;
}

static time_t boundary_for_day(const struct tm *day, int minutes)
{
    struct tm value = *day;
    value.tm_hour = minutes / 60;
    value.tm_min = minutes % 60;
    value.tm_sec = 0;
    value.tm_isdst = -1;
    return mktime(&value);
}

int64_t wind_schedule_latest_boundary(time_t now)
{
    struct tm local;
    localtime_r(&now, &local);
    int64_t latest = 0;
    for (int i = 0; i < WIND_SCHEDULE_BOUNDARY_COUNT; ++i) {
        time_t candidate = boundary_for_day(&local, BOUNDARY_MINUTES[i]);
        if (candidate <= now && candidate > latest) {
            latest = candidate;
        }
    }
    if (latest == 0) {
        local.tm_mday -= 1;
        local.tm_isdst = -1;
        mktime(&local);
        latest = boundary_for_day(&local, BOUNDARY_MINUTES[WIND_SCHEDULE_BOUNDARY_COUNT - 1]);
    }
    return latest;
}

int64_t wind_schedule_next_boundary(time_t now)
{
    struct tm local;
    localtime_r(&now, &local);
    for (int i = 0; i < WIND_SCHEDULE_BOUNDARY_COUNT; ++i) {
        time_t candidate = boundary_for_day(&local, BOUNDARY_MINUTES[i]);
        if (candidate > now) {
            return candidate;
        }
    }
    local.tm_mday += 1;
    local.tm_isdst = -1;
    mktime(&local);
    return boundary_for_day(&local, BOUNDARY_MINUTES[0]);
}

bool wind_schedule_is_due(const wind_schedule_state_t *state, time_t now, int64_t *out_boundary)
{
    if (!state || state->schema_version != WIND_SCHEDULE_SCHEMA_VERSION) {
        return false;
    }
    int64_t boundary = wind_schedule_latest_boundary(now);
    if (out_boundary) {
        *out_boundary = boundary;
    }
    return boundary > state->last_attempted_boundary && boundary > state->last_satisfied_boundary;
}

void wind_schedule_mark_attempted(wind_schedule_state_t *state, int64_t boundary)
{
    if (state && boundary > state->last_attempted_boundary) {
        state->last_attempted_boundary = boundary;
    }
}

void wind_schedule_mark_satisfied(wind_schedule_state_t *state, int64_t boundary)
{
    if (state && boundary > state->last_satisfied_boundary) {
        state->last_satisfied_boundary = boundary;
    }
}

esp_err_t wind_schedule_state_load_scoped(const char *path, const char *spot_id,
                                          const char *timezone,
                                          wind_schedule_state_t *out_state)
{
    if (!path || !spot_id || !timezone || !out_state) {
        return ESP_ERR_INVALID_ARG;
    }
    FILE *file = fopen(path, "rb");
    if (!file) {
        initialize_scope(out_state, spot_id, timezone);
        return ESP_ERR_NOT_FOUND;
    }
    schedule_record_t record;
    bool ok = fread(&record, 1, sizeof(record), file) == sizeof(record) && fgetc(file) == EOF;
    fclose(file);
    uint32_t expected = checksum_bytes(&record.state, sizeof(record.state));
    if (!ok || record.magic != 0x574E4453u || record.checksum != expected ||
        record.state.schema_version != WIND_SCHEDULE_SCHEMA_VERSION) {
        initialize_scope(out_state, spot_id, timezone);
        return ESP_ERR_INVALID_CRC;
    }
    if (!wind_schedule_state_matches_scope(&record.state, spot_id, timezone)) {
        initialize_scope(out_state, spot_id, timezone);
        return ESP_ERR_INVALID_STATE;
    }
    *out_state = record.state;
    return ESP_OK;
}

esp_err_t wind_schedule_state_load(const char *path, wind_schedule_state_t *out_state)
{
    return wind_schedule_state_load_scoped(path, active_spot_id(), active_timezone(), out_state);
}

esp_err_t wind_schedule_state_store(const char *path, const wind_schedule_state_t *state)
{
    if (!path || !state || state->schema_version != WIND_SCHEDULE_SCHEMA_VERSION ||
        state->spot_id[0] == '\0' || state->timezone[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }
    char temporary[256];
    if (snprintf(temporary, sizeof(temporary), "%s.tmp", path) >= (int) sizeof(temporary)) {
        return ESP_ERR_INVALID_SIZE;
    }
    schedule_record_t record = {.magic = 0x574E4453u, .state = *state};
    record.checksum = checksum_bytes(&record.state, sizeof(record.state));
    FILE *file = fopen(temporary, "wb");
    if (!file) {
        return ESP_FAIL;
    }
    bool ok = fwrite(&record, 1, sizeof(record), file) == sizeof(record) && fflush(file) == 0 &&
              fsync(fileno(file)) == 0;
    if (fclose(file) != 0) {
        ok = false;
    }
    if (!ok || rename(temporary, path) != 0) {
        unlink(temporary);
        return ESP_FAIL;
    }
    return ESP_OK;
}
