#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include <emscripten/emscripten.h>

#include "wind_renderer.h"

enum {
    METADATA_SPOT_NAME = 0,
    METADATA_COORDINATES,
    METADATA_PROVIDER,
    METADATA_UPDATED_TIME,
    DAY_LABEL_DAY = 0,
    DAY_LABEL_DATE,
};

static wind_renderer_input_v2_t renderer_input;
static uint8_t renderer_output[WIND_RENDERER_PALETTE_BYTES];
static uint8_t renderer_preview_output[WIND_RENDERER_RGBA_BYTES];
static char string_scratch[WIND_RENDERER_SPOT_NAME_CAPACITY];
static int input_ready;
static int input_error;
static int output_valid;
static int preview_output_valid;

static int copy_text(char *destination, size_t capacity) {
    if (!destination || capacity == 0 ||
        memchr(string_scratch, '\0', sizeof(string_scratch)) == NULL) {
        return -1;
    }
    const size_t length = strlen(string_scratch);
    if (length >= capacity) return -1;
    memcpy(destination, string_scratch, length + 1);
    return 0;
}

static int accept_result(int result) {
    if (!input_ready || input_error) return -1;
    if (result != 0) {
        input_error = 1;
        output_valid = 0;
        preview_output_valid = 0;
        return result;
    }
    output_valid = 0;
    preview_output_valid = 0;
    return 0;
}

EMSCRIPTEN_KEEPALIVE uint32_t wind_wasm_contract_version(void) {
    return wind_renderer_contract_version();
}

EMSCRIPTEN_KEEPALIVE uint32_t wind_wasm_width(void) {
    return WIND_RENDERER_WIDTH;
}

EMSCRIPTEN_KEEPALIVE uint32_t wind_wasm_height(void) {
    return WIND_RENDERER_HEIGHT;
}

EMSCRIPTEN_KEEPALIVE uint32_t wind_wasm_palette_bytes(void) {
    return WIND_RENDERER_PALETTE_BYTES;
}

EMSCRIPTEN_KEEPALIVE uintptr_t wind_wasm_scratch_ptr(void) {
    return (uintptr_t)string_scratch;
}

EMSCRIPTEN_KEEPALIVE uint32_t wind_wasm_scratch_capacity(void) {
    return sizeof(string_scratch);
}

EMSCRIPTEN_KEEPALIVE uintptr_t wind_wasm_output_ptr(void) {
    return output_valid ? (uintptr_t)renderer_output : 0;
}

EMSCRIPTEN_KEEPALIVE uintptr_t wind_wasm_preview_output_ptr(void) {
    return preview_output_valid ? (uintptr_t)renderer_preview_output : 0;
}

