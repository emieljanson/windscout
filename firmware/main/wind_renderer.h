#ifndef WIND_RENDERER_H
#define WIND_RENDERER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    WIND_RENDERER_WIDTH = 800,
    WIND_RENDERER_HEIGHT = 480,
    WIND_RENDERER_DAY_COUNT = 5,
    WIND_RENDERER_SAMPLES_PER_DAY = 5,
    WIND_RENDERER_PALETTE_BYTES = WIND_RENDERER_WIDTH * WIND_RENDERER_HEIGHT,
};

typedef enum {
    WIND_RENDERER_FRESH = 0,
    WIND_RENDERER_AGED,
    WIND_RENDERER_STALE,
    WIND_RENDERER_UNAVAILABLE,
} wind_renderer_state_t;

typedef enum {
    WIND_RENDERER_MODE_BACKGROUND_FADE = 0,
    WIND_RENDERER_MODE_THRESHOLD,
    WIND_RENDERER_MODE_SOLID,
    WIND_RENDERER_MODE_COUNT,
} wind_renderer_display_mode_t;

typedef enum {
    WIND_RENDERER_WEATHER_UNAVAILABLE = 0,
    WIND_RENDERER_WEATHER_CLEAR_DAY,
    WIND_RENDERER_WEATHER_CLEAR_NIGHT,
    WIND_RENDERER_WEATHER_PARTLY_CLOUDY_DAY,
    WIND_RENDERER_WEATHER_PARTLY_CLOUDY_NIGHT,
    WIND_RENDERER_WEATHER_CLOUDY,
    WIND_RENDERER_WEATHER_LIGHT_RAIN,
    WIND_RENDERER_WEATHER_RAIN,
    WIND_RENDERER_WEATHER_HEAVY_RAIN,
} wind_renderer_weather_t;

typedef struct {
    const char *time;
    int sustained_kt;
    int gust_kt;
    int destination_degrees;
    int available;
    wind_renderer_weather_t weather;
} wind_renderer_sample_t;

typedef struct {
    const char *day;
    const char *date;
    wind_renderer_sample_t samples[WIND_RENDERER_SAMPLES_PER_DAY];
} wind_renderer_day_t;

typedef struct {
    const char *spot_name;
    const char *coordinates;
    const char *provider;
    const char *updated_time;
    wind_renderer_state_t state;
    int refresh_failed;
    int age_hours;
    /* Negative means that battery state is unknown. */
    int battery_percent;
    wind_renderer_display_mode_t display_mode;
    wind_renderer_day_t days[WIND_RENDERER_DAY_COUNT];
} wind_renderer_dashboard_t;

typedef struct {
    int dither_passes;
    int coordinates_included;
    int status_right;
    int clipped_primitives;
} wind_renderer_stats_t;

/*
 * Composes and dithers one complete 800 x 480 dashboard. The caller owns
 * palette_out. Output bytes use the native Spectra palette indices for black,
 * white, and red.
 */
int wind_renderer_render(const wind_renderer_dashboard_t *dashboard,
                         uint8_t *palette_out, size_t palette_size,
                         wind_renderer_stats_t *stats);

/*
 * Expands one renderer palette row to RGB888 for display-manager streaming.
 * Expands native black, white, and red palette values to RGB888.
 */
int wind_renderer_palette_row_to_rgb(const uint8_t *palette_row, size_t width,
                                     uint8_t *rgb_row, size_t rgb_size);

#ifdef __cplusplus
}
#endif

#endif
