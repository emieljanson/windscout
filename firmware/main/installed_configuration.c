#include "installed_configuration.h"

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#define CONFIG_RECORD_MAGIC UINT32_C(0x57434647)

typedef struct {
    uint32_t magic;
    uint8_t committed;
    uint8_t reserved[3];
    uint64_t digest;
    installed_configuration_t config;
    uint8_t has_credentials;
    char ssid[33];
    char password[65];
} configuration_record_t;

static bool terminated(const char *value, size_t size)
{
    return value && memchr(value, '\0', size) != NULL;
}

static uint64_t fnv1a(const char *value)
{
    uint64_t hash = UINT64_C(0xcbf29ce484222325);
    for (const unsigned char *cursor = (const unsigned char *) value; *cursor; ++cursor) {
        hash ^= *cursor;
        hash *= UINT64_C(0x100000001b3);
    }
    return hash;
}

void installed_configuration_default(installed_configuration_t *config)
{
    if (!config) return;
    memset(config, 0, sizeof(*config));
    config->version = INSTALLED_CONFIGURATION_VERSION;
    config->generation = 1;
    snprintf(config->board_id, sizeof(config->board_id), "%s", WINDSCOUT_BOARD_ID);
    snprintf(config->spot.id, sizeof(config->spot.id), "brouwersdam");
    snprintf(config->spot.display_name, sizeof(config->spot.display_name), "Brouwersdam");
    config->spot.latitude = 51.7506;
    config->spot.longitude = 3.8577;
    snprintf(config->spot.timezone, sizeof(config->spot.timezone), "Europe/Amsterdam");
    snprintf(config->forecast_model, sizeof(config->forecast_model), "best_match");
    config->display.show_threshold = false;
    config->display.threshold_kt = 17;
    config->display.show_weather = true;
    config->display.show_temperature = false;
    config->display.show_tide = false;
    config->display.use_24_hour = true;
    config->display.temperature_fahrenheit = false;
}

bool installed_configuration_validate(const installed_configuration_t *config)
{
    if (!config || config->version != INSTALLED_CONFIGURATION_VERSION || config->generation == 0 ||
        !terminated(config->board_id, sizeof(config->board_id)) ||
        strcmp(config->board_id, WINDSCOUT_BOARD_ID) != 0 ||
        !terminated(config->spot.id, sizeof(config->spot.id)) || config->spot.id[0] == '\0' ||
        !terminated(config->spot.display_name, sizeof(config->spot.display_name)) ||
        config->spot.display_name[0] == '\0' ||
        config->spot.latitude < -90.0 || config->spot.latitude > 90.0 ||
        config->spot.longitude < -180.0 || config->spot.longitude > 180.0 ||
        !terminated(config->spot.timezone, sizeof(config->spot.timezone)) ||
        config->spot.timezone[0] == '\0' ||
        !terminated(config->forecast_model, sizeof(config->forecast_model)) ||
        config->forecast_model[0] == '\0' || config->display.threshold_kt > 99) {
        return false;
    }
    return true;
}

uint64_t installed_configuration_digest(const installed_configuration_t *config)
{
    if (!installed_configuration_validate(config)) return 0;
    char canonical[512];
    int length = snprintf(
        canonical, sizeof(canonical), "%" PRIu32 "|%s|%s|%s|%.6f|%.6f|%s|%s|%u|%u|%u|%u|%u|%s|%s",
        config->version, config->board_id, config->spot.id, config->spot.display_name,
        config->spot.latitude, config->spot.longitude, config->spot.timezone,
        config->forecast_model, config->display.show_threshold ? 1u : 0u,
        config->display.threshold_kt, config->display.show_weather ? 1u : 0u,
        config->display.show_temperature ? 1u : 0u, config->display.show_tide ? 1u : 0u,
        config->display.use_24_hour ? "24-hour" : "12-hour",
        config->display.temperature_fahrenheit ? "fahrenheit" : "celsius");
    return length > 0 && (size_t) length < sizeof(canonical) ? fnv1a(canonical) : 0;
}

