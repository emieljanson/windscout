#ifndef WIND_FONT_H
#define WIND_FONT_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    WIND_FONT_BERKELEY_MONO,
    WIND_FONT_BERKELEY_MONO_BOLD,
    WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
    WIND_FONT_INTER_BOLD,
    WIND_FONT_INTER,
} wind_font_family_t;

typedef struct {
    int width;
    int ascent;
    int descent;
} wind_text_metrics_t;

enum {
    WIND_FONT_SIZE_COORDINATES = 12,
    WIND_FONT_SIZE_STATUS = 15,
    WIND_FONT_SIZE_DAY = 15,
    WIND_FONT_SIZE_SPOT = 58,
    WIND_FONT_SIZE_VALUE = 32,
};

wind_text_metrics_t wind_font_measure(wind_font_family_t family, int pixel_size,
                                      const char *utf8);

void wind_font_draw(uint8_t *luma, int width, int height, int stride, int x,
                    int baseline_y, wind_font_family_t family, int pixel_size,
                    uint8_t gray, const char *utf8);

/*
 * Fits "name coordinates", then name alone, then an ellipsized name. The
 * output is always valid UTF-8 and NUL terminated when output_size is nonzero.
 * Returns the number of bytes written, excluding the terminator.
 */
size_t wind_font_fit_ellipsis(wind_font_family_t family, int pixel_size,
                              const char *name_utf8,
                              const char *coordinates_utf8, int max_width,
                              char *output, size_t output_size,
                              int *coordinates_included);

#ifdef __cplusplus
}
#endif

#endif
