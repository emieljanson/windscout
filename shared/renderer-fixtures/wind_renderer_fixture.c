#include "wind_renderer_fixture.h"

static const char *const FIXTURE_NAMES[WIND_RENDERER_FIXTURE_COUNT] = {
    "background-fade-17",
    "threshold-05",
    "threshold-17",
    "threshold-35",
    "solid-17",
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
            input, "Brouwersdam", "51.7506N 3.8577E", "KNMI SEAMLESS",
            "26 AUG 11AM") != 0) {
        return -2;
    }

    wind_renderer_display_mode_t mode = WIND_RENDERER_MODE_BACKGROUND_FADE;
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
    if (wind_renderer_input_v2_set_display_rows(input, 1, 0, 0, 0) != 0) {
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
                    (wind_renderer_weather_t)(
                        1 + (day * WIND_RENDERER_SAMPLES_PER_DAY + sample) % 8),
                    120 + day * 5 + sample, 1) != 0) {
                return -5;
            }
        }
    }
    return 0;
}