EMSCRIPTEN_KEEPALIVE uint32_t wind_wasm_preview_bytes(void) {
    return WIND_RENDERER_RGBA_BYTES;
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_reset(uint32_t contract_version) {
    memset(string_scratch, 0, sizeof(string_scratch));
    input_ready = 0;
    input_error = 0;
    output_valid = 0;
    preview_output_valid = 0;
    if (contract_version != WIND_RENDERER_CONTRACT_VERSION) return -1;
    wind_renderer_input_v2_init(&renderer_input);
    input_ready = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_metadata_field(int field) {
    if (!input_ready || input_error) return -1;
    int result = -1;
    switch (field) {
        case METADATA_SPOT_NAME:
            result = copy_text(renderer_input.spot_name,
                               sizeof(renderer_input.spot_name));
            break;
        case METADATA_COORDINATES:
            result = copy_text(renderer_input.coordinates,
                               sizeof(renderer_input.coordinates));
            break;
        case METADATA_PROVIDER:
            result = copy_text(renderer_input.provider,
                               sizeof(renderer_input.provider));
            break;
        case METADATA_UPDATED_TIME:
            result = copy_text(renderer_input.updated_time,
                               sizeof(renderer_input.updated_time));
            break;
        default:
            break;
    }
    return accept_result(result);
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_status(
    int state, int refresh_failed, int age_hours, int battery_percent,
    int display_mode, int threshold_kt) {
    if (!input_ready || input_error) return -1;
    return accept_result(wind_renderer_input_v2_set_status(
        &renderer_input, (wind_renderer_state_t)state, refresh_failed,
        age_hours, battery_percent,
        (wind_renderer_display_mode_t)display_mode, threshold_kt));
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_display_rows(
    int show_weather, int show_temperature, int show_tide, int tide_available) {
    if (!input_ready || input_error) return -1;
    return accept_result(wind_renderer_input_v2_set_display_rows(
        &renderer_input, show_weather, show_temperature, show_tide,
        tide_available));
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_preferences(
    int use_24_hour, int temperature_fahrenheit) {
    if (!input_ready || input_error) return -1;
    return accept_result(wind_renderer_input_v2_set_preferences(
        &renderer_input, use_24_hour, temperature_fahrenheit));
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_day_field(int day_index, int field) {
    if (!input_ready || input_error || day_index < 0 ||
        day_index >= WIND_RENDERER_DAY_COUNT) {
        input_error = 1;
        return -1;
    }
    int result = -1;
    if (field == DAY_LABEL_DAY) {
        result = copy_text(renderer_input.days[day_index].day,
                           sizeof(renderer_input.days[day_index].day));
    } else if (field == DAY_LABEL_DATE) {
        result = copy_text(renderer_input.days[day_index].date,
                           sizeof(renderer_input.days[day_index].date));
    }
    return accept_result(result);
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_sample_label(int day_index,
                                                    int sample_index) {
    if (!input_ready || input_error || day_index < 0 ||
        day_index >= WIND_RENDERER_DAY_COUNT || sample_index < 0 ||
        sample_index >= WIND_RENDERER_SAMPLES_PER_DAY) {
        input_error = 1;
        return -1;
    }
    return accept_result(copy_text(
        renderer_input.days[day_index].samples[sample_index].time,
        sizeof(renderer_input.days[day_index].samples[sample_index].time)));
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_sample_values(
    int day_index, int sample_index, int sustained_kt, int gust_kt,
    int destination_degrees, int available, int weather,
    int temperature_tenths_c, int temperature_available) {
    if (!input_ready || input_error) return -1;
    const char *time = NULL;
    if (day_index >= 0 && day_index < WIND_RENDERER_DAY_COUNT &&
        sample_index >= 0 && sample_index < WIND_RENDERER_SAMPLES_PER_DAY) {
        time = renderer_input.days[day_index].samples[sample_index].time;
    }
    return accept_result(wind_renderer_input_v2_set_sample(
        &renderer_input, day_index, sample_index, time, sustained_kt, gust_kt,
        destination_degrees, available, (wind_renderer_weather_t)weather,
        temperature_tenths_c, temperature_available));
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_set_tide_sample(
    int tide_index, int day_index, int local_hour, int sea_level_mm,
    int available) {
    if (!input_ready || input_error) return -1;
    return accept_result(wind_renderer_input_v2_set_tide_sample(
        &renderer_input, tide_index, day_index, local_hour, sea_level_mm,
        available));
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_render(void) {
    output_valid = 0;
    if (!input_ready || input_error) return -1;
    wind_renderer_stats_t stats;
    const int result = wind_renderer_input_v2_render(
        &renderer_input, renderer_output, sizeof(renderer_output), &stats);
    if (result != 0 || stats.dither_passes != 1 ||
        stats.clipped_primitives != 0) {
        memset(renderer_output, 0, sizeof(renderer_output));
        return result != 0 ? result : -2;
    }
    output_valid = 1;
    return 0;
}

EMSCRIPTEN_KEEPALIVE int wind_wasm_render_preview(void) {
    preview_output_valid = 0;
    if (!input_ready || input_error) return -1;
    wind_renderer_stats_t stats;
    const int result = wind_renderer_input_v2_render_preview_rgba(
        &renderer_input, renderer_preview_output,
        sizeof(renderer_preview_output), &stats);
    if (result != 0 || stats.dither_passes != 0 ||
        stats.clipped_primitives != 0) {
        memset(renderer_preview_output, 0, sizeof(renderer_preview_output));
        return result != 0 ? result : -2;
    }
    preview_output_valid = 1;
    return 0;
}
