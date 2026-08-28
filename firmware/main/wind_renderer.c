#include "wind_renderer.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "wind_font.h"
#include "bootstrap_weather_icons.h"

#include <math.h>
#include <stdbool.h>

enum {
    CANVAS_WHITE = 255,
    CANVAS_BLACK = 0,
    PALETTE_BLACK = 0,
    PALETTE_WHITE = 1,
    PALETTE_RED = 3,
    OUTER_X = 12,
    OUTER_TOP = 12,
    OUTER_RIGHT = 787,
    OUTER_BOTTOM = 467,
    CONTENT_LEFT = 30,
    CONTENT_RIGHT = 770,
    HEADER_BOTTOM = 103,
    DAY_HEADER_BOTTOM = 138,
    GRAPH_TOP = 180,
    BAR_GRAPH_TOP = 184,
    SUSTAINED_BAR_WIDTH = 16,
    WEATHER_ROW_HEIGHT = 35,
    TEMPERATURE_ROW_HEIGHT = 35,
    COMBINED_CONDITIONS_ROW_HEIGHT = 54,
    TIDE_ROW_HEIGHT = 60,
    FORECAST_FIRST_HOUR = 8,
    FORECAST_LAST_HOUR = 20,
    TIDE_DATA_FIRST_HOUR = 5,
    TIDE_DATA_LAST_HOUR = 23,
};

typedef struct {
    int wind_baseline;
    int chart_scale_height;
    int weather_top;
    int weather_bottom;
    int weather_center;
    int temperature_top;
    int temperature_bottom;
    int tide_top;
    int tide_bottom;
    bool combined_conditions;
} dashboard_layout_t;

typedef struct {
    uint8_t *pixels;
    int clipped;
} canvas_t;

typedef enum {
    OUTPUT_PALETTE,
    OUTPUT_RGBA,
} output_format_t;

typedef enum {
    OUTPUT_BLACK,
    OUTPUT_WHITE,
    OUTPUT_RED,
} output_color_t;

typedef struct {
    uint8_t *pixels;
    output_format_t format;
} output_surface_t;

static const char *safe_text(const char *text) { return text ? text : ""; }

static int divide_rounded(int value, int divisor);

static dashboard_layout_t dashboard_layout(const wind_renderer_dashboard_t *dashboard) {
    dashboard_layout_t layout = {0};
    int cursor = OUTER_BOTTOM;
    if (dashboard->show_tide) {
        layout.tide_bottom = cursor - 1;
        cursor -= TIDE_ROW_HEIGHT;
        layout.tide_top = cursor;
    }
    if (dashboard->show_weather && dashboard->show_temperature) {
        layout.combined_conditions = true;
        cursor -= COMBINED_CONDITIONS_ROW_HEIGHT;
        layout.weather_top = cursor;
        layout.weather_bottom = cursor + 27;
        layout.weather_center = cursor + 16;
        layout.temperature_top = cursor + 28;
        layout.temperature_bottom = cursor + COMBINED_CONDITIONS_ROW_HEIGHT - 1;
    } else if (dashboard->show_temperature) {
        layout.temperature_bottom = cursor - 1;
        cursor -= TEMPERATURE_ROW_HEIGHT;
        layout.temperature_top = cursor;
    } else if (dashboard->show_weather) {
        layout.weather_bottom = cursor - 1;
        cursor -= WEATHER_ROW_HEIGHT;
        layout.weather_top = cursor;
        layout.weather_center = cursor + 18;
    }
    layout.wind_baseline = cursor - 8;
    layout.chart_scale_height = layout.wind_baseline - BAR_GRAPH_TOP;
    return layout;
}

static int clamp_int(int value, int low, int high) {
    if (value < low) return low;
    if (value > high) return high;
    return value;
}

static int day_column_x(int day) {
    return OUTER_X +
           (OUTER_RIGHT - OUTER_X) * day / WIND_RENDERER_DAY_COUNT;
}

static int forecast_sample_center_x(int day, int sample) {
    const int column_width = day_column_x(day + 1) - day_column_x(day);
    const int sample_step =
        (column_width + (WIND_RENDERER_SAMPLES_PER_DAY + 1) / 2) /
        (WIND_RENDERER_SAMPLES_PER_DAY + 1);
    return day_column_x(day) + (sample + 1) * sample_step;
}

static int tide_hour_x(int day, int hour) {
    /* The forecast centers are the time axis: 08:00 and 20:00 therefore
     * share exactly the same pixels as the first and last wind samples. */
    const int first_x = forecast_sample_center_x(day, 0);
    const int last_x = forecast_sample_center_x(
        day, WIND_RENDERER_SAMPLES_PER_DAY - 1);
    return first_x + divide_rounded(
        (hour - FORECAST_FIRST_HOUR) * (last_x - first_x),
        FORECAST_LAST_HOUR - FORECAST_FIRST_HOUR);
}

static int text_fits(const char *text, size_t capacity) {
    return !text || memchr(text, '\0', capacity) != NULL;
}

static int copy_bounded_text(char *destination, size_t capacity,
                             const char *source) {
    const char *text = safe_text(source);
    if (!destination || capacity == 0 || !text_fits(text, capacity)) return -1;
    const size_t length = strlen(text);
    memcpy(destination, text, length + 1);
    return 0;
}

static int dashboard_valid(const wind_renderer_dashboard_t *dashboard) {
    if (!dashboard ||
        dashboard->state < WIND_RENDERER_FRESH ||
        dashboard->state > WIND_RENDERER_UNAVAILABLE ||
        (dashboard->refresh_failed != 0 && dashboard->refresh_failed != 1) ||
        dashboard->age_hours < 0 ||
        dashboard->battery_percent < -1 || dashboard->battery_percent > 100 ||
        dashboard->display_mode < WIND_RENDERER_MODE_BACKGROUND_FADE ||
        dashboard->display_mode >= WIND_RENDERER_MODE_COUNT ||
        dashboard->threshold_kt < WIND_RENDERER_MIN_THRESHOLD_KT ||
        dashboard->threshold_kt > WIND_RENDERER_MAX_THRESHOLD_KT ||
        (dashboard->show_weather != 0 && dashboard->show_weather != 1) ||
        (dashboard->show_temperature != 0 && dashboard->show_temperature != 1) ||
        (dashboard->show_tide != 0 && dashboard->show_tide != 1) ||
        (dashboard->use_24_hour != 0 && dashboard->use_24_hour != 1) ||
        (dashboard->temperature_fahrenheit != 0 &&
         dashboard->temperature_fahrenheit != 1) ||
        (dashboard->tide_available != 0 && dashboard->tide_available != 1) ||
        dashboard->tide_sample_count < 0 ||
        dashboard->tide_sample_count > WIND_RENDERER_MAX_TIDE_SAMPLES ||
        !text_fits(dashboard->spot_name, WIND_RENDERER_SPOT_NAME_CAPACITY) ||
        !text_fits(dashboard->coordinates, WIND_RENDERER_COORDINATES_CAPACITY) ||
        !text_fits(dashboard->provider, WIND_RENDERER_PROVIDER_CAPACITY) ||
        !text_fits(dashboard->updated_time, WIND_RENDERER_UPDATED_TIME_CAPACITY)) {
        return 0;
    }
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        if (!text_fits(dashboard->days[day].day,
                       WIND_RENDERER_DAY_LABEL_CAPACITY) ||
            !text_fits(dashboard->days[day].date,
                       WIND_RENDERER_DATE_LABEL_CAPACITY)) {
            return 0;
        }
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            const wind_renderer_sample_t *slot = &dashboard->days[day].samples[sample];
            if ((slot->available != 0 && slot->available != 1) ||
                slot->weather < WIND_RENDERER_WEATHER_UNAVAILABLE ||
                slot->weather > WIND_RENDERER_WEATHER_HEAVY_RAIN ||
                (slot->temperature_available != 0 && slot->temperature_available != 1) ||
                !text_fits(slot->time, WIND_RENDERER_TIME_LABEL_CAPACITY) ||
                (slot->available && (!slot->time || !slot->time[0]))) {
                return 0;
            }
        }
    }
    for (int index = 0; index < dashboard->tide_sample_count; ++index) {
        const wind_renderer_tide_sample_t *sample = &dashboard->tide_samples[index];
        if ((sample->available != 0 && sample->available != 1) ||
            sample->day_index < 0 || sample->day_index >= WIND_RENDERER_DAY_COUNT ||
            sample->local_hour < 0 || sample->local_hour > 23) return 0;
    }
    if (dashboard->tide_available && dashboard->tide_sample_count < 2) return 0;
    return 1;
}

