#include "wind_installer_service.h"

#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "cJSON.h"

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "development"
#endif

static void clear_credentials(wind_installer_service_t *service)
{
    volatile unsigned char *cursor = (volatile unsigned char *) service->password;
    for (size_t index = 0; index < sizeof(service->password); ++index) cursor[index] = 0;
    memset(service->ssid, 0, sizeof(service->ssid));
    service->credentials_cleared = true;
    service->wifi_ready = false;
}

static void set_wake_lock(wind_installer_service_t *service, bool held)
{
    if (service->wake_lock_held == held) return;
    service->wake_lock_held = held;
    if (service->dependencies.set_wake_lock) {
        service->dependencies.set_wake_lock(service->dependencies.context, held);
    }
}

static void finish_session(wind_installer_service_t *service)
{
    clear_credentials(service);
    set_wake_lock(service, false);
}

void wind_installer_service_init(wind_installer_service_t *service,
                                 const wind_installer_dependencies_t *dependencies)
{
    if (!service) return;
    memset(service, 0, sizeof(*service));
    if (dependencies) service->dependencies = *dependencies;
    service->credentials_cleared = true;
}

static bool copy_json_string(const cJSON *object, const char *key, char *output, size_t size)
{
    const cJSON *value = cJSON_GetObjectItemCaseSensitive(object, key);
    if (!cJSON_IsString(value) || !value->valuestring || strlen(value->valuestring) >= size) {
        return false;
    }
    memcpy(output, value->valuestring, strlen(value->valuestring) + 1);
    return true;
}

static bool json_bool(const cJSON *object, const char *key, bool *output)
{
    const cJSON *value = cJSON_GetObjectItemCaseSensitive(object, key);
    if (!cJSON_IsBool(value)) return false;
    *output = cJSON_IsTrue(value);
    return true;
}

static bool parse_configuration(const cJSON *json, installed_configuration_t *configuration,
                                char digest_text[17])
{
    if (!cJSON_IsObject(json)) return false;
    memset(configuration, 0, sizeof(*configuration));
    const cJSON *version = cJSON_GetObjectItemCaseSensitive(json, "version");
    const cJSON *spot = cJSON_GetObjectItemCaseSensitive(json, "spot");
    const cJSON *display = cJSON_GetObjectItemCaseSensitive(json, "display");
    if (!cJSON_IsNumber(version) || !cJSON_IsObject(spot) || !cJSON_IsObject(display) ||
        !copy_json_string(json, "boardId", configuration->board_id,
                          sizeof(configuration->board_id)) ||
        !copy_json_string(json, "forecastModel", configuration->forecast_model,
                          sizeof(configuration->forecast_model)) ||
        !copy_json_string(json, "digest", digest_text, 17) ||
        !copy_json_string(spot, "id", configuration->spot.id, sizeof(configuration->spot.id)) ||
        !copy_json_string(spot, "name", configuration->spot.display_name,
                          sizeof(configuration->spot.display_name)) ||
        !copy_json_string(spot, "timezone", configuration->spot.timezone,
                          sizeof(configuration->spot.timezone))) return false;
    const cJSON *latitude = cJSON_GetObjectItemCaseSensitive(spot, "latitude");
    const cJSON *longitude = cJSON_GetObjectItemCaseSensitive(spot, "longitude");
    const cJSON *threshold = cJSON_GetObjectItemCaseSensitive(display, "threshold");
    char time_format[16];
    char temperature_unit[16];
    if (!cJSON_IsNumber(latitude) || !cJSON_IsNumber(longitude) || !cJSON_IsNumber(threshold) ||
        !copy_json_string(display, "timeFormat", time_format, sizeof(time_format)) ||
        !copy_json_string(display, "temperatureUnit", temperature_unit,
                          sizeof(temperature_unit)) ||
        !json_bool(display, "showThreshold", &configuration->display.show_threshold) ||
        !json_bool(display, "showWeather", &configuration->display.show_weather) ||
        !json_bool(display, "showTemperature", &configuration->display.show_temperature) ||
        !json_bool(display, "showTide", &configuration->display.show_tide)) return false;
    if (version->valuedouble != INSTALLED_CONFIGURATION_VERSION ||
        threshold->valuedouble < 0 || threshold->valuedouble > 99 ||
        threshold->valuedouble != (double) (uint8_t) threshold->valuedouble) return false;
    configuration->version = (uint32_t) version->valuedouble;
    configuration->generation = 1;
    configuration->spot.latitude = latitude->valuedouble;
    configuration->spot.longitude = longitude->valuedouble;
    configuration->display.threshold_kt = (uint8_t) threshold->valuedouble;
    configuration->display.use_24_hour = strcmp(time_format, "24-hour") == 0;
    configuration->display.temperature_fahrenheit = strcmp(temperature_unit, "fahrenheit") == 0;
    return installed_configuration_validate(configuration);
}

