#include "display_manager.h"

#include <string.h>

#include "GUI_ColorMap.h"
#include "GUI_Paint.h"
#include "board_hal.h"
#include "epaper.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "wind_display";
static SemaphoreHandle_t s_display_mutex;
static uint8_t *s_image_buffer;
static bool s_stream_active;

#define DISPLAY_LOCK_TIMEOUT_MS (120 * 1000)

static bool display_is_grayscale(void)
{
    return strncmp(BOARD_HAL_DISPLAY_TYPE, "gc", 2) == 0;
}

static UWORD display_white(void)
{
    return display_is_grayscale() ? 0xF : EPD_7IN3E_WHITE;
}

void display_manager_initialize_paint(void)
{
    Paint_NewImage(s_image_buffer, BOARD_HAL_DISPLAY_WIDTH, BOARD_HAL_DISPLAY_HEIGHT, 0,
                   display_white());
    Paint_SetScale(display_is_grayscale() ? 16 : 6);
    Paint_SelectImage(s_image_buffer);
}

esp_err_t display_manager_init(void)
{
    if (s_display_mutex || s_image_buffer) return ESP_ERR_INVALID_STATE;
    s_display_mutex = xSemaphoreCreateMutex();
    if (!s_display_mutex) return ESP_ERR_NO_MEM;

    const size_t bytes_per_row = (BOARD_HAL_DISPLAY_WIDTH + 1) / 2;
    s_image_buffer = heap_caps_malloc(bytes_per_row * BOARD_HAL_DISPLAY_HEIGHT,
                                      MALLOC_CAP_SPIRAM);
    if (!s_image_buffer) {
        vSemaphoreDelete(s_display_mutex);
        s_display_mutex = NULL;
        return ESP_ERR_NO_MEM;
    }
    display_manager_initialize_paint();
    ESP_LOGI(TAG, "Wind dashboard display initialized");
    return ESP_OK;
}

esp_err_t display_manager_begin_rgb_stream(void)
{
    if (!s_display_mutex ||
        xSemaphoreTake(s_display_mutex, pdMS_TO_TICKS(DISPLAY_LOCK_TIMEOUT_MS)) != pdTRUE) {
        return ESP_ERR_INVALID_STATE;
    }
    Paint_Clear(display_white());
    s_stream_active = true;
    return ESP_OK;
}

esp_err_t display_manager_push_rgb_row(int y, const uint8_t *rgb_row, int width)
{
    if (!rgb_row || y < 0 || width < 0) return ESP_ERR_INVALID_ARG;
    if (!s_stream_active) return ESP_ERR_INVALID_STATE;
    if (y >= Paint.Height) return ESP_OK;
    GUI_RGBMapFn map_rgb = display_is_grayscale() ? GUI_RGBToGray16 : GUI_RGBToSpectra6;
    for (int x = 0; x < width && x < Paint.Width; ++x) {
        const uint8_t *pixel = &rgb_row[x * 3];
        Paint_SetPixel(x, y, map_rgb(pixel[0], pixel[1], pixel[2]));
    }
    return ESP_OK;
}

esp_err_t display_manager_push_palette_row(int y, const uint8_t *palette_row, int width)
{
    if (!palette_row || y < 0 || width < 0) return ESP_ERR_INVALID_ARG;
    if (!s_stream_active) return ESP_ERR_INVALID_STATE;
    if (y >= Paint.Height) return ESP_OK;
    for (int x = 0; x < width && x < Paint.Width; ++x) {
        Paint_SetPixel(x, y, palette_row[x]);
    }
    return ESP_OK;
}

esp_err_t display_manager_end_rgb_stream(bool show, const display_publish_t *publish)
{
    (void) publish;
    if (!s_display_mutex || !s_stream_active) return ESP_ERR_INVALID_STATE;
    esp_err_t result = show ? epaper_display(s_image_buffer) : ESP_OK;
    s_stream_active = false;
    xSemaphoreGive(s_display_mutex);
    return result;
}