static void set_pixel(canvas_t *canvas, int x, int y, uint8_t gray) {
    if (x < 0 || x >= WIND_RENDERER_WIDTH || y < 0 || y >= WIND_RENDERER_HEIGHT) {
        canvas->clipped++;
        return;
    }
    canvas->pixels[y * WIND_RENDERER_WIDTH + x] = gray;
}

static void fill_rect(canvas_t *canvas, int x, int y, int width, int height,
                      uint8_t gray) {
    if (width <= 0 || height <= 0) return;
    if (x < 0 || y < 0 || x + width > WIND_RENDERER_WIDTH ||
        y + height > WIND_RENDERER_HEIGHT) {
        canvas->clipped++;
        return;
    }
    for (int row = y; row < y + height; ++row)
        memset(canvas->pixels + row * WIND_RENDERER_WIDTH + x, gray, (size_t)width);
}

static const uint8_t BAYER8[8][8] = {
    { 0, 48, 12, 60,  3, 51, 15, 63},
    {32, 16, 44, 28, 35, 19, 47, 31},
    { 8, 56,  4, 52, 11, 59,  7, 55},
    {40, 24, 36, 20, 43, 27, 39, 23},
    { 2, 50, 14, 62,  1, 49, 13, 61},
    {34, 18, 46, 30, 33, 17, 45, 29},
    {10, 58,  6, 54,  9, 57,  5, 53},
    {42, 26, 38, 22, 41, 25, 37, 21},
};

static bool dither_pixel_is_black(int x, int y, int density) {
    if (density >= 100) return true;
    if (density <= 0) return false;
    return BAYER8[y & 7][x & 7] * 100 < density * 64;
}

static void draw_low_wind_background(canvas_t *canvas, bool clean_preview,
                                     const dashboard_layout_t *layout) {
    const int y_20kt = layout->wind_baseline - 20 * layout->chart_scale_height / 40;
    const int y_15kt = layout->wind_baseline - 15 * layout->chart_scale_height / 40;
    const int fade_height = y_15kt - y_20kt;
    for (int py = y_20kt; py < layout->wind_baseline + 8; ++py) {
        const int density = py >= y_15kt
                                ? 12
                                : (py - y_20kt) * 12 / fade_height;
        for (int px = OUTER_X + 1; px < OUTER_RIGHT; ++px) {
            if (clean_preview) {
                set_pixel(canvas, px, py,
                          (uint8_t)(CANVAS_WHITE - density * CANVAS_WHITE / 100));
            } else if (dither_pixel_is_black(px, py, density)) {
                set_pixel(canvas, px, py, CANVAS_BLACK);
            }
        }
    }
}

static void horizontal_line(canvas_t *canvas, int x0, int x1, int y,
                            uint8_t gray) {
    if (x1 < x0) {
        const int swap = x0;
        x0 = x1;
        x1 = swap;
    }
    fill_rect(canvas, x0, y, x1 - x0 + 1, 1, gray);
}

static void vertical_line(canvas_t *canvas, int x, int y0, int y1,
                          uint8_t gray) {
    if (y1 < y0) {
        const int swap = y0;
        y0 = y1;
        y1 = swap;
    }
    for (int y = y0; y <= y1; ++y) set_pixel(canvas, x, y, gray);
}

static void outline_rect(canvas_t *canvas, int x, int y, int width, int height) {
    horizontal_line(canvas, x, x + width - 1, y, CANVAS_BLACK);
    horizontal_line(canvas, x, x + width - 1, y + height - 1, CANVAS_BLACK);
    vertical_line(canvas, x, y, y + height - 1, CANVAS_BLACK);
    vertical_line(canvas, x + width - 1, y, y + height - 1, CANVAS_BLACK);
}

static void draw_text(canvas_t *canvas, int x, int baseline,
                      wind_font_family_t family, int size, const char *text) {
    wind_font_draw(canvas->pixels, WIND_RENDERER_WIDTH, WIND_RENDERER_HEIGHT,
                   WIND_RENDERER_WIDTH, x, baseline, family, size, CANVAS_BLACK,
                   safe_text(text));
}

static void fade_region_to_white(canvas_t *canvas, int left, int top,
                                 int right, int bottom) {
    left = clamp_int(left, 0, WIND_RENDERER_WIDTH - 1);
    right = clamp_int(right, 0, WIND_RENDERER_WIDTH - 1);
    top = clamp_int(top, 0, WIND_RENDERER_HEIGHT - 1);
    bottom = clamp_int(bottom, 0, WIND_RENDERER_HEIGHT - 1);
    if (right <= left || bottom < top) return;

    const int span = right - left;
    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            const int linear = (x - left) * 255 / span;
            const int fade = (linear * linear * (765 - 2 * linear) + 32512) /
                             65025;
            uint8_t *pixel = &canvas->pixels[y * WIND_RENDERER_WIDTH + x];
            *pixel = (uint8_t)((int)*pixel +
                               ((CANVAS_WHITE - (int)*pixel) * fade + 127) /
                                   255);
        }
    }
}

static int rightmost_ink_pixel(const canvas_t *canvas, int left, int top,
                               int right, int bottom) {
    left = clamp_int(left, 0, WIND_RENDERER_WIDTH - 1);
    right = clamp_int(right, 0, WIND_RENDERER_WIDTH - 1);
    top = clamp_int(top, 0, WIND_RENDERER_HEIGHT - 1);
    bottom = clamp_int(bottom, 0, WIND_RENDERER_HEIGHT - 1);
    for (int x = right; x >= left; --x) {
        for (int y = top; y <= bottom; ++y) {
            if (canvas->pixels[y * WIND_RENDERER_WIDTH + x] < CANVAS_WHITE)
                return x;
        }
    }
    return left;
}

static void draw_text_color(canvas_t *canvas, int x, int baseline,
                            wind_font_family_t family, int size, uint8_t gray,
                            const char *text) {
    wind_font_draw(canvas->pixels, WIND_RENDERER_WIDTH, WIND_RENDERER_HEIGHT,
                   WIND_RENDERER_WIDTH, x, baseline, family, size, gray,
                   safe_text(text));
}

static void draw_outlined_text_center(canvas_t *canvas, int center_x,
                                      int baseline, wind_font_family_t family,
                                      int size, const char *text) {
    const wind_text_metrics_t metrics =
        wind_font_measure(family, size, safe_text(text));
    const int x = center_x - metrics.width / 2;
    for (int dy = -2; dy <= 2; ++dy) {
        for (int dx = -2; dx <= 2; ++dx) {
            if ((dx == 0 && dy == 0) || dx * dx + dy * dy > 4) continue;
            draw_text_color(canvas, x + dx, baseline + dy, family, size,
                            CANVAS_WHITE, text);
        }
    }
    draw_text(canvas, x, baseline, family, size, text);
}

