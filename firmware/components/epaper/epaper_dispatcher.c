#include "epaper.h"

#include <stddef.h>

#ifndef EPAPER_DISPATCHER_HOST_TEST
extern const epaper_backend_t epaper_backend_ed2208_gca;

__attribute__((weak)) const epaper_backend_t *epaper_backend_uc8179_gray4(void)
{
    return NULL;
}
#endif

static const epaper_backend_t *s_e1001_backend;
static const epaper_backend_t *s_e1002_backend;
static const epaper_backend_t *s_active_backend;
static bool s_selection_locked;

static void load_production_backends(void)
{
#ifndef EPAPER_DISPATCHER_HOST_TEST
    if (!s_e1001_backend) s_e1001_backend = epaper_backend_uc8179_gray4();
    if (!s_e1002_backend) s_e1002_backend = &epaper_backend_ed2208_gca;
#endif
}

esp_err_t epaper_select_backend(epaper_hardware_t hardware)
{
    if (s_selection_locked) return ESP_ERR_INVALID_STATE;
    load_production_backends();

    const epaper_backend_t *selected = NULL;
    if (hardware == EPAPER_HARDWARE_E1001) {
        selected = s_e1001_backend;
    } else if (hardware == EPAPER_HARDWARE_E1002) {
        selected = s_e1002_backend;
    } else {
        return ESP_ERR_INVALID_ARG;
    }
    if (!selected) return ESP_ERR_NOT_SUPPORTED;

    s_active_backend = selected;
    s_selection_locked = true;
    return ESP_OK;
}

bool epaper_has_active_backend(void)
{
    return s_active_backend != NULL;
}

const char *epaper_active_backend_name(void)
{
    return s_active_backend ? s_active_backend->name : "none";
}

uint16_t epaper_get_width(void)
{
    return s_active_backend ? s_active_backend->width : 800;
}

uint16_t epaper_get_height(void)
{
    return s_active_backend ? s_active_backend->height : 480;
}

esp_err_t epaper_init(const epaper_config_t *config)
{
    if (!s_active_backend || !s_active_backend->init) return ESP_ERR_INVALID_STATE;
    return s_active_backend->init(config);
}

esp_err_t epaper_display(uint8_t *image)
{
    if (!s_active_backend || !s_active_backend->display) return ESP_ERR_INVALID_STATE;
    return s_active_backend->display(image);
}

esp_err_t epaper_clear(uint8_t *image, uint8_t color)
{
    if (!s_active_backend || !s_active_backend->clear) return ESP_ERR_INVALID_STATE;
    return s_active_backend->clear(image, color);
}

void epaper_set_temperature(int8_t celsius)
{
    if (s_active_backend && s_active_backend->set_temperature) {
        s_active_backend->set_temperature(celsius);
    }
}

esp_err_t epaper_enter_deepsleep(void)
{
    if (!s_active_backend || !s_active_backend->enter_deepsleep) {
        return ESP_ERR_INVALID_STATE;
    }
    return s_active_backend->enter_deepsleep();
}

#ifdef EPAPER_DISPATCHER_HOST_TEST
void epaper_dispatcher_reset_for_test(void)
{
    s_e1001_backend = NULL;
    s_e1002_backend = NULL;
    s_active_backend = NULL;
    s_selection_locked = false;
}

void epaper_dispatcher_set_backends_for_test(const epaper_backend_t *e1001,
                                             const epaper_backend_t *e1002)
{
    s_e1001_backend = e1001;
    s_e1002_backend = e1002;
}
#endif
