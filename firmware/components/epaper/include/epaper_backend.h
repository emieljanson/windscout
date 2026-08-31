#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct epaper_config epaper_config_t;

typedef enum {
    EPAPER_HARDWARE_UNKNOWN = 0,
    EPAPER_HARDWARE_E1001 = 1,
    EPAPER_HARDWARE_E1002 = 2,
} epaper_hardware_t;

typedef struct {
    const char *name;
    uint16_t width;
    uint16_t height;
    esp_err_t (*init)(const epaper_config_t *config);
    esp_err_t (*display)(uint8_t *image);
    esp_err_t (*display_logical)(const uint8_t *image, size_t image_size);
    esp_err_t (*clear)(uint8_t *image, uint8_t color);
    void (*set_temperature)(int8_t celsius);
    esp_err_t (*enter_deepsleep)(void);
} epaper_backend_t;

typedef bool (*epaper_busy_reader_t)(void *context);
typedef void (*epaper_delay_t)(void *context, uint32_t milliseconds);

/** Poll BUSY at a fixed interval and return once the time budget is exhausted. */
esp_err_t epaper_wait_busy_bounded(epaper_busy_reader_t is_busy, epaper_delay_t delay,
                                   void *context, uint32_t poll_interval_ms,
                                   uint32_t timeout_ms);

#ifdef EPAPER_DISPATCHER_HOST_TEST
void epaper_dispatcher_reset_for_test(void);
void epaper_dispatcher_set_backends_for_test(const epaper_backend_t *e1001,
                                             const epaper_backend_t *e1002);
#endif

#ifdef __cplusplus
}
#endif