static void draw_text_right(canvas_t *canvas, int right, int baseline,
                            wind_font_family_t family, int size,
                            const char *text) {
    const wind_text_metrics_t metrics =
        wind_font_measure(family, size, safe_text(text));
    draw_text(canvas, right - metrics.width + 1, baseline, family, size, text);
}

static int triangle_edge(int ax, int ay, int bx, int by, int px, int py) {
    return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

static void fill_triangle(canvas_t *canvas,
                          int ax, int ay, int bx, int by, int cx, int cy) {
    const int min_x = clamp_int(ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
                                0, WIND_RENDERER_WIDTH - 1);
    const int max_x = clamp_int(ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
                                0, WIND_RENDERER_WIDTH - 1);
    const int min_y = clamp_int(ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
                                0, WIND_RENDERER_HEIGHT - 1);
    const int max_y = clamp_int(ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy),
                                0, WIND_RENDERER_HEIGHT - 1);
    for (int y = min_y; y <= max_y; ++y) {
        for (int x = min_x; x <= max_x; ++x) {
            const int e0 = triangle_edge(ax, ay, bx, by, x, y);
            const int e1 = triangle_edge(bx, by, cx, cy, x, y);
            const int e2 = triangle_edge(cx, cy, ax, ay, x, y);
            if ((e0 >= 0 && e1 >= 0 && e2 >= 0) ||
                (e0 <= 0 && e1 <= 0 && e2 <= 0))
                set_pixel(canvas, x, y, CANVAS_BLACK);
        }
    }
}

static void draw_arrow(canvas_t *canvas, int center_x, int center_y,
                       int destination_degrees) {
    /* Exact Figma navigation-arrow silhouette, node 371:2786.
       The four points are the tip, left tail, concave notch, and right tail. */
    static const float source[4][2] = {
        {0.0f, -7.5f}, {-6.5f, 6.5f}, {0.0f, 3.2f}, {6.5f, 6.5f},
    };
    int degrees = destination_degrees % 360;
    if (degrees < 0) degrees += 360;
    const float radians = (float) degrees * 0.01745329252f;
    const float sine = sinf(radians);
    const float cosine = cosf(radians);
    int points[4][2];
    for (int point = 0; point < 4; ++point) {
        points[point][0] = center_x +
            (int) lroundf(source[point][0] * cosine - source[point][1] * sine);
        points[point][1] = center_y +
            (int) lroundf(source[point][0] * sine + source[point][1] * cosine);
    }
    fill_triangle(canvas,
                  points[0][0], points[0][1],
                  points[1][0], points[1][1],
                  points[2][0], points[2][1]);
    fill_triangle(canvas,
                  points[0][0], points[0][1],
                  points[2][0], points[2][1],
                  points[3][0], points[3][1]);
}

static void draw_alpha_icon(canvas_t *canvas, int center_x, int center_y,
                            int width, int height, const uint8_t *alpha)
{
    const int left = center_x - width / 2;
    const int top = center_y - height / 2;
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const uint8_t opacity = alpha[y * width + x];
            if (!opacity) continue;
            const int pixel_x = left + x;
            const int pixel_y = top + y;
            const uint8_t background =
                canvas->pixels[pixel_y * WIND_RENDERER_WIDTH + pixel_x];
            set_pixel(canvas, pixel_x, pixel_y,
                      (uint8_t) ((background * (255 - opacity) + 127) / 255));
        }
    }
}

static void draw_weather(canvas_t *canvas, int center_x, int center_y,
                         wind_renderer_weather_t weather)
{
    switch (weather) {
        case WIND_RENDERER_WEATHER_CLEAR_DAY:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_SUN_18);
            break;
        case WIND_RENDERER_WEATHER_CLEAR_NIGHT:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_MOON_18);
            break;
        case WIND_RENDERER_WEATHER_PARTLY_CLOUDY_DAY:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_CLOUD_SUN_18);
            break;
        case WIND_RENDERER_WEATHER_PARTLY_CLOUDY_NIGHT:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_CLOUD_MOON_18);
            break;
        case WIND_RENDERER_WEATHER_CLOUDY:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_CLOUD_18);
            break;
        case WIND_RENDERER_WEATHER_LIGHT_RAIN:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_CLOUD_DRIZZLE_18);
            break;
        case WIND_RENDERER_WEATHER_RAIN:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_CLOUD_RAIN_18);
            break;
        case WIND_RENDERER_WEATHER_HEAVY_RAIN:
            draw_alpha_icon(canvas, center_x, center_y, 18, 18,
                            BOOTSTRAP_CLOUD_RAIN_HEAVY_18);
            break;
        default:
            break;
    }
}

static void draw_sample(canvas_t *canvas, int center_x,
                        const wind_renderer_sample_t *sample,
                        const dashboard_layout_t *layout) {
    char value[12];
    if (!sample->available) {
        const wind_text_metrics_t missing = wind_font_measure(
            WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
            WIND_FONT_SIZE_STATUS, "--");
        draw_text(canvas, center_x - missing.width / 2, layout->wind_baseline,
                  WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                  WIND_FONT_SIZE_STATUS, "--");
        return;
    }

    draw_arrow(canvas, center_x, 158, sample->destination_degrees);

    const int sustained = clamp_int(sample->sustained_kt, 0, 40);
    const int gust = clamp_int(sample->gust_kt, 0, 40);
    const int sustained_height = sustained * layout->chart_scale_height / 40;
    const int sustained_y = layout->wind_baseline - sustained_height;
    const int gust_y = layout->wind_baseline - gust * layout->chart_scale_height / 40;
    fill_rect(canvas, center_x - SUSTAINED_BAR_WIDTH / 2,
              sustained_y, SUSTAINED_BAR_WIDTH, sustained_height,
              CANVAS_BLACK);
    const int gust_gap = (gust - sustained) * layout->chart_scale_height / 40;
    if (gust > sustained && gust_gap >= 6)
        horizontal_line(canvas, center_x - 8, center_x + 7, gust_y, CANVAS_BLACK);

    snprintf(value, sizeof(value), "%d", clamp_int(sample->sustained_kt, 0, 999));
    const int label_baseline = clamp_int(
        sustained_y - 5,
        layout->wind_baseline - layout->chart_scale_height - 4,
        layout->wind_baseline - 5);
    draw_outlined_text_center(canvas, center_x, label_baseline,
                              WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                              WIND_FONT_SIZE_STATUS, value);
}

static void draw_temperature(canvas_t *canvas, int center_x,
                             int row_top, int row_bottom,
                             const wind_renderer_sample_t *sample,
                             int temperature_fahrenheit) {
    if (!sample->temperature_available) return;
    char value[12];
    const int whole_degrees = temperature_fahrenheit
        ? divide_rounded(sample->temperature_tenths_c * 9, 50) + 32
        : divide_rounded(sample->temperature_tenths_c, 10);
    snprintf(value, sizeof(value), "%d°", whole_degrees);
    const wind_text_metrics_t value_metrics = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED, WIND_FONT_SIZE_STATUS, value);
    const int row_height = row_bottom - row_top + 1;
    const int baseline = row_top +
        (row_height + value_metrics.ascent - value_metrics.descent) / 2;
    draw_text(canvas, center_x - value_metrics.width / 2, baseline,
              WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED, WIND_FONT_SIZE_STATUS,
              value);
}

