#include "wind_tide.h"

#include <stdio.h>
#include <string.h>

static bool valid_date(const char *date)
{
    int year = 0, month = 0, day = 0;
    char tail = 0;
    return date && sscanf(date, "%4d-%2d-%2d%c", &year, &month, &day, &tail) == 3 &&
           year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

void wind_tide_clear(wind_tide_t *tide)
{
    if (tide) {
        memset(tide, 0, sizeof(*tide));
        tide->schema_version = WIND_TIDE_SCHEMA_VERSION;
    }
}

bool wind_tide_validate(const wind_tide_t *tide)
{
    if (!tide || tide->schema_version != WIND_TIDE_SCHEMA_VERSION || tide->spot_id[0] == '\0' ||
        tide->timezone[0] == '\0' || tide->provider[0] == '\0' || tide->retrieved_at <= 0 ||
        tide->capability > WIND_TIDE_AVAILABLE) {
        return false;
    }
    if (tide->capability == WIND_TIDE_UNSUPPORTED) {
        return tide->sample_count == 0 && tide->extremum_count == 0;
    }
    if (tide->sample_count < WIND_TIDE_MIN_SAMPLES || tide->sample_count > WIND_TIDE_MAX_SAMPLES) {
        return false;
    }
    int distinct_days = 0;
    char previous_date[WIND_FORECAST_DATE_LENGTH] = {0};
    int64_t previous_timestamp = 0;
    for (size_t index = 0; index < tide->sample_count; ++index) {
        const wind_tide_sample_t *sample = &tide->samples[index];
        if (!valid_date(sample->local_date) || sample->local_hour > 23 || sample->timestamp <= 0 ||
            (index > 0 && sample->timestamp - previous_timestamp != 3600)) {
            return false;
        }
        if (strcmp(previous_date, sample->local_date) != 0) {
            ++distinct_days;
            memcpy(previous_date, sample->local_date, sizeof(previous_date));
        }
        previous_timestamp = sample->timestamp;
    }
    if (distinct_days != 5 || tide->extremum_count == 0 ||
        tide->extremum_count > WIND_TIDE_MAX_EXTREMA) return false;
    previous_timestamp = 0;
    for (size_t index = 0; index < tide->extremum_count; ++index) {
        const wind_tide_extremum_t *extremum = &tide->extrema[index];
        bool date_matches_series = false;
        for (size_t sample_index = 0; sample_index < tide->sample_count; ++sample_index) {
            if (strcmp(extremum->local_date, tide->samples[sample_index].local_date) == 0) {
                date_matches_series = true;
                break;
            }
        }
        if (!valid_date(extremum->local_date) || extremum->local_hour > 23 ||
            extremum->local_minute > 59 || extremum->local_minute % 15 != 0 ||
            extremum->is_high > 1 || extremum->timestamp <= previous_timestamp ||
            !date_matches_series) return false;
        previous_timestamp = extremum->timestamp;
    }
    return true;
}
