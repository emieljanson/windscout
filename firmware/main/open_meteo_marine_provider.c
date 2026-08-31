#include "open_meteo_marine_provider.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"
#include "wind_timezone.h"

#ifdef ESP_PLATFORM
#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#endif

static bool copy_text(char *destination, size_t size, const char *source)
{
    if (!destination || !source || strlen(source) >= size) return false;
    memcpy(destination, source, strlen(source) + 1);
    return true;
}

bool open_meteo_marine_config_valid(const open_meteo_marine_config_t *config)
{
    return config && config->spot_id && config->spot_id[0] != '\0' && config->timezone &&
           config->timezone[0] != '\0' && isfinite(config->latitude) &&
           config->latitude >= -90.0 && config->latitude <= 90.0 &&
           isfinite(config->longitude) && config->longitude >= -180.0 &&
           config->longitude <= 180.0;
}

static cJSON *array(cJSON *object, const char *name)
{
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsArray(value) ? value : NULL;
}

static bool valid_numeric_series(cJSON *times, cJSON *levels, int count, int64_t step)
{
    if (!times || !levels || count < 3 || cJSON_GetArraySize(levels) != count) return false;
    int64_t previous = 0;
    cJSON *time_value = times->child;
    cJSON *level_value = levels->child;
    for (int index = 0; index < count; ++index, time_value = time_value->next,
             level_value = level_value->next) {
        if (!cJSON_IsNumber(time_value) || !cJSON_IsNumber(level_value) ||
            !isfinite(time_value->valuedouble) || !isfinite(level_value->valuedouble)) return false;
        const int64_t timestamp = (int64_t) time_value->valuedouble;
        if ((double) timestamp != time_value->valuedouble || timestamp <= 0 ||
            (index > 0 && timestamp - previous != step) ||
            level_value->valuedouble < -2147483.648 ||
            level_value->valuedouble > 2147483.647) return false;
        previous = timestamp;
    }
    return true;
}

static bool quarter_series(cJSON *root, cJSON **out_times, cJSON **out_levels, int *out_count)
{
    cJSON *units = cJSON_GetObjectItemCaseSensitive(root, "minutely_15_units");
    cJSON *series = cJSON_GetObjectItemCaseSensitive(root, "minutely_15");
    cJSON *time_unit = cJSON_IsObject(units)
        ? cJSON_GetObjectItemCaseSensitive(units, "time") : NULL;
    cJSON *level_unit = cJSON_IsObject(units)
        ? cJSON_GetObjectItemCaseSensitive(units, "sea_level_height_msl") : NULL;
    if (!cJSON_IsObject(series) || !cJSON_IsString(time_unit) ||
        strcmp(time_unit->valuestring, "unixtime") != 0 || !cJSON_IsString(level_unit) ||
        strcmp(level_unit->valuestring, "m") != 0) return false;
    cJSON *times = array(series, "time");
    cJSON *levels = array(series, "sea_level_height_msl");
    const int count = times ? cJSON_GetArraySize(times) : 0;
    if (count < 473 || count > 485 || !valid_numeric_series(times, levels, count, 900)) {
        return false;
    }
    *out_times = times;
    *out_levels = levels;
    *out_count = count;
    return true;
}

static bool add_extremum(wind_tide_t *tide, const open_meteo_marine_config_t *config,
                         cJSON *time_value, cJSON *level_value, int index,
                         int count, bool is_high)
{
    if (index <= 0 || index >= count - 1) return true;
    if (tide->extremum_count >= WIND_TIDE_MAX_EXTREMA) return true;
    const int64_t timestamp = (int64_t) time_value->valuedouble;
    const double level = level_value->valuedouble;
    wind_local_datetime_t local;
    if (wind_timezone_from_unix(config->timezone, timestamp, &local) != ESP_OK) return false;
    wind_tide_extremum_t *extremum = &tide->extrema[tide->extremum_count++];
    extremum->timestamp = timestamp;
    extremum->local_hour = local.hour;
    extremum->local_minute = local.minute;
    extremum->is_high = is_high ? 1 : 0;
    extremum->sea_level_mm = (int32_t) lround(level * 1000.0);
    return wind_timezone_format_date(&local, extremum->local_date,
                                     sizeof(extremum->local_date)) == ESP_OK;
}