static esp_err_t write_response(char *response, size_t response_size, const char *status,
                                const char *detail)
{
    if (!response || response_size == 0) return ESP_ERR_INVALID_ARG;
    int written = detail ? snprintf(response, response_size,
                                    "{\"status\":\"%s\",\"detail\":\"%s\"}", status, detail)
                         : snprintf(response, response_size, "{\"status\":\"%s\"}", status);
    return written >= 0 && (size_t) written < response_size ? ESP_OK : ESP_ERR_INVALID_SIZE;
}

static esp_err_t handle_hello(char *response, size_t response_size)
{
    int written = snprintf(
        response, response_size,
        "{\"status\":\"ok\",\"boardId\":\"%s\",\"firmwareVersion\":\"%s\",\"protocolVersion\":1,"
        "\"configurationVersion\":%u,\"capabilities\":[\"state\",\"wifi\","
        "\"configuration\",\"render-verification\"]}",
        WINDSCOUT_BOARD_ID, FIRMWARE_VERSION, INSTALLED_CONFIGURATION_VERSION);
    return written >= 0 && (size_t) written < response_size ? ESP_OK : ESP_ERR_INVALID_SIZE;
}

static esp_err_t handle_state(wind_installer_service_t *service, char *response,
                              size_t response_size)
{
    installed_configuration_t active;
    esp_err_t result = installed_configuration_load(&active);
    if (result != ESP_OK) return write_response(response, response_size, "state_unavailable", NULL);
    int written = snprintf(
        response, response_size,
        "{\"status\":\"ok\",\"boardId\":\"%s\",\"configurationDigest\":"
        "\"%016" PRIx64 "\",\"wifi\":\"%s\",\"render\":\"%s\"}",
        WINDSCOUT_BOARD_ID, installed_configuration_digest(&active),
        service->dependencies.wifi_connected &&
                service->dependencies.wifi_connected(service->dependencies.context)
            ? "connected" : "disconnected",
        service->dependencies.render_succeeded &&
                service->dependencies.render_succeeded(service->dependencies.context)
            ? "valid" : "pending");
    return written >= 0 && (size_t) written < response_size ? ESP_OK : ESP_ERR_INVALID_SIZE;
}