static void draw_line(canvas_t *canvas, int x0, int y0, int x1, int y1) {
    int dx = abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    int dy = -abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    int error = dx + dy;
    for (;;) {
        set_pixel(canvas, x0, y0, CANVAS_BLACK);
        if (x0 == x1 && y0 == y1) break;
        const int doubled = 2 * error;
        if (doubled >= dy) { error += dy; x0 += sx; }
        if (doubled <= dx) { error += dx; y0 += sy; }
    }
}

static void draw_tide_curve(canvas_t *canvas, const int *point_x,
                            const int *point_y, int point_count,
                            int clip_left, int clip_right,
                            int curve_top, int curve_bottom) {
    for (int segment = 0; segment + 1 < point_count; ++segment) {
        const int x0 = point_x[segment];
        const int x1 = point_x[segment + 1];
        if (x1 <= x0 || x1 < clip_left || x0 > clip_right) continue;

        const int first_x = clamp_int(clip_left, x0, x1);
        const int last_x = clamp_int(clip_right, x0, x1);
        const float segment_width = (float) (x1 - x0);
        const float start_slope = segment == 0
            ? (float) (point_y[segment + 1] - point_y[segment]) /
                  segment_width
            : (float) (point_y[segment + 1] - point_y[segment - 1]) /
                  (float) (point_x[segment + 1] - point_x[segment - 1]);
        const float end_slope = segment + 2 >= point_count
            ? (float) (point_y[segment + 1] - point_y[segment]) /
                  segment_width
            : (float) (point_y[segment + 2] - point_y[segment]) /
                  (float) (point_x[segment + 2] - point_x[segment]);

        int previous_x = first_x;
        int previous_y = point_y[segment];
        for (int x = first_x; x <= last_x; ++x) {
            const float t = (float) (x - x0) / segment_width;
            const float t2 = t * t;
            const float t3 = t2 * t;
            const float h00 = 2.0f * t3 - 3.0f * t2 + 1.0f;
            const float h10 = t3 - 2.0f * t2 + t;
            const float h01 = -2.0f * t3 + 3.0f * t2;
            const float h11 = t3 - t2;
            const int y = clamp_int(
                (int) lroundf(
                    h00 * point_y[segment] +
                    h10 * segment_width * start_slope +
                    h01 * point_y[segment + 1] +
                    h11 * segment_width * end_slope),
                curve_top, curve_bottom);
            if (x == first_x) {
                previous_y = y;
            } else {
                draw_line(canvas, previous_x, previous_y, x, y);
            }
            previous_x = x;
            previous_y = y;
        }
    }
}

static void draw_tide(canvas_t *canvas, const wind_renderer_dashboard_t *dashboard,
                      const dashboard_layout_t *layout) {
    if (!dashboard->tide_available || dashboard->tide_sample_count < 2) return;

    const int curve_top = layout->tide_top + 25;
    const int curve_bottom = layout->tide_bottom - 25;
    const int curve_middle = (curve_top + curve_bottom) / 2;

    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        int points[WIND_RENDERER_MAX_TIDE_SAMPLES] = {0};
        int point_x[WIND_RENDERER_MAX_TIDE_SAMPLES] = {0};
        int point_y[WIND_RENDERER_MAX_TIDE_SAMPLES] = {0};
        int point_count = 0;
        int minimum = 0;
        int maximum = 0;

        /* Select in local-hour order so renderer output does not depend on
         * provider ordering. Hours outside the forecast labels are real,
         * visible curve data for the left and right margins. */
        for (int hour = TIDE_DATA_FIRST_HOUR;
             hour <= TIDE_DATA_LAST_HOUR; ++hour) {
            for (int index = 0; index < dashboard->tide_sample_count; ++index) {
                const wind_renderer_tide_sample_t *sample =
                    &dashboard->tide_samples[index];
                if (!sample->available || sample->day_index != day ||
                    sample->local_hour != hour) {
                    continue;
                }

                points[point_count] = index;
                point_x[point_count] = tide_hour_x(day, hour);
                if (point_count == 0)
                    minimum = maximum = sample->sea_level_mm;
                if (sample->sea_level_mm < minimum)
                    minimum = sample->sea_level_mm;
                if (sample->sea_level_mm > maximum)
                    maximum = sample->sea_level_mm;
                point_count++;
                break;
            }
        }
        if (point_count < 2) continue;

        const int range = maximum - minimum;
        for (int position = 0; position < point_count; ++position) {
            const int value =
                dashboard->tide_samples[points[position]].sea_level_mm;
            point_y[position] = range == 0
                ? curve_middle
                : curve_bottom - divide_rounded(
                      (value - minimum) * (curve_bottom - curve_top), range);
        }

        int extrema[WIND_RENDERER_MAX_TIDE_SAMPLES] = {0};
        bool extrema_is_high[WIND_RENDERER_MAX_TIDE_SAMPLES] = {false};
        int extrema_count = 0;
        const int turn_threshold =
            clamp_int((maximum - minimum) / 10, 10, 500);
        int direction = 0;
        int high_candidate = 0;
        int low_candidate = 0;

        for (int position = 1; position < point_count; ++position) {
            const int value =
                dashboard->tide_samples[points[position]].sea_level_mm;
            if (direction >= 0 &&
                value >= dashboard->tide_samples[
                             points[high_candidate]].sea_level_mm) {
                high_candidate = position;
            }
            if (direction <= 0 &&
                value <= dashboard->tide_samples[
                             points[low_candidate]].sea_level_mm) {
                low_candidate = position;
            }

            if (direction == 0) {
                if (value - dashboard->tide_samples[
                                points[low_candidate]].sea_level_mm >=
                    turn_threshold) {
                    if (low_candidate > 0) {
                        extrema[extrema_count] = low_candidate;
                        extrema_is_high[extrema_count++] = false;
                    }
                    direction = 1;
                    high_candidate = position;
                } else if (
                    dashboard->tide_samples[
                        points[high_candidate]].sea_level_mm - value >=
                    turn_threshold) {
                    if (high_candidate > 0) {
                        extrema[extrema_count] = high_candidate;
                        extrema_is_high[extrema_count++] = true;
                    }
                    direction = -1;
                    low_candidate = position;
                }
            } else if (
                direction > 0 &&
                dashboard->tide_samples[
                    points[high_candidate]].sea_level_mm - value >=
                    turn_threshold) {
                extrema[extrema_count] = high_candidate;
                extrema_is_high[extrema_count++] = true;
                direction = -1;
                low_candidate = position;
            } else if (
                direction < 0 &&
                value - dashboard->tide_samples[
                            points[low_candidate]].sea_level_mm >=
                    turn_threshold) {
                extrema[extrema_count] = low_candidate;
                extrema_is_high[extrema_count++] = false;
                direction = 1;
                high_candidate = position;
            }
        }

        if (extrema_count > 0) {
            const int previous = extrema[extrema_count - 1];
            if (direction > 0 && high_candidate > previous &&
                high_candidate < point_count - 1) {
                extrema[extrema_count] = high_candidate;
                extrema_is_high[extrema_count++] = true;
            } else if (direction < 0 && low_candidate > previous &&
                       low_candidate < point_count - 1) {
                extrema[extrema_count] = low_candidate;
                extrema_is_high[extrema_count++] = false;
            }
        }

        const int first_x = day_column_x(day) + 1;
        const int last_x = day_column_x(day + 1) - 1;
        draw_tide_curve(canvas, point_x, point_y, point_count,
                        first_x, last_x, curve_top, curve_bottom);

        for (int extremum = 0; extremum < extrema_count; ++extremum) {
            const int position = extrema[extremum];
            const int index = points[position];
            const bool is_high = extrema_is_high[extremum];

            char time[8];
            const int hour = dashboard->tide_samples[index].local_hour;
            if (hour < FORECAST_FIRST_HOUR || hour > FORECAST_LAST_HOUR)
                continue;
            if (dashboard->use_24_hour) {
                snprintf(time, sizeof(time), "%02d:00", hour);
            } else {
                const int hour_12 = hour % 12 == 0 ? 12 : hour % 12;
                snprintf(time, sizeof(time), "%d%s", hour_12,
                         hour < 12 ? "AM" : "PM");
            }

            const wind_text_metrics_t metrics = wind_font_measure(
                WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                WIND_FONT_SIZE_STATUS, time);
            const int label_margin = metrics.width / 2 + 10;
            const int label_center = clamp_int(
                point_x[position],
                day_column_x(day) + label_margin,
                day_column_x(day + 1) - label_margin);
            const int extremum_y = point_y[position];
            /* Both labels share the same optical shift so their outside
             * margins read equally against the top and bottom borders. */
            const int baseline = clamp_int(
                is_high ? extremum_y - 3 : extremum_y + 16,
                layout->tide_top + 14,
                layout->tide_bottom - 5);
            draw_outlined_text_center(
                canvas, label_center, baseline,
                WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                WIND_FONT_SIZE_STATUS, time);
        }
    }
}