static bool find_extrema(wind_tide_t *tide, const open_meteo_marine_config_t *config,
                         cJSON *times, cJSON *levels, int count)
{
    double minimum = levels->child->valuedouble;
    double maximum = minimum;
    for (cJSON *level = levels->child->next; level; level = level->next) {
        const double value = level->valuedouble;
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
    }
    const double threshold = fmax(0.01, fmin(0.5, (maximum - minimum) / 10.0));
    int direction = 0;
    cJSON *high_time = times->child;
    cJSON *high_level = levels->child;
    cJSON *low_time = times->child;
    cJSON *low_level = levels->child;
    int high_candidate = 0;
    int low_candidate = 0;
    cJSON *time_value = times->child->next;
    cJSON *level_value = levels->child->next;
    for (int index = 1; index < count; ++index, time_value = time_value->next,
             level_value = level_value->next) {
        const double value = level_value->valuedouble;
        if (direction >= 0 && value >= high_level->valuedouble) {
            high_candidate = index;
            high_time = time_value;
            high_level = level_value;
        }
        if (direction <= 0 && value <= low_level->valuedouble) {
            low_candidate = index;
            low_time = time_value;
            low_level = level_value;
        }

        if (direction == 0) {
            if (value - low_level->valuedouble >= threshold) {
                if (!add_extremum(tide, config, low_time, low_level, low_candidate,
                                  count, false)) return false;
                direction = 1;
                high_candidate = index;
                high_time = time_value;
                high_level = level_value;
            } else if (high_level->valuedouble - value >= threshold) {
                if (!add_extremum(tide, config, high_time, high_level, high_candidate,
                                  count, true)) return false;
                direction = -1;
                low_candidate = index;
                low_time = time_value;
                low_level = level_value;
            }
        } else if (direction > 0 && high_level->valuedouble - value >= threshold) {
            if (!add_extremum(tide, config, high_time, high_level, high_candidate,
                              count, true)) return false;
            direction = -1;
            low_candidate = index;
            low_time = time_value;
            low_level = level_value;
        } else if (direction < 0 && value - low_level->valuedouble >= threshold) {
            if (!add_extremum(tide, config, low_time, low_level, low_candidate,
                              count, false)) return false;
            direction = 1;
            high_candidate = index;
            high_time = time_value;
            high_level = level_value;
        }
    }
    return true;
}

esp_err_t open_meteo_marine_parse_json(const open_meteo_marine_config_t *config, const char *json,
                                       size_t length, int64_t retrieved_at,
                                       wind_tide_t *out_tide)
{
    if (!open_meteo_marine_config_valid(config) || !json || !length ||
        length > OPEN_METEO_MARINE_RESPONSE_LIMIT || retrieved_at <= 0 || !out_tide) {
        return ESP_ERR_INVALID_ARG;
    }
    cJSON *root = cJSON_ParseWithLength(json, length);
    if (!root) return ESP_ERR_INVALID_RESPONSE;
    esp_err_t result = ESP_ERR_INVALID_RESPONSE;
    wind_tide_t parsed;
    wind_tide_clear(&parsed);
    cJSON *timezone = cJSON_GetObjectItemCaseSensitive(root, "timezone");
    cJSON *units = cJSON_GetObjectItemCaseSensitive(root, "hourly_units");
    cJSON *hourly = cJSON_GetObjectItemCaseSensitive(root, "hourly");
    cJSON *time_unit = cJSON_IsObject(units) ? cJSON_GetObjectItemCaseSensitive(units, "time") : NULL;
    cJSON *level_unit = cJSON_IsObject(units)
                            ? cJSON_GetObjectItemCaseSensitive(units, "sea_level_height_msl")
                            : NULL;
    if (!cJSON_IsString(timezone) || strcmp(timezone->valuestring, config->timezone) != 0 ||
        !cJSON_IsString(time_unit) || strcmp(time_unit->valuestring, "unixtime") != 0 ||
        !cJSON_IsString(level_unit) || strcmp(level_unit->valuestring, "m") != 0 ||
        !cJSON_IsObject(hourly)) goto cleanup;
    cJSON *times = array(hourly, "time");
    cJSON *levels = array(hourly, "sea_level_height_msl");
    int count = times ? cJSON_GetArraySize(times) : 0;
    if (!levels || count < (int) WIND_TIDE_MIN_SAMPLES || count > (int) WIND_TIDE_MAX_SAMPLES ||
        cJSON_GetArraySize(levels) != count) goto cleanup;

    if (!copy_text(parsed.spot_id, sizeof(parsed.spot_id), config->spot_id) ||
        !copy_text(parsed.timezone, sizeof(parsed.timezone), config->timezone) ||
        !copy_text(parsed.provider, sizeof(parsed.provider), "open-meteo-marine")) goto cleanup;
    parsed.retrieved_at = retrieved_at;

    int null_count = 0;
    for (int index = 0; index < count; ++index) {
        if (cJSON_IsNull(cJSON_GetArrayItem(levels, index))) ++null_count;
    }
    if (null_count == count) {
        parsed.capability = WIND_TIDE_UNSUPPORTED;
        if (!wind_tide_validate(&parsed)) goto cleanup;
        *out_tide = parsed;
        result = ESP_OK;
        goto cleanup;
    }
    if (null_count != 0) goto cleanup;

    parsed.capability = WIND_TIDE_AVAILABLE;
    parsed.sample_count = (uint16_t) count;
    for (int index = 0; index < count; ++index) {
        cJSON *time_value = cJSON_GetArrayItem(times, index);
        cJSON *level_value = cJSON_GetArrayItem(levels, index);
        if (!cJSON_IsNumber(time_value) || !cJSON_IsNumber(level_value) ||
            !isfinite(time_value->valuedouble) || !isfinite(level_value->valuedouble)) goto cleanup;
        int64_t timestamp = (int64_t) time_value->valuedouble;
        if ((double) timestamp != time_value->valuedouble || timestamp <= 0 ||
            (index > 0 && timestamp - parsed.samples[index - 1].timestamp != 3600) ||
            level_value->valuedouble < -2147483.648 || level_value->valuedouble > 2147483.647) {
            goto cleanup;
        }
        wind_local_datetime_t local;
        if (wind_timezone_from_unix(config->timezone, timestamp, &local) != ESP_OK) goto cleanup;
        wind_tide_sample_t *sample = &parsed.samples[index];
        sample->timestamp = timestamp;
        sample->local_hour = local.hour;
        if (wind_timezone_format_date(&local, sample->local_date,
                                      sizeof(sample->local_date)) != ESP_OK) {
            goto cleanup;
        }
        sample->sea_level_mm = (int32_t) lround(level_value->valuedouble * 1000.0);
    }
    cJSON *extremum_times = times;
    cJSON *extremum_levels = levels;
    int extremum_sample_count = count;
    (void) quarter_series(root, &extremum_times, &extremum_levels, &extremum_sample_count);
    if (!find_extrema(&parsed, config, extremum_times, extremum_levels,
                      extremum_sample_count)) goto cleanup;
    if (parsed.extremum_count == 0) {
        parsed.capability = WIND_TIDE_UNSUPPORTED;
        parsed.sample_count = 0;
    }
    if (!wind_tide_validate(&parsed)) goto cleanup;
    *out_tide = parsed;
    result = ESP_OK;

cleanup:
    cJSON_Delete(root);
    return result;
}

