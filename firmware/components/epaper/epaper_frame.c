#include "epaper_frame.h"

#include <stdbool.h>

static bool spectra6_code(uint8_t logical, uint8_t *native)
{
    switch (logical) {
        case 0:  // black
        case 1:  // white
        case 2:  // yellow
        case 3:  // red
        case 5:  // blue
        case 6:  // green
            *native = logical;
            return true;
        default:
            return false;
    }
}

esp_err_t epaper_encode_e1002_spectra6(const uint8_t *logical,
                                       size_t logical_size,
                                       uint8_t *transport,
                                       size_t transport_size)
{
    if (!logical || !transport) return ESP_ERR_INVALID_ARG;
    if (logical_size != EPAPER_LOGICAL_FRAME_BYTES ||
        transport_size != EPAPER_E1002_TRANSPORT_BYTES) {
        return ESP_ERR_INVALID_SIZE;
    }
    for (size_t pixel = 0; pixel < logical_size; pixel += 2) {
        uint8_t high;
        uint8_t low;
        if (!spectra6_code(logical[pixel], &high) ||
            !spectra6_code(logical[pixel + 1], &low)) {
            return ESP_ERR_INVALID_ARG;
        }
        transport[pixel / 2] = (uint8_t) ((high << 4) | low);
    }
    return ESP_OK;
}

esp_err_t epaper_encode_e1001_gray4(const uint8_t *logical, size_t logical_size,
                                    uint8_t *transport, size_t transport_size)
{
    if (!logical || !transport) return ESP_ERR_INVALID_ARG;
    if (logical_size != EPAPER_LOGICAL_FRAME_BYTES ||
        transport_size != EPAPER_E1001_TRANSPORT_BYTES) {
        return ESP_ERR_INVALID_SIZE;
    }
    uint8_t *dtm1 = transport;
    uint8_t *dtm2 = transport + EPAPER_GRAY4_PLANE_BYTES;
    for (size_t group = 0; group < EPAPER_GRAY4_PLANE_BYTES; ++group) {
        uint8_t low_plane = 0;
        uint8_t high_plane = 0;
        for (unsigned bit = 0; bit < 8; ++bit) {
            const uint8_t level = logical[group * 8 + bit];
            if (level > 3) return ESP_ERR_INVALID_ARG;
            const uint8_t panel_code = (uint8_t) (3 - level);
            if (panel_code & 0x01u) low_plane |= (uint8_t) (0x80u >> bit);
            if (panel_code & 0x02u) high_plane |= (uint8_t) (0x80u >> bit);
        }
        dtm1[group] = low_plane;
        dtm2[group] = high_plane;
    }
    return ESP_OK;
}