static void build_status(const wind_renderer_dashboard_t *dashboard,
                         char *model, size_t model_size, char *update,
                         size_t update_size) {
    const char *provider = safe_text(dashboard->provider);
    const char *updated = safe_text(dashboard->updated_time);
    if (dashboard->state == WIND_RENDERER_UNAVAILABLE) {
        snprintf(model, model_size, "/// UNAVAILABLE");
    } else if (dashboard->state == WIND_RENDERER_STALE) {
        snprintf(model, model_size, "/// %s / STALE %dh", provider,
                 dashboard->age_hours);
    } else if (dashboard->refresh_failed) {
        snprintf(model, model_size, "/// %s / OFFLINE", provider);
    } else if (dashboard->state == WIND_RENDERER_AGED) {
        snprintf(model, model_size, "/// %s / AGED %dh", provider,
                 dashboard->age_hours);
    } else {
        snprintf(model, model_size, "/// %s", provider);
    }
    snprintf(update, update_size, ">> %s", updated);
}

static void draw_wind_reference_lines(canvas_t *canvas, const dashboard_layout_t *layout) {
    const int graph_height = layout->wind_baseline - GRAPH_TOP;
    for (int knots = 5; knots <= 40; knots += 5) {
        const int y = layout->wind_baseline -
                      (knots * graph_height + 20) / 40;
        for (int x = OUTER_X; x <= OUTER_RIGHT; x += 7) {
            horizontal_line(canvas, x, x, y, CANVAS_BLACK);
        }
        horizontal_line(canvas, OUTER_RIGHT, OUTER_RIGHT, y, CANVAS_BLACK);
    }
}

static void draw_battery(canvas_t *canvas, int right, int center_y,
                         int percent) {
    const int body_width = 21;
    const int body_height = 11;
    const int x = right - body_width - 2;
    const int y = center_y - body_height / 2;
    outline_rect(canvas, x, y, body_width, body_height);
    fill_rect(canvas, right - 1, center_y - 2, 2, 5, CANVAS_BLACK);
    if (percent >= 0) {
        const int fill = clamp_int(percent, 0, 100) * (body_width - 4) / 100;
        fill_rect(canvas, x + 2, y + 2, fill, body_height - 4, CANVAS_BLACK);
    }
}

static void split_coordinates(const char *coordinates, char *first,
                              size_t first_size, char *second,
                              size_t second_size) {
    const char *text = safe_text(coordinates);
    const char *space = strchr(text, ' ');
    if (!space) {
        snprintf(first, first_size, "%s", text);
        second[0] = '\0';
        return;
    }
    const size_t first_length = (size_t)(space - text);
    const size_t copied = first_length < first_size - 1 ? first_length : first_size - 1;
    memcpy(first, text, copied);
    first[copied] = '\0';
    snprintf(second, second_size, "%s", space + 1);
}

static int divide_rounded(int value, int divisor) {
    if (value >= 0) return (value + divisor / 2) / divisor;
    return -((-value + divisor / 2) / divisor);
}

static int dither_once(uint8_t *luma, uint8_t *palette) {
    int *current = (int *)calloc((size_t)WIND_RENDERER_WIDTH + 2u, sizeof(int));
    int *next = (int *)calloc((size_t)WIND_RENDERER_WIDTH + 2u, sizeof(int));
    if (!current || !next) {
        free(current);
        free(next);
        return -1;
    }

    for (int y = 0; y < WIND_RENDERER_HEIGHT; ++y) {
        memset(next, 0, ((size_t)WIND_RENDERER_WIDTH + 2u) * sizeof(int));
        for (int x = 0; x < WIND_RENDERER_WIDTH; ++x) {
            const int index = y * WIND_RENDERER_WIDTH + x;
            const int adjusted = clamp_int((int)luma[index] +
                                               divide_rounded(current[x + 1], 16),
                                           0, 255);
            const int target = adjusted < 128 ? 0 : 255;
            const int error = adjusted - target;
            palette[index] = target == 0 ? PALETTE_BLACK : PALETTE_WHITE;
            current[x + 2] += error * 7;
            next[x] += error * 3;
            next[x + 1] += error * 5;
            next[x + 2] += error;
        }
        int *swap = current;
        current = next;
        next = swap;
    }
    free(current);
    free(next);
    return 0;
}

static void set_output_pixel(output_surface_t *output, int index,
                             output_color_t color) {
    if (output->format == OUTPUT_PALETTE) {
        output->pixels[index] = color == OUTPUT_BLACK
                                    ? PALETTE_BLACK
                                    : color == OUTPUT_WHITE ? PALETTE_WHITE
                                                            : PALETTE_RED;
        return;
    }
    const int offset = index * 4;
    output->pixels[offset] = color == OUTPUT_BLACK ? 0 : 255;
    output->pixels[offset + 1] = color == OUTPUT_RED || color == OUTPUT_BLACK
                                     ? 0
                                     : 255;
    output->pixels[offset + 2] = color == OUTPUT_RED || color == OUTPUT_BLACK
                                     ? 0
                                     : 255;
    output->pixels[offset + 3] = 255;
}

static void apply_mask_to_output(const canvas_t *mask,
                                 output_surface_t *output, int left, int top,
                                 int right, int bottom,
                                 output_color_t color) {
    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            if (mask->pixels[y * WIND_RENDERER_WIDTH + x] < 128)
                set_output_pixel(output, y * WIND_RENDERER_WIDTH + x, color);
        }
    }
}

