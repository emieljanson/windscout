#include "wind_forecast.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

static const uint8_t REQUIRED_HOURS[WIND_FORECAST_SAMPLES_PER_DAY] = {8, 11, 14, 17, 20};

static int64_t days_from_civil(int year, unsigned month, unsigned day)
{
    year -= month <= 2;
    const int era = (year >= 0 ? year : year - 399) / 400;
    const unsigned yoe = (unsigned) (year - era * 400);
    const unsigned doy = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return (int64_t) era * 146097 + (int64_t) doe;
}

static bool parse_date(const char *date, int64_t *out_days)
{
    int y = 0;
    unsigned m = 0, d = 0;
    char tail = 0;
    if (!date || sscanf(date, "%4d-%2u-%2u%c", &y, &m, &d, &tail) != 3 || m < 1 || m > 12 ||
        d < 1 || d > 31) {
        return false;
    }
    *out_days = days_from_civil(y, m, d);
    return true;
}

void wind_forecast_clear(wind_forecast_t *forecast)
{
    if (forecast) {
        memset(forecast, 0, sizeof(*forecast));
        forecast->schema_version = WIND_FORECAST_SCHEMA_VERSION;
    }
}

bool wind_forecast_validate(const wind_forecast_t *forecast)
{
    if (!forecast || forecast->schema_version != WIND_FORECAST_SCHEMA_VERSION ||
        forecast->spot_id[0] == '\0' || forecast->timezone[0] == '\0' ||
        forecast->provider[0] == '\0' || forecast->model[0] == '\0' ||
        !isfinite(forecast->latitude) || !isfinite(forecast->longitude) ||
        forecast->latitude < -90.0 || forecast->latitude > 90.0 || forecast->longitude < -180.0 ||
        forecast->longitude > 180.0 || forecast->retrieved_at <= 0) {
        return false;
    }

    int64_t previous_day = 0;
    int64_t previous_timestamp = 0;
    for (size_t d = 0; d < WIND_FORECAST_DAY_COUNT; ++d) {
        int64_t day_number = 0;
        if (!parse_date(forecast->days[d].local_date, &day_number) ||
            (d > 0 && day_number != previous_day + 1)) {
            return false;
        }
        previous_day = day_number;
        for (size_t s = 0; s < WIND_FORECAST_SAMPLES_PER_DAY; ++s) {
            const wind_forecast_sample_t *sample = &forecast->days[d].samples[s];
            if (sample->local_hour != REQUIRED_HOURS[s] || sample->timestamp <= previous_timestamp ||
                sample->wind_knots < 0 || sample->gust_knots < 0 ||
                sample->destination_degrees >= 360 || sample->weather_available > 1 ||
                sample->temperature_available > 1 ||
                (sample->weather_available &&
                 (sample->cloud_cover_percent > 100 || sample->is_day > 1))) {
                return false;
            }
            previous_timestamp = sample->timestamp;
        }
    }
    return true;
}

int wind_forecast_round_knots(double knots)
{
    if (!isfinite(knots) || knots < 0.0 || knots > 32767.0) {
        return -1;
    }
    return (int) lround(knots);
}

uint16_t wind_forecast_destination_degrees(double source_degrees)
{
    if (!isfinite(source_degrees)) {
        return UINT16_MAX;
    }
    double normalized = fmod(source_degrees + 180.0, 360.0);
    if (normalized < 0.0) {
        normalized += 360.0;
    }
    unsigned rounded = (unsigned) lround(normalized) % 360u;
    return (uint16_t) rounded;
}

bool wind_forecast_is_overflow(int knots)
{
    return knots > 40;
}

wind_weather_state_t wind_forecast_weather_state(const wind_forecast_sample_t *sample)
{
    if (!sample || !sample->weather_available) return WIND_WEATHER_UNAVAILABLE;
    if (sample->precipitation_hundredths_mm >= 250) return WIND_WEATHER_HEAVY_RAIN;
    if (sample->precipitation_hundredths_mm >= 100) return WIND_WEATHER_RAIN;
    if (sample->precipitation_hundredths_mm >= 10) return WIND_WEATHER_LIGHT_RAIN;
    if (sample->cloud_cover_percent <= 20)
        return sample->is_day ? WIND_WEATHER_CLEAR_DAY : WIND_WEATHER_CLEAR_NIGHT;
    if (sample->cloud_cover_percent <= 60)
        return sample->is_day ? WIND_WEATHER_PARTLY_CLOUDY_DAY
                              : WIND_WEATHER_PARTLY_CLOUDY_NIGHT;
    return WIND_WEATHER_CLOUDY;
}

const wind_forecast_sample_t *wind_forecast_sample(const wind_forecast_t *forecast, size_t day,
                                                   size_t sample)
{
    if (!forecast || day >= WIND_FORECAST_DAY_COUNT || sample >= WIND_FORECAST_SAMPLES_PER_DAY) {
        return NULL;
    }
    return &forecast->days[day].samples[sample];
}