static bool record_valid(const configuration_record_t *record)
{
    return record && record->magic == CONFIG_RECORD_MAGIC && record->committed == 1 &&
           (!record->has_credentials ||
            (terminated(record->ssid, sizeof(record->ssid)) && record->ssid[0] != '\0' &&
             terminated(record->password, sizeof(record->password)))) &&
           installed_configuration_validate(&record->config) &&
           record->digest == installed_configuration_digest(&record->config);
}

#ifdef ESP_PLATFORM
#include "nvs.h"

#define CONFIG_NAMESPACE "wind_install"
#define ACTIVE_KEY "active"
#define CANDIDATE_KEY "candidate"

static esp_err_t read_record(nvs_handle_t handle, const char *key, configuration_record_t *record)
{
    size_t size = sizeof(*record);
    esp_err_t result = nvs_get_blob(handle, key, record, &size);
    return result == ESP_OK && size == sizeof(*record) && record_valid(record)
               ? ESP_OK : ESP_ERR_INVALID_STATE;
}

esp_err_t installed_configuration_load(installed_configuration_t *out_config)
{
    if (!out_config) return ESP_ERR_INVALID_ARG;
    nvs_handle_t handle;
    configuration_record_t record;
    esp_err_t result = nvs_open(CONFIG_NAMESPACE, NVS_READONLY, &handle);
    if (result == ESP_OK) {
        result = read_record(handle, ACTIVE_KEY, &record);
        nvs_close(handle);
    }
    if (result == ESP_OK) {
        *out_config = record.config;
        return ESP_OK;
    }
    installed_configuration_default(out_config);
    nvs_handle_t legacy_handle;
    if (nvs_open("wind", NVS_READONLY, &legacy_handle) == ESP_OK) {
        char legacy_spot[64] = {0};
        size_t legacy_size = sizeof(legacy_spot);
        if (nvs_get_str(legacy_handle, "spot", legacy_spot, &legacy_size) == ESP_OK) {
            if (strcmp(legacy_spot, "edam") == 0) {
                snprintf(out_config->spot.id, sizeof(out_config->spot.id), "edam");
                snprintf(out_config->spot.display_name, sizeof(out_config->spot.display_name), "Edam");
                out_config->spot.latitude = 52.5126;
                out_config->spot.longitude = 5.0486;
            } else if (strcmp(legacy_spot, "castricum-aan-zee") == 0) {
                snprintf(out_config->spot.id, sizeof(out_config->spot.id), "castricum-aan-zee");
                snprintf(out_config->spot.display_name, sizeof(out_config->spot.display_name),
                         "Castricum aan Zee");
                out_config->spot.latitude = 52.5550;
                out_config->spot.longitude = 4.6090;
            }
        }
        nvs_close(legacy_handle);
    }
    return ESP_OK;
}

esp_err_t installed_configuration_promote_setup(const installed_configuration_t *candidate,
                                                 const char *ssid, const char *password)
{
    if (!installed_configuration_validate(candidate) || (ssid && strlen(ssid) > 32) ||
        (password && strlen(password) > 64)) return ESP_ERR_INVALID_ARG;
    configuration_record_t record = {
        .magic = CONFIG_RECORD_MAGIC,
        .committed = 0,
        .digest = installed_configuration_digest(candidate),
        .config = *candidate,
    };
    nvs_handle_t handle;
    esp_err_t result = nvs_open(CONFIG_NAMESPACE, NVS_READWRITE, &handle);
    if (result != ESP_OK) return result;
    configuration_record_t previous;
    if (ssid) {
        record.has_credentials = 1;
        snprintf(record.ssid, sizeof(record.ssid), "%s", ssid);
        snprintf(record.password, sizeof(record.password), "%s", password ? password : "");
    } else if (read_record(handle, ACTIVE_KEY, &previous) == ESP_OK && previous.has_credentials) {
        record.has_credentials = 1;
        memcpy(record.ssid, previous.ssid, sizeof(record.ssid));
        memcpy(record.password, previous.password, sizeof(record.password));
    }
    result = nvs_set_blob(handle, CANDIDATE_KEY, &record, sizeof(record));
    if (result == ESP_OK) result = nvs_commit(handle);
    record.committed = 1;
    if (result == ESP_OK) result = nvs_set_blob(handle, CANDIDATE_KEY, &record, sizeof(record));
    if (result == ESP_OK) result = nvs_commit(handle);
    if (result == ESP_OK) result = nvs_set_blob(handle, ACTIVE_KEY, &record, sizeof(record));
    if (result == ESP_OK) result = nvs_commit(handle);
    if (result == ESP_OK) {
        nvs_erase_key(handle, CANDIDATE_KEY);
        nvs_commit(handle);
    }
    nvs_close(handle);
    return result;
}