static void draw_output_outlined_text(canvas_t *scratch,
                                      output_surface_t *output, int x,
                                      int baseline,
                                      wind_font_family_t family, int size,
                                      const char *text,
                                      output_color_t text_color) {
    const wind_text_metrics_t metrics = wind_font_measure(family, size, text);
    const int mask_left = x - 3;
    const int mask_top = baseline - 24;
    const int mask_right = x + metrics.width + 3;
    const int mask_bottom = baseline + 4;

    memset(scratch->pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    for (int dy = -2; dy <= 2; ++dy) {
        for (int dx = -2; dx <= 2; ++dx) {
            if ((dx == 0 && dy == 0) || dx * dx + dy * dy > 4) continue;
            draw_text(scratch, x + dx, baseline + dy, family, size, text);
        }
    }
    apply_mask_to_output(scratch, output, mask_left, mask_top,
                         mask_right, mask_bottom, OUTPUT_WHITE);

    memset(scratch->pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    draw_text(scratch, x, baseline, family, size, text);
    apply_mask_to_output(scratch, output, mask_left, mask_top,
                         mask_right, mask_bottom, text_color);
}

static void draw_threshold_overlay(canvas_t *scratch,
                                   output_surface_t *output,
                                   const wind_renderer_dashboard_t *dashboard,
                                   const dashboard_layout_t *layout) {
    const int y = layout->wind_baseline -
                  dashboard->threshold_kt * layout->chart_scale_height / 40;
    const int line_left = forecast_sample_center_x(0, 0) -
                          SUSTAINED_BAR_WIDTH / 2 - 2;
    const int line_right =
                           forecast_sample_center_x(
                               WIND_RENDERER_DAY_COUNT - 1,
                               WIND_RENDERER_SAMPLES_PER_DAY - 1) +
                           SUSTAINED_BAR_WIDTH / 2 - 1 + 2;
    for (int x = line_left; x <= line_right; ++x) {
        set_output_pixel(output, (y - 1) * WIND_RENDERER_WIDTH + x,
                         OUTPUT_WHITE);
        set_output_pixel(output, y * WIND_RENDERER_WIDTH + x, OUTPUT_RED);
        set_output_pixel(output, (y + 1) * WIND_RENDERER_WIDTH + x,
                         OUTPUT_WHITE);
    }

    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            const wind_renderer_sample_t *source = &dashboard->days[day].samples[sample];
            if (!source->available) continue;
            const int center_x = forecast_sample_center_x(day, sample);
            const int sustained = clamp_int(source->sustained_kt, 0, 40);
            const int sustained_y = layout->wind_baseline -
                                    sustained * layout->chart_scale_height / 40;
            const int baseline = clamp_int(
                sustained_y - 5,
                layout->wind_baseline - layout->chart_scale_height - 4,
                layout->wind_baseline - 5);
            if (baseline - 14 > y || baseline + 3 < y) continue;

            char value[12];
            snprintf(value, sizeof(value), "%d",
                     clamp_int(source->sustained_kt, 0, 999));
            const wind_text_metrics_t metrics = wind_font_measure(
                WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                WIND_FONT_SIZE_STATUS, value);
            draw_output_outlined_text(
                scratch, output, center_x - metrics.width / 2, baseline,
                WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                WIND_FONT_SIZE_STATUS, value, OUTPUT_BLACK);
        }
    }

    char label[16];
    snprintf(label, sizeof(label), "%dKTS", dashboard->threshold_kt);
    const int baseline = y + 5;
    const wind_text_metrics_t metrics = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
        WIND_FONT_SIZE_STATUS, label);
    const int x = CONTENT_RIGHT - metrics.width + 1;
    draw_output_outlined_text(scratch, output, x, baseline,
                              WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                              WIND_FONT_SIZE_STATUS, label, OUTPUT_RED);
}

static void draw_low_battery_overlay(canvas_t *scratch,
                                     output_surface_t *output,
                                     int battery_percent) {
    if (battery_percent < 0 || battery_percent >= 10) return;
    memset(scratch->pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    draw_battery(scratch, CONTENT_RIGHT, 72, battery_percent);
    apply_mask_to_output(scratch, output, CONTENT_RIGHT - 24, 65,
                         CONTENT_RIGHT + 1, 78, OUTPUT_RED);
}

uint32_t wind_renderer_contract_version(void) {
    return WIND_RENDERER_CONTRACT_VERSION;
}

void wind_renderer_input_v2_init(wind_renderer_input_v2_t *input) {
    if (!input) return;
    memset(input, 0, sizeof(*input));
    input->version = WIND_RENDERER_CONTRACT_VERSION;
    input->battery_percent = -1;
    input->threshold_kt = WIND_RENDERER_DEFAULT_THRESHOLD_KT;
    input->show_weather = 1;
}

int wind_renderer_input_v2_set_metadata(wind_renderer_input_v2_t *input,
                                        const char *spot_name,
                                        const char *coordinates,
                                        const char *provider,
                                        const char *updated_time) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        !text_fits(safe_text(spot_name), sizeof(input->spot_name)) ||
        !text_fits(safe_text(coordinates), sizeof(input->coordinates)) ||
        !text_fits(safe_text(provider), sizeof(input->provider)) ||
        !text_fits(safe_text(updated_time), sizeof(input->updated_time))) {
        return -1;
    }
    copy_bounded_text(input->spot_name, sizeof(input->spot_name), spot_name);
    copy_bounded_text(input->coordinates, sizeof(input->coordinates), coordinates);
    copy_bounded_text(input->provider, sizeof(input->provider), provider);
    copy_bounded_text(input->updated_time, sizeof(input->updated_time), updated_time);
    return 0;
}

int wind_renderer_input_v2_set_status(wind_renderer_input_v2_t *input,
                                      wind_renderer_state_t state,
                                      int refresh_failed, int age_hours,
                                      int battery_percent,
                                      wind_renderer_display_mode_t display_mode,
                                      int threshold_kt) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        state < WIND_RENDERER_FRESH ||
        state > WIND_RENDERER_UNAVAILABLE ||
        (refresh_failed != 0 && refresh_failed != 1) || age_hours < 0 ||
        battery_percent < -1 || battery_percent > 100 ||
        display_mode < WIND_RENDERER_MODE_BACKGROUND_FADE ||
        display_mode >= WIND_RENDERER_MODE_COUNT ||
        threshold_kt < WIND_RENDERER_MIN_THRESHOLD_KT ||
        threshold_kt > WIND_RENDERER_MAX_THRESHOLD_KT) {
        return -1;
    }
    input->state = state;
    input->refresh_failed = refresh_failed;
    input->age_hours = age_hours;
    input->battery_percent = battery_percent;
    input->display_mode = display_mode;
    input->threshold_kt = threshold_kt;
    return 0;
}

int wind_renderer_input_v2_set_display_rows(wind_renderer_input_v2_t *input,
                                            int show_weather,
                                            int show_temperature,
                                            int show_tide,
                                            int tide_available) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        (show_weather != 0 && show_weather != 1) ||
        (show_temperature != 0 && show_temperature != 1) ||
        (show_tide != 0 && show_tide != 1) ||
        (tide_available != 0 && tide_available != 1)) return -1;
    input->show_weather = show_weather;
    input->show_temperature = show_temperature;
    input->show_tide = show_tide;
    input->tide_available = tide_available;
    return 0;
}

int wind_renderer_input_v2_set_preferences(wind_renderer_input_v2_t *input,
                                           int use_24_hour,
                                           int temperature_fahrenheit) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        (use_24_hour != 0 && use_24_hour != 1) ||
        (temperature_fahrenheit != 0 && temperature_fahrenheit != 1)) {
        return -1;
    }
    input->use_24_hour = use_24_hour;
    input->temperature_fahrenheit = temperature_fahrenheit;
    return 0;
}

int wind_renderer_input_v2_set_day(wind_renderer_input_v2_t *input,
                                   int day_index, const char *day,
                                   const char *date) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        day_index < 0 || day_index >= WIND_RENDERER_DAY_COUNT ||
        !text_fits(safe_text(day), sizeof(input->days[day_index].day)) ||
        !text_fits(safe_text(date), sizeof(input->days[day_index].date))) {
        return -1;
    }
    copy_bounded_text(input->days[day_index].day,
                      sizeof(input->days[day_index].day), day);
    copy_bounded_text(input->days[day_index].date,
                      sizeof(input->days[day_index].date), date);
    return 0;
}