esp_err_t wind_installer_service_handle_json(wind_installer_service_t *service,
                                             const char *payload, size_t payload_length,
                                             char *response, size_t response_size)
{
    if (!service || !payload || payload_length == 0 || payload_length > 4096 || !response) {
        return ESP_ERR_INVALID_ARG;
    }
    cJSON *request = cJSON_ParseWithLength(payload, payload_length);
    if (!request) {
        finish_session(service);
        return ESP_ERR_INVALID_ARG;
    }
    const cJSON *command = cJSON_GetObjectItemCaseSensitive(request, "command");
    esp_err_t result = ESP_OK;
    if (!cJSON_IsString(command)) {
        result = ESP_ERR_INVALID_ARG;
    } else if (strcmp(command->valuestring, "hello") == 0) {
        result = handle_hello(response, response_size);
    } else if (strcmp(command->valuestring, "get_state") == 0) {
        result = handle_state(service, response, response_size);
    } else if (strcmp(command->valuestring, "scan_networks") == 0) {
        result = service->dependencies.scan_wifi
                     ? service->dependencies.scan_wifi(service->dependencies.context, response,
                                                       response_size)
                     : write_response(response, response_size, "scan_unavailable", NULL);
    } else if (strcmp(command->valuestring, "begin") == 0) {
        set_wake_lock(service, true);
        result = write_response(response, response_size, "ready", NULL);
    } else if (strcmp(command->valuestring, "stage_configuration") == 0) {
        const cJSON *json = cJSON_GetObjectItemCaseSensitive(request, "configuration");
        char supplied_digest[17] = {0};
        installed_configuration_t candidate;
        if (!parse_configuration(json, &candidate, supplied_digest)) {
            result = write_response(response, response_size, "configuration_rejected", NULL);
        } else {
            char calculated_digest[17];
            snprintf(calculated_digest, sizeof(calculated_digest), "%016" PRIx64,
                     installed_configuration_digest(&candidate));
            if (strcmp(calculated_digest, supplied_digest) != 0) {
                result = write_response(response, response_size, "digest_mismatch", NULL);
            } else {
                installed_configuration_t active;
                installed_configuration_load(&active);
                candidate.generation = active.generation + 1;
                service->candidate = candidate;
                service->candidate_staged = true;
                result = write_response(response, response_size, "configuration_staged",
                                        calculated_digest);
            }
        }
    } else if (strcmp(command->valuestring, "test_wifi") == 0) {
        clear_credentials(service);
        if (!copy_json_string(request, "ssid", service->ssid, sizeof(service->ssid)) ||
            !copy_json_string(request, "password", service->password, sizeof(service->password)) ||
            !service->dependencies.test_wifi) {
            clear_credentials(service);
            result = write_response(response, response_size, "wifi_rejected", NULL);
        } else {
            service->credentials_cleared = false;
            esp_err_t wifi_result = service->dependencies.test_wifi(
                service->dependencies.context, service->ssid, service->password);
            service->wifi_ready = wifi_result == ESP_OK;
            if (!service->wifi_ready) clear_credentials(service);
            result = write_response(response, response_size,
                                    service->wifi_ready ? "wifi_ready" : "wifi_rejected", NULL);
        }
    } else if (strcmp(command->valuestring, "apply_configuration") == 0) {
        if (!service->candidate_staged) {
            result = write_response(response, response_size, "configuration_required", NULL);
        } else if (service->dependencies.render_candidate &&
                   service->dependencies.render_candidate(service->dependencies.context,
                                                          &service->candidate) != ESP_OK) {
            result = write_response(response, response_size, "render_failed", NULL);
        } else if (!service->dependencies.commit ||
                   service->dependencies.commit(service->dependencies.context, &service->candidate,
                                                service->wifi_ready ? service->ssid : NULL,
                                                service->wifi_ready ? service->password : NULL) != ESP_OK) {
            result = write_response(response, response_size, "commit_failed", NULL);
        } else {
            service->candidate_staged = false;
            result = write_response(response, response_size, "complete", NULL);
            finish_session(service);
        }
    } else if (strcmp(command->valuestring, "cancel") == 0) {
        service->candidate_staged = false;
        finish_session(service);
        result = write_response(response, response_size, "cancelled", NULL);
    } else {
        result = write_response(response, response_size, "unknown_command", NULL);
    }
    cJSON_Delete(request);
    return result;
}

void wind_installer_service_timeout(wind_installer_service_t *service)
{
    if (!service) return;
    service->candidate_staged = false;
    finish_session(service);
}

void wind_installer_service_disconnect(wind_installer_service_t *service)
{
    wind_installer_service_timeout(service);
}

#ifdef ESP_PLATFORM
#include "driver/usb_serial_jtag.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "power_manager.h"
#include "wifi_manager.h"
#include "wind_app.h"
#include "wind_spots.h"
#include "wind_usb_protocol.h"

typedef struct {
    wind_installer_service_t service;
    wind_usb_parser_t parser;
    int64_t last_activity_us;
} physical_installer_t;

static physical_installer_t s_physical_installer;

static esp_err_t physical_test_wifi(void *context, const char *ssid, const char *password)
{
    (void) context;
    return wifi_manager_connect(ssid, password);
}

static esp_err_t physical_render(void *context, const installed_configuration_t *candidate)
{
    (void) context;
    return wind_app_preview_configuration(candidate);
}

static esp_err_t physical_commit(void *context, const installed_configuration_t *candidate,
                                 const char *ssid, const char *password)
{
    (void) context;
    esp_err_t result = installed_configuration_promote_setup(candidate, ssid, password);
    if (result != ESP_OK) return result;
    result = wind_spots_reload_installed();
    if (result != ESP_OK) return result;
    return wind_app_activate_configuration(candidate);
}

static void physical_wake_lock(void *context, bool held)
{
    (void) context;
    power_manager_set_installer_active(held);
}

static bool physical_wifi_connected(void *context)
{
    (void) context;
    return wifi_manager_is_connected();
}

static bool physical_render_succeeded(void *context)
{
    (void) context;
    return wind_app_last_render_succeeded();
}