#ifdef ESP_PLATFORM
typedef struct {
    char *body;
    size_t length;
    bool too_large;
} response_t;

static esp_err_t response_event(esp_http_client_event_t *event)
{
    response_t *response = (response_t *) event->user_data;
    if (event->event_id != HTTP_EVENT_ON_DATA || event->data_len <= 0) return ESP_OK;
    if (response->length + (size_t) event->data_len > OPEN_METEO_MARINE_RESPONSE_LIMIT) {
        response->too_large = true;
        return ESP_FAIL;
    }
    memcpy(response->body + response->length, event->data, (size_t) event->data_len);
    response->length += (size_t) event->data_len;
    response->body[response->length] = '\0';
    return ESP_OK;
}

static esp_err_t fetch_tide(void *context, int64_t retrieved_at, wind_tide_t *out_tide)
{
    open_meteo_marine_config_t *config = (open_meteo_marine_config_t *) context;
    if (!open_meteo_marine_config_valid(config) || !out_tide) return ESP_ERR_INVALID_STATE;
    char url[640];
    int written = snprintf(url, sizeof(url),
        "%s?latitude=%.6f&longitude=%.6f&hourly=sea_level_height_msl&minutely_15=sea_level_height_msl&timezone=%s&forecast_days=5&timeformat=unixtime&cell_selection=sea",
        OPEN_METEO_MARINE_ENDPOINT, config->latitude, config->longitude, config->timezone);
    if (written <= 0 || (size_t) written >= sizeof(url)) return ESP_ERR_INVALID_SIZE;
    response_t response = {.body = calloc(1, OPEN_METEO_MARINE_RESPONSE_LIMIT + 1)};
    if (!response.body) return ESP_ERR_NO_MEM;
    esp_http_client_config_t http = {.url = url, .timeout_ms = OPEN_METEO_MARINE_TIMEOUT_MS,
                                     .event_handler = response_event, .user_data = &response,
                                     .crt_bundle_attach = esp_crt_bundle_attach,
                                     .disable_auto_redirect = true};
    esp_http_client_handle_t client = esp_http_client_init(&http);
    if (!client) {
        free(response.body);
        return ESP_FAIL;
    }
    esp_err_t result = esp_http_client_perform(client);
    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);
    if (result != ESP_OK || status != 200 || response.too_large || response.length == 0) {
        free(response.body);
        return response.too_large ? ESP_ERR_INVALID_SIZE : ESP_FAIL;
    }
    result = open_meteo_marine_parse_json(config, response.body, response.length, retrieved_at,
                                           out_tide);
    free(response.body);
    return result;
}
#else
static esp_err_t fetch_tide(void *context, int64_t retrieved_at, wind_tide_t *out_tide)
{
    (void) context;
    (void) retrieved_at;
    (void) out_tide;
    return ESP_ERR_NOT_SUPPORTED;
}
#endif

void open_meteo_marine_provider_init(wind_tide_provider_t *provider,
                                     open_meteo_marine_config_t *config)
{
    if (provider) {
        provider->fetch = fetch_tide;
        provider->context = config;
    }
}
