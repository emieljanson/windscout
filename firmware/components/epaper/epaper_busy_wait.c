#include "epaper_backend.h"

esp_err_t epaper_wait_busy_bounded(epaper_busy_reader_t is_busy, epaper_delay_t delay,
                                   void *context, uint32_t poll_interval_ms,
                                   uint32_t timeout_ms)
{
    if (!is_busy || !delay || poll_interval_ms == 0) return ESP_ERR_INVALID_ARG;
    uint32_t elapsed_ms = 0;
    while (is_busy(context)) {
        if (elapsed_ms >= timeout_ms) return ESP_ERR_TIMEOUT;
        delay(context, poll_interval_ms);
        elapsed_ms += poll_interval_ms;
    }
    return ESP_OK;
}
