#include "wind_spots.h"

#include <string.h>

static const wind_spot_t SPOTS[] = {
    {.id = "edam",
     .display_name = "EDAM",
     .latitude = 52.5126,
     .longitude = 5.0486,
     .timezone = "Europe/Amsterdam"},
    {.id = "brouwersdam",
     .display_name = "BROUWERSDAM",
     .latitude = 51.7506,
     .longitude = 3.8577,
     .timezone = "Europe/Amsterdam"},
    {.id = "castricum-aan-zee",
     .display_name = "CASTRICUM AAN ZEE",
     .latitude = 52.5550,
     .longitude = 4.6090,
     .timezone = "Europe/Amsterdam"},
};

size_t wind_spots_count(void)
{
    return sizeof(SPOTS) / sizeof(SPOTS[0]);
}

const wind_spot_t *wind_spots_at(size_t index)
{
    return index < wind_spots_count() ? &SPOTS[index] : NULL;
}

size_t wind_spots_offset(size_t current, int direction)
{
    const size_t count = wind_spots_count();
    if (count == 0) {
        return 0;
    }
    current %= count;
    return direction < 0 ? (current + count - 1) % count : (current + 1) % count;
}

#ifdef ESP_PLATFORM
#include "nvs.h"

#define WIND_SPOTS_NVS_NAMESPACE "wind"
#define WIND_SPOTS_NVS_KEY "spot"

esp_err_t wind_spots_load_selected(size_t *out_index)
{
    if (!out_index) {
        return ESP_ERR_INVALID_ARG;
    }
    *out_index = 0;
    nvs_handle_t handle;
    esp_err_t result = nvs_open(WIND_SPOTS_NVS_NAMESPACE, NVS_READONLY, &handle);
    if (result != ESP_OK) {
        return result;
    }
    char id[32] = {0};
    size_t length = sizeof(id);
    result = nvs_get_str(handle, WIND_SPOTS_NVS_KEY, id, &length);
    nvs_close(handle);
    if (result != ESP_OK) {
        return result;
    }
    for (size_t index = 0; index < wind_spots_count(); ++index) {
        if (strcmp(SPOTS[index].id, id) == 0) {
            *out_index = index;
            return ESP_OK;
        }
    }
    return ESP_ERR_NOT_FOUND;
}

esp_err_t wind_spots_store_selected(size_t index)
{
    const wind_spot_t *spot = wind_spots_at(index);
    if (!spot) {
        return ESP_ERR_INVALID_ARG;
    }
    nvs_handle_t handle;
    esp_err_t result = nvs_open(WIND_SPOTS_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (result != ESP_OK) {
        return result;
    }
    result = nvs_set_str(handle, WIND_SPOTS_NVS_KEY, spot->id);
    if (result == ESP_OK) {
        result = nvs_commit(handle);
    }
    nvs_close(handle);
    return result;
}
#else
static size_t s_host_selected;

esp_err_t wind_spots_load_selected(size_t *out_index)
{
    if (!out_index) {
        return ESP_ERR_INVALID_ARG;
    }
    *out_index = s_host_selected;
    return ESP_OK;
}

esp_err_t wind_spots_store_selected(size_t index)
{
    if (!wind_spots_at(index)) {
        return ESP_ERR_INVALID_ARG;
    }
    s_host_selected = index;
    return ESP_OK;
}
#endif