esp_err_t installed_configuration_promote(const installed_configuration_t *candidate)
{
    return installed_configuration_promote_setup(candidate, NULL, NULL);
}

esp_err_t installed_configuration_load_credentials(char *ssid, size_t ssid_size,
                                                    char *password, size_t password_size)
{
    if (!ssid || ssid_size == 0 || !password || password_size == 0) return ESP_ERR_INVALID_ARG;
    nvs_handle_t handle;
    configuration_record_t record;
    esp_err_t result = nvs_open(CONFIG_NAMESPACE, NVS_READONLY, &handle);
    if (result != ESP_OK) return result;
    result = read_record(handle, ACTIVE_KEY, &record);
    nvs_close(handle);
    if (result != ESP_OK || !record.has_credentials || strlen(record.ssid) >= ssid_size ||
        strlen(record.password) >= password_size) return ESP_ERR_NOT_FOUND;
    snprintf(ssid, ssid_size, "%s", record.ssid);
    snprintf(password, password_size, "%s", record.password);
    return ESP_OK;
}
#else
static configuration_record_t s_active;
static int s_failure_boundary = -1;

void installed_configuration_reset_host_storage(void)
{
    memset(&s_active, 0, sizeof(s_active));
    s_failure_boundary = -1;
}

void installed_configuration_set_host_failure_boundary(int boundary)
{
    s_failure_boundary = boundary;
}

esp_err_t installed_configuration_load(installed_configuration_t *out_config)
{
    if (!out_config) return ESP_ERR_INVALID_ARG;
    if (record_valid(&s_active)) *out_config = s_active.config;
    else installed_configuration_default(out_config);
    return ESP_OK;
}

esp_err_t installed_configuration_promote_setup(const installed_configuration_t *candidate,
                                                 const char *ssid, const char *password)
{
    if (!installed_configuration_validate(candidate) || (ssid && strlen(ssid) > 32) ||
        (password && strlen(password) > 64)) return ESP_ERR_INVALID_ARG;
    configuration_record_t staged = {
        .magic = CONFIG_RECORD_MAGIC,
        .committed = 0,
        .digest = installed_configuration_digest(candidate),
        .config = *candidate,
    };
    if (ssid) {
        staged.has_credentials = 1;
        snprintf(staged.ssid, sizeof(staged.ssid), "%s", ssid);
        snprintf(staged.password, sizeof(staged.password), "%s", password ? password : "");
    } else if (record_valid(&s_active) && s_active.has_credentials) {
        staged.has_credentials = 1;
        memcpy(staged.ssid, s_active.ssid, sizeof(staged.ssid));
        memcpy(staged.password, s_active.password, sizeof(staged.password));
    }
    if (s_failure_boundary == 0) return ESP_FAIL;
    if (s_failure_boundary == 1) return ESP_FAIL;
    staged.committed = 1;
    if (s_failure_boundary == 2) return ESP_FAIL;
    s_active = staged;
    return ESP_OK;
}

esp_err_t installed_configuration_promote(const installed_configuration_t *candidate)
{
    return installed_configuration_promote_setup(candidate, NULL, NULL);
}

esp_err_t installed_configuration_load_credentials(char *ssid, size_t ssid_size,
                                                    char *password, size_t password_size)
{
    if (!ssid || ssid_size == 0 || !password || password_size == 0 ||
        !record_valid(&s_active) || !s_active.has_credentials ||
        strlen(s_active.ssid) >= ssid_size || strlen(s_active.password) >= password_size) {
        return ESP_ERR_NOT_FOUND;
    }
    snprintf(ssid, ssid_size, "%s", s_active.ssid);
    snprintf(password, password_size, "%s", s_active.password);
    return ESP_OK;
}
#endif