static esp_err_t physical_scan_wifi(void *context, char *response, size_t response_size)
{
    (void) context;
    wifi_ap_record_t records[20];
    int count = wifi_manager_scan(records, 20);
    cJSON *root = cJSON_CreateObject();
    cJSON *networks = cJSON_AddArrayToObject(root, "networks");
    for (int index = 0; index < count; ++index) {
        if (records[index].ssid[0] == '\0') continue;
        bool duplicate = false;
        for (int previous = 0; previous < index; ++previous) {
            if (strcmp((const char *) records[previous].ssid,
                       (const char *) records[index].ssid) == 0) {
                duplicate = true;
                break;
            }
        }
        if (duplicate) continue;
        cJSON *network = cJSON_CreateObject();
        cJSON_AddStringToObject(network, "ssid", (const char *) records[index].ssid);
        cJSON_AddNumberToObject(network, "rssi", records[index].rssi);
        cJSON_AddBoolToObject(network, "secured", records[index].authmode != WIFI_AUTH_OPEN);
        cJSON_AddItemToArray(networks, network);
    }
    char *serialized = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (!serialized) return ESP_ERR_NO_MEM;
    size_t length = strlen(serialized);
    if (length >= response_size) {
        cJSON_free(serialized);
        return ESP_ERR_INVALID_SIZE;
    }
    memcpy(response, serialized, length + 1);
    cJSON_free(serialized);
    return ESP_OK;
}

static void physical_frame(const wind_usb_frame_t *frame, void *context)
{
    physical_installer_t *installer = (physical_installer_t *) context;
    if (frame->message_type != WIND_USB_MESSAGE_REQUEST) return;
    char response[WIND_USB_MAX_PAYLOAD] = {0};
    esp_err_t result = wind_installer_service_handle_json(
        &installer->service, (const char *) frame->payload, frame->payload_length,
        response, sizeof(response));
    if (result != ESP_OK) {
        snprintf(response, sizeof(response),
                 "{\"status\":\"invalid_request\",\"code\":%d}", result);
    }
    uint8_t output[WIND_USB_MAX_FRAME_SIZE];
    size_t output_size = wind_usb_encode_frame(
        frame->request_id, result == ESP_OK ? WIND_USB_MESSAGE_RESULT : WIND_USB_MESSAGE_ERROR,
        (const uint8_t *) response, strlen(response), output, sizeof(output));
    if (output_size > 0) {
        (void) usb_serial_jtag_write_bytes(output, output_size, pdMS_TO_TICKS(1000));
    }
    installer->last_activity_us = esp_timer_get_time();
}

static void installer_usb_task(void *argument)
{
    physical_installer_t *installer = (physical_installer_t *) argument;
    uint8_t input[256];
    while (true) {
        int read = usb_serial_jtag_read_bytes(input, sizeof(input), pdMS_TO_TICKS(250));
        if (read > 0) {
            esp_err_t result = wind_usb_parser_feed(&installer->parser, input, (size_t) read,
                                                    physical_frame, installer);
            if (result != ESP_OK && installer->service.wake_lock_held) {
                wind_installer_service_disconnect(&installer->service);
            }
        }
        if (installer->service.wake_lock_held &&
            esp_timer_get_time() - installer->last_activity_us > INT64_C(120000000)) {
            wind_installer_service_timeout(&installer->service);
        }
    }
}

esp_err_t wind_installer_service_start(void)
{
    usb_serial_jtag_driver_config_t driver_config = {
        .tx_buffer_size = 4096,
        .rx_buffer_size = 4096,
    };
    esp_err_t result = usb_serial_jtag_driver_install(&driver_config);
    if (result != ESP_OK) return result;
    memset(&s_physical_installer, 0, sizeof(s_physical_installer));
    wind_usb_parser_init(&s_physical_installer.parser);
    const wind_installer_dependencies_t dependencies = {
        .context = &s_physical_installer,
        .test_wifi = physical_test_wifi,
        .render_candidate = physical_render,
        .commit = physical_commit,
        .set_wake_lock = physical_wake_lock,
        .scan_wifi = physical_scan_wifi,
        .wifi_connected = physical_wifi_connected,
        .render_succeeded = physical_render_succeeded,
    };
    wind_installer_service_init(&s_physical_installer.service, &dependencies);
    s_physical_installer.last_activity_us = esp_timer_get_time();
    return xTaskCreate(installer_usb_task, "wind_usb", 8192, &s_physical_installer, 6, NULL) == pdPASS
               ? ESP_OK : ESP_ERR_NO_MEM;
}
#endif
