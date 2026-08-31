#include "wind_renderer_fixture.h"

static const char *const FIXTURE_NAMES[WIND_RENDERER_FIXTURE_COUNT] = {
    "threshold-05",
    "threshold-17",
    "threshold-35",
    "solid-17",
    "rows-000",
    "rows-100",
    "rows-010",
    "rows-001",
    "rows-110",
    "rows-101",
    "rows-011",
    "rows-111",
    "rows-111-missing",
};

static const char *const DAY_NAMES[WIND_RENDERER_DAY_COUNT] = {
    "TODAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
};

static const char *const DAY_DATES[WIND_RENDERER_DAY_COUNT] = {
    "26 AUG", "27 AUG", "28 AUG", "29 AUG", "30 AUG",
};

static const char *const SAMPLE_TIMES[WIND_RENDERER_SAMPLES_PER_DAY] = {
    "08", "11", "14", "17", "20",
};

const char *wind_renderer_fixture_name(size_t fixture_index) {
    return fixture_index < WIND_RENDERER_FIXTURE_COUNT
               ? FIXTURE_NAMES[fixture_index]
               : NULL;
}

int wind_renderer_fixture_build(size_t fixture_index,
                                wind_renderer_input_v2_t *input) {
    if (!input || fixture_index >= WIND_RENDERER_FIXTURE_COUNT) return -1;

    wind_renderer_input_v2_init(input);
    if (wind_renderer_input_v2_set_metadata(
            input, "Brouwersdam", "BEST MATCH", "26 AUG 11AM") != 0) {
        return -2;
    }

    wind_renderer_display_mode_t mode = WIND_RENDERER_MODE_SOLID;
    int threshold_kt = WIND_RENDERER_DEFAULT_THRESHOLD_KT;
    switch (fixture_index) {
        case WIND_RENDERER_FIXTURE_THRESHOLD_MIN:
            mode = WIND_RENDERER_MODE_THRESHOLD;
            threshold_kt = WIND_RENDERER_MIN_THRESHOLD_KT;
            break;
        case WIND_RENDERER_FIXTURE_THRESHOLD_DEFAULT:
            mode = WIND_RENDERER_MODE_THRESHOLD;
            break;
        case WIND_RENDERER_FIXTURE_THRESHOLD_MAX:
            mode = WIND_RENDERER_MODE_THRESHOLD;
            threshold_kt = WIND_RENDERER_MAX_THRESHOLD_KT;
            break;
        case WIND_RENDERER_FIXTURE_SOLID:
            mode = WIND_RENDERER_MODE_SOLID;
            break;
        default:
            break;
    }
    if (wind_renderer_input_v2_set_status(
            input, WIND_RENDERER_FRESH, 0, 1, 74, mode, threshold_kt) != 0) {
        return -3;
    }
    int row_mask = 1;
    int tide_available = 0;
    const int is_row_fixture = fixture_index >= WIND_RENDERER_FIXTURE_ROWS_NONE;
    const int missing_data = fixture_index == WIND_RENDERER_FIXTURE_ROWS_ALL_MISSING;
    if (is_row_fixture) {
        static const int ROW_MASKS[] = {0, 1, 2, 4, 3, 5, 6, 7, 7};
        row_mask = ROW_MASKS[fixture_index - WIND_RENDERER_FIXTURE_ROWS_NONE];
        tide_available = (row_mask & 4) && !missing_data;
    }
    if (wind_renderer_input_v2_set_display_rows(
            input, row_mask & 1, (row_mask >> 1) & 1,
            (row_mask >> 2) & 1, tide_available) != 0) {
        return -6;
    }

    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        if (wind_renderer_input_v2_set_day(
                input, day, DAY_NAMES[day], DAY_DATES[day]) != 0) {
            return -4;
        }
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            const int sustained = 7 + day * 2 + sample * 3;
            if (wind_renderer_input_v2_set_sample(
                    input, day, sample, SAMPLE_TIMES[sample], sustained,
                    sustained + 5, day * 55 + sample * 27, 1,
                    missing_data ? WIND_RENDERER_WEATHER_UNAVAILABLE
                                 : (wind_renderer_weather_t)(
                                       1 + (day * WIND_RENDERER_SAMPLES_PER_DAY + sample) % 8),
                    120 + day * 5 + sample, missing_data ? 0 : 1) != 0) {
                return -5;
            }
        }
    }
    if (tide_available) {
        for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
            for (int hour = 0; hour < 24; ++hour) {
                const int level = hour <= 6 ? hour * 100
                                  : hour <= 18 ? 600 - (hour - 6) * 100
                                               : -600 + (hour - 18) * 100;
                if (wind_renderer_input_v2_set_tide_sample(
                        input, day * 24 + hour, day, hour, level, 1) != 0) {
                    return -7;
                }
            }
        }
    }
    return 0;
}
