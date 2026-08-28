#include <stdbool.h>
#include <sys/time.h>
#include <time.h>

#include "board_hal.h"
#include "config.h"
#include "config_manager.h"
#include "debug_log.h"
#include "display_manager.h"
#include "esp_log.h"
#include "esp_sntp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "power_manager.h"
#include "storage.h"
#include "wifi_manager.h"
#include "wind_app.h"
#include "wind_clock.h"
#include "wind_installer_service.h"

static const char *TAG = "windscout";
static volatile bool s_time_synchronized;

static void time_sync_notification(struct timeval *time_value)
{
    (void) time_value;
    s_time_synchronized = true;
}

static esp_err_t read_rtc_clock(void *context, time_t *value)
{
    (void) context;
    return board_hal_rtc_get_time(value);
}

static esp_err_t write_system_clock(void *context, time_t seconds)
{
    (void) context;
    const struct timeval value = {.tv_sec = seconds};
    return settimeofday(&value, NULL) == 0 ? ESP_OK : ESP_FAIL;
}

static bool restore_clock_from_rtc(void)
{
    return board_hal_rtc_is_available() &&
           wind_clock_restore_from_rtc(NULL, read_rtc_clock, write_system_clock) == ESP_OK;
}

static esp_err_t synchronize_clock(void)
{
    s_time_synchronized = false;
    esp_sntp_stop();
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_setservername(1, "time.google.com");
    sntp_set_sync_mode(SNTP_SYNC_MODE_IMMED);
    sntp_set_time_sync_notification_cb(time_sync_notification);
    esp_sntp_init();
    for (int second = 0; second < 10 && !s_time_synchronized; ++second) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
    if (!s_time_synchronized) return ESP_ERR_TIMEOUT;
    time_t now;
    time(&now);
    if (board_hal_rtc_is_available()) {
        (void) board_hal_rtc_set_time(now);
    }
    return ESP_OK;
}

static bool connect_installed_wifi(void)
{
    char ssid[WIFI_SSID_MAX_LEN] = {0};
    char password[WIFI_PASS_MAX_LEN] = {0};
    if (wifi_manager_load_credentials(ssid, password) != ESP_OK || ssid[0] == '\0') {
        ESP_LOGI(TAG, "No installed Wi-Fi configuration; waiting for USB installer");
        return false;
    }
    return wifi_manager_connect_for_refresh(ssid, password) == ESP_OK;
}

static void dashboard_task(void *argument)
{
    (void) argument;
    while (true) {
        const int seconds = wind_app_seconds_until_next_wake();
        vTaskDelay(pdMS_TO_TICKS((seconds > 0 ? seconds : 1) * 1000));
        if (!power_manager_is_installer_active()) {
            if (!wifi_manager_is_connected() && !connect_installed_wifi()) {
                ESP_LOGW(TAG, "Scheduled refresh is offline");
            }
            esp_err_t result = wind_app_refresh(false);
            if (result != ESP_OK) {
                ESP_LOGW(TAG, "Scheduled forecast refresh failed: %s", esp_err_to_name(result));
            }
        }
    }
}

void app_main(void)
{
    ESP_ERROR_CHECK(board_hal_init());
    ESP_ERROR_CHECK(storage_init());

    esp_err_t result = nvs_flash_init();
    if (result == ESP_ERR_NVS_NO_FREE_PAGES || result == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        result = nvs_flash_init();
    }
    ESP_ERROR_CHECK(result);
    ESP_ERROR_CHECK(config_manager_init());
    ESP_ERROR_CHECK(wind_app_configure_runtime());
    debug_log_init();

    result = board_hal_rtc_init();
    if (result != ESP_OK && result != ESP_ERR_NOT_SUPPORTED) {
        ESP_LOGW(TAG, "RTC initialization failed: %s", esp_err_to_name(result));
    }
    (void) restore_clock_from_rtc();

    ESP_ERROR_CHECK(display_manager_init());
    ESP_ERROR_CHECK(wifi_manager_init());
    ESP_ERROR_CHECK(power_manager_init());
    ESP_ERROR_CHECK(wind_installer_service_start());

    const bool connected = connect_installed_wifi();
    if (connected && synchronize_clock() != ESP_OK) {
        ESP_LOGW(TAG, "Clock sync timed out; using the retained RTC clock");
    }

    const int early_seconds = power_manager_get_seconds_until_wake_target();
    if (early_seconds > EARLY_WAKE_TOLERANCE_SEC) {
        power_manager_enter_sleep_with_timer((uint32_t) early_seconds);
    }

    result = wind_app_start();
    if (result != ESP_OK) {
        ESP_LOGW(TAG, "Dashboard refresh completed with error: %s", esp_err_to_name(result));
    }

    if (power_manager_get_wakeup_source() == WAKEUP_SOURCE_TIMER) {
        power_manager_enter_sleep();
    }

    xTaskCreate(dashboard_task, "wind_dashboard", 8192, NULL, 5, NULL);
    ESP_LOGI(TAG, "WindScout ready%s", connected ? "" : " (offline)");
    while (true) vTaskDelay(pdMS_TO_TICKS(60000));
}
