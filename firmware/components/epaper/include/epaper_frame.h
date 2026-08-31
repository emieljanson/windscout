#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

enum {
    EPAPER_FRAME_WIDTH = 800,
    EPAPER_FRAME_HEIGHT = 480,
    EPAPER_LOGICAL_FRAME_BYTES = EPAPER_FRAME_WIDTH * EPAPER_FRAME_HEIGHT,
    EPAPER_GRAY4_PLANE_BYTES = EPAPER_LOGICAL_FRAME_BYTES / 8,
    EPAPER_E1001_TRANSPORT_BYTES = EPAPER_GRAY4_PLANE_BYTES * 2,
    EPAPER_E1002_TRANSPORT_BYTES = EPAPER_LOGICAL_FRAME_BYTES / 2,
};

/*
 * Encodes one byte per logical Gray4 pixel (0=black ... 3=white) as
 * UC8179 DTM1 followed by DTM2. The panel waveform uses inverted polarity;
 * DTM1 carries the low bit and DTM2 the high bit after inversion.
 */
esp_err_t epaper_encode_e1001_gray4(const uint8_t *logical, size_t logical_size,
                                    uint8_t *transport, size_t transport_size);

/*
 * Encodes the public Spectra6 palette codes into ED2208 native packed nibbles.
 * Two logical pixels become one transport byte, high pixel first.
 */
esp_err_t epaper_encode_e1002_spectra6(const uint8_t *logical,
                                       size_t logical_size,
                                       uint8_t *transport,
                                       size_t transport_size);

#ifdef __cplusplus
}
#endif
