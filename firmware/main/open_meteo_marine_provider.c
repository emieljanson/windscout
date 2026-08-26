#include "open_meteo_marine_provider.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "cJSON.h"

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
    if (!config || !config->endpoint || config->endpoint[0] == '\0' || !config->spot_id ||
        !config->timezone || !isfinite(config->latitude) || !isfinite(config->longitude) ||
        (config->development_mode && config->commercial_mode)) return false;
    if (strcmp(config->endpoint, OPEN_METEO_MARINE_FREE_ENDPOINT) == 0) {
        return config->development_mode && !config->commercial_mode;
    }
    if (config->commercial_mode) return config->api_key && config->api_key[0] != '\0';
    return config->development_mode;
}

static cJSON *array(cJSON *object, const char *name)
{
    cJSON *value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsArray(value) ? value : NULL;
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
        time_t epoch = (time_t) timestamp;
        struct tm local;
        if (!localtime_r(&epoch, &local)) goto cleanup;
        wind_tide_sample_t *sample = &parsed.samples[index];
        sample->timestamp = timestamp;
        sample->local_hour = (uint8_t) local.tm_hour;
        if (strftime(sample->local_date, sizeof(sample->local_date), "%Y-%m-%d", &local) != 10) {
            goto cleanup;
        }
        sample->sea_level_mm = (int32_t) lround(level_value->valuedouble * 1000.0);
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
        "%s?latitude=%.6f&longitude=%.6f&hourly=sea_level_height_msl&timezone=%s&forecast_days=5&timeformat=unixtime&cell_selection=sea",
        config->endpoint, config->latitude, config->longitude, config->timezone);
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
    if (config->api_key && config->api_key[0]) esp_http_client_set_header(client, "X-API-Key", config->api_key);
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