int wind_renderer_input_v2_set_sample(wind_renderer_input_v2_t *input,
                                      int day_index, int sample_index,
                                      const char *time, int sustained_kt,
                                      int gust_kt, int destination_degrees,
                                      int available,
                                      wind_renderer_weather_t weather,
                                      int temperature_tenths_c,
                                      int temperature_available) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        day_index < 0 || day_index >= WIND_RENDERER_DAY_COUNT ||
        sample_index < 0 || sample_index >= WIND_RENDERER_SAMPLES_PER_DAY ||
        (available != 0 && available != 1) ||
        (temperature_available != 0 && temperature_available != 1) ||
        weather < WIND_RENDERER_WEATHER_UNAVAILABLE ||
        weather > WIND_RENDERER_WEATHER_HEAVY_RAIN ||
        !text_fits(safe_text(time),
                   sizeof(input->days[day_index].samples[sample_index].time)) ||
        (available && (!time || !time[0]))) {
        return -1;
    }
    wind_renderer_input_sample_v2_t *sample =
        &input->days[day_index].samples[sample_index];
    copy_bounded_text(sample->time, sizeof(sample->time), time);
    sample->sustained_kt = sustained_kt;
    sample->gust_kt = gust_kt;
    sample->destination_degrees = destination_degrees;
    sample->available = available;
    sample->weather = weather;
    sample->temperature_tenths_c = temperature_tenths_c;
    sample->temperature_available = temperature_available;
    return 0;
}

int wind_renderer_input_v2_set_tide_sample(wind_renderer_input_v2_t *input,
                                           int tide_index, int day_index,
                                           int local_hour, int sea_level_mm,
                                           int available) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        tide_index < 0 || tide_index >= WIND_RENDERER_MAX_TIDE_SAMPLES ||
        day_index < 0 || day_index >= WIND_RENDERER_DAY_COUNT ||
        local_hour < 0 || local_hour > 23 ||
        (available != 0 && available != 1)) return -1;
    input->tide_samples[tide_index] = (wind_renderer_input_tide_sample_v2_t) {
        .day_index = day_index,
        .local_hour = local_hour,
        .sea_level_mm = sea_level_mm,
        .available = available,
    };
    if (tide_index >= input->tide_sample_count)
        input->tide_sample_count = tide_index + 1;
    return 0;
}

int wind_renderer_input_v2_to_dashboard(const wind_renderer_input_v2_t *input,
                                        wind_renderer_dashboard_t *dashboard) {
    if (!input || !dashboard || input->version != WIND_RENDERER_CONTRACT_VERSION)
        return -1;

    wind_renderer_dashboard_t result = {0};
    result.spot_name = input->spot_name;
    result.coordinates = input->coordinates;
    result.provider = input->provider;
    result.updated_time = input->updated_time;
    result.state = (wind_renderer_state_t)input->state;
    result.refresh_failed = input->refresh_failed;
    result.age_hours = input->age_hours;
    result.battery_percent = input->battery_percent;
    result.display_mode = (wind_renderer_display_mode_t)input->display_mode;
    result.threshold_kt = input->threshold_kt;
    result.show_weather = input->show_weather;
    result.show_temperature = input->show_temperature;
    result.show_tide = input->show_tide;
    result.use_24_hour = input->use_24_hour;
    result.temperature_fahrenheit = input->temperature_fahrenheit;
    result.tide_available = input->tide_available;
    result.tide_sample_count = input->tide_sample_count;
    for (int index = 0; index < input->tide_sample_count; ++index) {
        result.tide_samples[index] = (wind_renderer_tide_sample_t) {
            .day_index = input->tide_samples[index].day_index,
            .local_hour = input->tide_samples[index].local_hour,
            .sea_level_mm = input->tide_samples[index].sea_level_mm,
            .available = input->tide_samples[index].available,
        };
    }
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        result.days[day].day = input->days[day].day;
        result.days[day].date = input->days[day].date;
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            const wind_renderer_input_sample_v2_t *source =
                &input->days[day].samples[sample];
            result.days[day].samples[sample] = (wind_renderer_sample_t) {
                .time = source->time,
                .sustained_kt = source->sustained_kt,
                .gust_kt = source->gust_kt,
                .destination_degrees = source->destination_degrees,
                .available = source->available,
                .weather = (wind_renderer_weather_t)source->weather,
                .temperature_tenths_c = source->temperature_tenths_c,
                .temperature_available = source->temperature_available,
            };
        }
    }
    if (!dashboard_valid(&result)) return -2;
    *dashboard = result;
    return 0;
}

int wind_renderer_input_v2_render(const wind_renderer_input_v2_t *input,
                                  uint8_t *palette_out, size_t palette_size,
                                  wind_renderer_stats_t *stats) {
    wind_renderer_dashboard_t dashboard;
    if (wind_renderer_input_v2_to_dashboard(input, &dashboard) != 0) return -1;
    return wind_renderer_render(&dashboard, palette_out, palette_size, stats);
}

int wind_renderer_input_v2_render_preview_rgba(
    const wind_renderer_input_v2_t *input, uint8_t *rgba_out,
    size_t rgba_size, wind_renderer_stats_t *stats) {
    wind_renderer_dashboard_t dashboard;
    if (wind_renderer_input_v2_to_dashboard(input, &dashboard) != 0) return -1;
    return wind_renderer_render_preview_rgba(&dashboard, rgba_out, rgba_size,
                                             stats);
}

int wind_renderer_palette_row_to_rgb(const uint8_t *palette_row, size_t width,
                                     uint8_t *rgb_row, size_t rgb_size) {
    if (!palette_row || !rgb_row || width == 0 || width > rgb_size / 3)
        return -1;
    for (size_t x = 0; x < width; ++x)
        if (palette_row[x] != PALETTE_BLACK &&
            palette_row[x] != PALETTE_WHITE &&
            palette_row[x] != PALETTE_RED)
            return -2;
    for (size_t x = 0; x < width; ++x) {
        const bool is_white = palette_row[x] == PALETTE_WHITE;
        const bool is_red = palette_row[x] == PALETTE_RED;
        rgb_row[x * 3] = (is_white || is_red) ? 255 : 0;
        rgb_row[x * 3 + 1] = is_white ? 255 : 0;
        rgb_row[x * 3 + 2] = is_white ? 255 : 0;
    }
    return 0;
}

static int render_dashboard(const wind_renderer_dashboard_t *dashboard,
                            uint8_t *output_pixels, size_t output_size,
                            output_format_t output_format,
                            wind_renderer_stats_t *stats) {
    const size_t required_size = output_format == OUTPUT_PALETTE
                                     ? WIND_RENDERER_PALETTE_BYTES
                                     : WIND_RENDERER_RGBA_BYTES;
    if (!dashboard || !output_pixels || output_size < required_size)
        return -1;
    if (!dashboard_valid(dashboard)) return -3;

    canvas_t canvas = {0};
    canvas.pixels = (uint8_t *)malloc(WIND_RENDERER_PALETTE_BYTES);
    if (!canvas.pixels) return -2;
    memset(canvas.pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    if (stats) memset(stats, 0, sizeof(*stats));
    const dashboard_layout_t layout = dashboard_layout(dashboard);

    outline_rect(&canvas, OUTER_X, OUTER_TOP, OUTER_RIGHT - OUTER_X + 1,
                 OUTER_BOTTOM - OUTER_TOP + 1);
    horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, HEADER_BOTTOM, CANVAS_BLACK);

    char model[64];
    char update[32];
    build_status(dashboard, model, sizeof(model), update, sizeof(update));

    if (dashboard->display_mode == WIND_RENDERER_MODE_BACKGROUND_FADE)
        draw_low_wind_background(&canvas, output_format == OUTPUT_RGBA, &layout);
    draw_wind_reference_lines(&canvas, &layout);

    const int header_text_right = 565;
    const int header_width = header_text_right - CONTENT_LEFT + 1;
    char coordinate_first[64];
    char coordinate_second[64];
    split_coordinates(dashboard->coordinates, coordinate_first,
                      sizeof(coordinate_first), coordinate_second,
                      sizeof(coordinate_second));
    const wind_text_metrics_t name_metrics = wind_font_measure(
        WIND_FONT_INTER, WIND_FONT_SIZE_SPOT, safe_text(dashboard->spot_name));
    const wind_text_metrics_t coordinate_first_metrics = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_STATUS, coordinate_first);
    const wind_text_metrics_t coordinate_second_metrics = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_STATUS, coordinate_second);
    const int coordinate_width = coordinate_first_metrics.width > coordinate_second_metrics.width
                                     ? coordinate_first_metrics.width
                                     : coordinate_second_metrics.width;
    const int coordinates_included = *safe_text(dashboard->coordinates) &&
        name_metrics.width + 20 + coordinate_width <= header_width;
    draw_text(&canvas, CONTENT_LEFT, 78, WIND_FONT_INTER, WIND_FONT_SIZE_SPOT,
              safe_text(dashboard->spot_name));
    if (name_metrics.width > header_width) {
        const int fade_width = 240;
        const int name_top = 78 - name_metrics.ascent;
        const int name_bottom = 78 + name_metrics.descent;
        const int ink_right = rightmost_ink_pixel(
            &canvas, CONTENT_LEFT, name_top, header_text_right, name_bottom);
        fade_region_to_white(&canvas,
                             clamp_int(ink_right - fade_width + 1,
                                       CONTENT_LEFT, ink_right),
                             name_top, ink_right, name_bottom);
        fill_rect(&canvas, header_text_right + 1, name_top,
                  OUTER_RIGHT - header_text_right - 1,
                  name_bottom - name_top + 1, CANVAS_WHITE);
        fill_rect(&canvas, OUTER_RIGHT + 1, name_top,
                  WIND_RENDERER_WIDTH - OUTER_RIGHT - 1,
                  name_bottom - name_top + 1, CANVAS_WHITE);
    }
    if (coordinates_included) {
        const int coordinate_x = CONTENT_LEFT + name_metrics.width + 20;
        draw_text(&canvas, coordinate_x, 59, WIND_FONT_BERKELEY_MONO_BOLD,
                  WIND_FONT_SIZE_STATUS, coordinate_first);
        draw_text(&canvas, coordinate_x, 78, WIND_FONT_BERKELEY_MONO_BOLD,
                  WIND_FONT_SIZE_STATUS, coordinate_second);
    }

    draw_text_right(&canvas, CONTENT_RIGHT, 58, WIND_FONT_BERKELEY_MONO_BOLD,
                    WIND_FONT_SIZE_STATUS, model);
    draw_battery(&canvas, CONTENT_RIGHT, 72, dashboard->battery_percent);
    const int status_character_width = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_STATUS, "0").width;
    draw_text_right(&canvas, CONTENT_RIGHT - 30 - status_character_width, 78,
                    WIND_FONT_BERKELEY_MONO_BOLD,
                    WIND_FONT_SIZE_STATUS, update);

    horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, DAY_HEADER_BOTTOM,
                    CANVAS_BLACK);
    if (dashboard->show_weather || dashboard->show_temperature) {
        const int conditions_top = dashboard->show_weather
                                       ? layout.weather_top
                                       : layout.temperature_top;
        horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, conditions_top,
                        CANVAS_BLACK);
    }
    if (dashboard->show_tide)
        horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, layout.tide_top,
                        CANVAS_BLACK);
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        const int column_x = day_column_x(day);
        if (day > 0)
            vertical_line(&canvas, column_x, HEADER_BOTTOM, OUTER_BOTTOM,
                          CANVAS_BLACK);
        draw_text(&canvas, column_x + 17, 126, WIND_FONT_BERKELEY_MONO_BOLD,
                  WIND_FONT_SIZE_DAY, safe_text(dashboard->days[day].day));
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            if (dashboard->state != WIND_RENDERER_UNAVAILABLE)
                draw_sample(&canvas,
                            forecast_sample_center_x(day, sample),
                            &dashboard->days[day].samples[sample], &layout);
            const int center_x = forecast_sample_center_x(day, sample);
            const wind_renderer_sample_t *slot = &dashboard->days[day].samples[sample];
            if (dashboard->state != WIND_RENDERER_UNAVAILABLE &&
                dashboard->show_weather)
                draw_weather(&canvas, center_x,
                             layout.weather_center,
                             slot->weather);
            if (dashboard->state != WIND_RENDERER_UNAVAILABLE &&
                dashboard->show_temperature)
                draw_temperature(&canvas, center_x,
                                 layout.temperature_top,
                                 layout.temperature_bottom, slot,
                                 dashboard->temperature_fahrenheit);
        }
    }

    if (dashboard->state != WIND_RENDERER_UNAVAILABLE && dashboard->show_tide)
        draw_tide(&canvas, dashboard, &layout);

    if (dashboard->state == WIND_RENDERER_UNAVAILABLE) {
        const char *message = "FORECAST UNAVAILABLE";
        const wind_text_metrics_t metrics = wind_font_measure(
            WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_DAY, message);
        draw_text(&canvas, (WIND_RENDERER_WIDTH - metrics.width) / 2, 312,
                  WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_DAY, message);
    }

    int output_result = 0;
    if (output_format == OUTPUT_PALETTE) {
        output_result = dither_once(canvas.pixels, output_pixels);
    } else {
        for (int pixel = 0; pixel < WIND_RENDERER_PALETTE_BYTES; ++pixel) {
            const int offset = pixel * 4;
            const uint8_t luma = canvas.pixels[pixel];
            output_pixels[offset] = luma;
            output_pixels[offset + 1] = luma;
            output_pixels[offset + 2] = luma;
            output_pixels[offset + 3] = 255;
        }
    }
    output_surface_t output = {
        .pixels = output_pixels,
        .format = output_format,
    };
    if (output_result == 0 &&
        dashboard->display_mode == WIND_RENDERER_MODE_THRESHOLD &&
        dashboard->state != WIND_RENDERER_UNAVAILABLE)
        draw_threshold_overlay(&canvas, &output, dashboard, &layout);
    if (output_result == 0)
        draw_low_battery_overlay(&canvas, &output,
                                 dashboard->battery_percent);
    if (stats) {
        stats->dither_passes = output_result == 0 &&
                                      output_format == OUTPUT_PALETTE
                                  ? 1
                                  : 0;
        stats->coordinates_included = coordinates_included;
        stats->status_right = CONTENT_RIGHT;
        stats->clipped_primitives = canvas.clipped;
        stats->wind_baseline = layout.wind_baseline;
        stats->weather_row_top = layout.weather_top;
        stats->temperature_row_top = layout.temperature_top;
        stats->tide_row_top = layout.tide_top;
    }
    free(canvas.pixels);
    return output_result == 0 ? 0 : -2;
}

int wind_renderer_render(const wind_renderer_dashboard_t *dashboard,
                         uint8_t *palette_out, size_t palette_size,
                         wind_renderer_stats_t *stats) {
    return render_dashboard(dashboard, palette_out, palette_size,
                            OUTPUT_PALETTE, stats);
}

int wind_renderer_render_preview_rgba(
    const wind_renderer_dashboard_t *dashboard, uint8_t *rgba_out,
    size_t rgba_size, wind_renderer_stats_t *stats) {
    return render_dashboard(dashboard, rgba_out, rgba_size, OUTPUT_RGBA,
                            stats);
}
