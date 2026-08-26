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
    CHART_BASELINE = 424,
    VALUE_ROW_TOP = 432,
    DAY_WIDTH = 155,
    SAMPLE_STEP = 26,
    SAMPLE_FIRST_CENTER = 26,
    CHART_SCALE_HEIGHT = 240,
    SUSTAINED_BAR_WIDTH = 16,
};

typedef struct {
    uint8_t *pixels;
    int clipped;
} canvas_t;

static const char *safe_text(const char *text) { return text ? text : ""; }

static int clamp_int(int value, int low, int high) {
    if (value < low) return low;
    if (value > high) return high;
    return value;
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
                !text_fits(slot->time, WIND_RENDERER_TIME_LABEL_CAPACITY) ||
                (slot->available && (!slot->time || !slot->time[0]))) {
                return 0;
            }
        }
    }
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

static void draw_low_wind_background(canvas_t *canvas) {
    const int y_20kt = CHART_BASELINE - 20 * CHART_SCALE_HEIGHT / 40;
    const int y_15kt = CHART_BASELINE - 15 * CHART_SCALE_HEIGHT / 40;
    const int fade_height = y_15kt - y_20kt;
    for (int py = y_20kt; py < VALUE_ROW_TOP; ++py) {
        const int density = py >= y_15kt
                                ? 12
                                : (py - y_20kt) * 12 / fade_height;
        for (int px = OUTER_X + 1; px < OUTER_RIGHT; ++px) {
            if (dither_pixel_is_black(px, py, density))
                set_pixel(canvas, px, py, CANVAS_BLACK);
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

static void draw_weather(canvas_t *canvas, int center_x, wind_renderer_weather_t weather)
{
    const int center_y = 450;
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
                        const wind_renderer_sample_t *sample) {
    char value[12];
    if (!sample->available) {
        const wind_text_metrics_t missing = wind_font_measure(
            WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
            WIND_FONT_SIZE_STATUS, "--");
        draw_text(canvas, center_x - missing.width / 2, 455,
                  WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                  WIND_FONT_SIZE_STATUS, "--");
        return;
    }

    draw_arrow(canvas, center_x, 158, sample->destination_degrees);

    const int sustained = clamp_int(sample->sustained_kt, 0, 40);
    const int gust = clamp_int(sample->gust_kt, 0, 40);
    const int sustained_height = sustained * CHART_SCALE_HEIGHT / 40;
    const int sustained_y = CHART_BASELINE - sustained_height;
    const int gust_y = CHART_BASELINE - gust * CHART_SCALE_HEIGHT / 40;
    fill_rect(canvas, center_x - SUSTAINED_BAR_WIDTH / 2,
              sustained_y, SUSTAINED_BAR_WIDTH, sustained_height,
              CANVAS_BLACK);
    const int gust_gap = (gust - sustained) * CHART_SCALE_HEIGHT / 40;
    if (gust > sustained && gust_gap >= 6)
        horizontal_line(canvas, center_x - 8, center_x + 7, gust_y, CANVAS_BLACK);

    snprintf(value, sizeof(value), "%d", clamp_int(sample->sustained_kt, 0, 999));
    const int label_baseline = clamp_int(
        sustained_y - 5, CHART_BASELINE - CHART_SCALE_HEIGHT - 4,
        CHART_BASELINE - 5);
    draw_outlined_text_center(canvas, center_x, label_baseline,
                              WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                              WIND_FONT_SIZE_STATUS, value);
    draw_weather(canvas, center_x, sample->weather);
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

static void draw_wind_reference_lines(canvas_t *canvas) {
    enum {
        GRAPH_TOP = 180,
        GRAPH_BASELINE = 424,
        GRAPH_MAX_KNOTS = 40,
    };
    const int graph_height = GRAPH_BASELINE - GRAPH_TOP;
    for (int knots = 5; knots <= GRAPH_MAX_KNOTS; knots += 5) {
        const int y = GRAPH_BASELINE -
                      (knots * graph_height + GRAPH_MAX_KNOTS / 2) / GRAPH_MAX_KNOTS;
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

static void apply_mask_to_palette(const canvas_t *mask, uint8_t *palette,
                                  int left, int top, int right, int bottom,
                                  uint8_t palette_color) {
    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            if (mask->pixels[y * WIND_RENDERER_WIDTH + x] < 128)
                palette[y * WIND_RENDERER_WIDTH + x] = palette_color;
        }
    }
}

static void draw_palette_outlined_text(canvas_t *scratch, uint8_t *palette,
                                       int x, int baseline,
                                       wind_font_family_t family, int size,
                                       const char *text, uint8_t text_color) {
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
    apply_mask_to_palette(scratch, palette, mask_left, mask_top,
                          mask_right, mask_bottom, PALETTE_WHITE);

    memset(scratch->pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    draw_text(scratch, x, baseline, family, size, text);
    apply_mask_to_palette(scratch, palette, mask_left, mask_top,
                          mask_right, mask_bottom, text_color);
}

static void draw_threshold_overlay(canvas_t *scratch, uint8_t *palette,
                                   const wind_renderer_dashboard_t *dashboard) {
    const int y = CHART_BASELINE -
                  dashboard->threshold_kt * CHART_SCALE_HEIGHT / 40;
    const int line_left = OUTER_X + SAMPLE_FIRST_CENTER -
                          SUSTAINED_BAR_WIDTH / 2 - 2;
    const int line_right = OUTER_X +
                           (WIND_RENDERER_DAY_COUNT - 1) * DAY_WIDTH +
                           SAMPLE_FIRST_CENTER +
                           (WIND_RENDERER_SAMPLES_PER_DAY - 1) * SAMPLE_STEP +
                           SUSTAINED_BAR_WIDTH / 2 - 1 + 2;
    for (int x = line_left; x <= line_right; ++x) {
        palette[(y - 1) * WIND_RENDERER_WIDTH + x] = PALETTE_WHITE;
        palette[y * WIND_RENDERER_WIDTH + x] = PALETTE_RED;
        palette[(y + 1) * WIND_RENDERER_WIDTH + x] = PALETTE_WHITE;
    }

    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        const int column_x = OUTER_X + day * DAY_WIDTH;
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            const wind_renderer_sample_t *source = &dashboard->days[day].samples[sample];
            if (!source->available) continue;
            const int center_x = column_x + SAMPLE_FIRST_CENTER + sample * SAMPLE_STEP;
            const int sustained = clamp_int(source->sustained_kt, 0, 40);
            const int sustained_y = CHART_BASELINE -
                                    sustained * CHART_SCALE_HEIGHT / 40;
            const int baseline = clamp_int(
                sustained_y - 5, CHART_BASELINE - CHART_SCALE_HEIGHT - 4,
                CHART_BASELINE - 5);
            if (baseline - 14 > y || baseline + 3 < y) continue;

            char value[12];
            snprintf(value, sizeof(value), "%d",
                     clamp_int(source->sustained_kt, 0, 999));
            const wind_text_metrics_t metrics = wind_font_measure(
                WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                WIND_FONT_SIZE_STATUS, value);
            draw_palette_outlined_text(
                scratch, palette, center_x - metrics.width / 2, baseline,
                WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                WIND_FONT_SIZE_STATUS, value, PALETTE_BLACK);
        }
    }

    char label[16];
    snprintf(label, sizeof(label), "%dKTS", dashboard->threshold_kt);
    const int baseline = y + 5;
    const wind_text_metrics_t metrics = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
        WIND_FONT_SIZE_STATUS, label);
    const int x = CONTENT_RIGHT - metrics.width + 1;
    draw_palette_outlined_text(scratch, palette, x, baseline,
                               WIND_FONT_BERKELEY_MONO_BOLD_CONDENSED,
                               WIND_FONT_SIZE_STATUS, label, PALETTE_RED);
}

static void draw_low_battery_overlay(canvas_t *scratch, uint8_t *palette,
                                     int battery_percent) {
    if (battery_percent < 0 || battery_percent >= 10) return;
    memset(scratch->pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    draw_battery(scratch, CONTENT_RIGHT, 72, battery_percent);
    apply_mask_to_palette(scratch, palette, CONTENT_RIGHT - 24, 65,
                          CONTENT_RIGHT + 1, 78, PALETTE_RED);
}

uint32_t wind_renderer_contract_version(void) {
    return WIND_RENDERER_CONTRACT_VERSION;
}

void wind_renderer_input_v1_init(wind_renderer_input_v1_t *input) {
    if (!input) return;
    memset(input, 0, sizeof(*input));
    input->version = WIND_RENDERER_CONTRACT_VERSION;
    input->battery_percent = -1;
    input->threshold_kt = WIND_RENDERER_DEFAULT_THRESHOLD_KT;
}

int wind_renderer_input_v1_set_metadata(wind_renderer_input_v1_t *input,
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

int wind_renderer_input_v1_set_status(wind_renderer_input_v1_t *input,
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

int wind_renderer_input_v1_set_day(wind_renderer_input_v1_t *input,
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

int wind_renderer_input_v1_set_sample(wind_renderer_input_v1_t *input,
                                      int day_index, int sample_index,
                                      const char *time, int sustained_kt,
                                      int gust_kt, int destination_degrees,
                                      int available,
                                      wind_renderer_weather_t weather) {
    if (!input || input->version != WIND_RENDERER_CONTRACT_VERSION ||
        day_index < 0 || day_index >= WIND_RENDERER_DAY_COUNT ||
        sample_index < 0 || sample_index >= WIND_RENDERER_SAMPLES_PER_DAY ||
        (available != 0 && available != 1) ||
        weather < WIND_RENDERER_WEATHER_UNAVAILABLE ||
        weather > WIND_RENDERER_WEATHER_HEAVY_RAIN ||
        !text_fits(safe_text(time),
                   sizeof(input->days[day_index].samples[sample_index].time)) ||
        (available && (!time || !time[0]))) {
        return -1;
    }
    wind_renderer_input_sample_v1_t *sample =
        &input->days[day_index].samples[sample_index];
    copy_bounded_text(sample->time, sizeof(sample->time), time);
    sample->sustained_kt = sustained_kt;
    sample->gust_kt = gust_kt;
    sample->destination_degrees = destination_degrees;
    sample->available = available;
    sample->weather = weather;
    return 0;
}

int wind_renderer_input_v1_to_dashboard(const wind_renderer_input_v1_t *input,
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
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        result.days[day].day = input->days[day].day;
        result.days[day].date = input->days[day].date;
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            const wind_renderer_input_sample_v1_t *source =
                &input->days[day].samples[sample];
            result.days[day].samples[sample] = (wind_renderer_sample_t) {
                .time = source->time,
                .sustained_kt = source->sustained_kt,
                .gust_kt = source->gust_kt,
                .destination_degrees = source->destination_degrees,
                .available = source->available,
                .weather = (wind_renderer_weather_t)source->weather,
            };
        }
    }
    if (!dashboard_valid(&result)) return -2;
    *dashboard = result;
    return 0;
}

int wind_renderer_input_v1_render(const wind_renderer_input_v1_t *input,
                                  uint8_t *palette_out, size_t palette_size,
                                  wind_renderer_stats_t *stats) {
    wind_renderer_dashboard_t dashboard;
    if (wind_renderer_input_v1_to_dashboard(input, &dashboard) != 0) return -1;
    return wind_renderer_render(&dashboard, palette_out, palette_size, stats);
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

int wind_renderer_render(const wind_renderer_dashboard_t *dashboard,
                         uint8_t *palette_out, size_t palette_size,
                         wind_renderer_stats_t *stats) {
    if (!dashboard || !palette_out || palette_size < WIND_RENDERER_PALETTE_BYTES)
        return -1;
    if (!dashboard_valid(dashboard)) return -3;

    canvas_t canvas = {0};
    canvas.pixels = (uint8_t *)malloc(WIND_RENDERER_PALETTE_BYTES);
    if (!canvas.pixels) return -2;
    memset(canvas.pixels, CANVAS_WHITE, WIND_RENDERER_PALETTE_BYTES);
    if (stats) memset(stats, 0, sizeof(*stats));

    outline_rect(&canvas, OUTER_X, OUTER_TOP, OUTER_RIGHT - OUTER_X + 1,
                 OUTER_BOTTOM - OUTER_TOP + 1);
    horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, HEADER_BOTTOM, CANVAS_BLACK);

    char model[64];
    char update[32];
    build_status(dashboard, model, sizeof(model), update, sizeof(update));
    draw_text_right(&canvas, CONTENT_RIGHT, 58, WIND_FONT_BERKELEY_MONO_BOLD,
                    WIND_FONT_SIZE_STATUS, model);
    draw_battery(&canvas, CONTENT_RIGHT, 72, dashboard->battery_percent);
    const int status_character_width = wind_font_measure(
        WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_STATUS, "0").width;
    draw_text_right(&canvas, CONTENT_RIGHT - 30 - status_character_width, 78,
                    WIND_FONT_BERKELEY_MONO_BOLD,
                    WIND_FONT_SIZE_STATUS, update);

    if (dashboard->display_mode == WIND_RENDERER_MODE_BACKGROUND_FADE)
        draw_low_wind_background(&canvas);
    draw_wind_reference_lines(&canvas);

    const int header_text_right = 565;
    const int header_width = header_text_right - CONTENT_LEFT + 1;
    char fitted_name[192];
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
    wind_font_fit_ellipsis(WIND_FONT_INTER, WIND_FONT_SIZE_SPOT,
                           safe_text(dashboard->spot_name), "",
                           coordinates_included ? name_metrics.width : header_width,
                           fitted_name, sizeof(fitted_name), NULL);
    draw_text(&canvas, CONTENT_LEFT, 78, WIND_FONT_INTER, WIND_FONT_SIZE_SPOT,
              fitted_name);
    if (coordinates_included) {
        const int coordinate_x = CONTENT_LEFT + name_metrics.width + 20;
        draw_text(&canvas, coordinate_x, 59, WIND_FONT_BERKELEY_MONO_BOLD,
                  WIND_FONT_SIZE_STATUS, coordinate_first);
        draw_text(&canvas, coordinate_x, 78, WIND_FONT_BERKELEY_MONO_BOLD,
                  WIND_FONT_SIZE_STATUS, coordinate_second);
    }

    horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, DAY_HEADER_BOTTOM,
                    CANVAS_BLACK);
    horizontal_line(&canvas, OUTER_X, OUTER_RIGHT, VALUE_ROW_TOP,
                    CANVAS_BLACK);
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        const int column_x = OUTER_X + day * DAY_WIDTH;
        if (day > 0)
            vertical_line(&canvas, column_x, HEADER_BOTTOM, OUTER_BOTTOM,
                          CANVAS_BLACK);
        draw_text(&canvas, column_x + 17, 126, WIND_FONT_BERKELEY_MONO_BOLD,
                  WIND_FONT_SIZE_DAY, safe_text(dashboard->days[day].day));
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            if (dashboard->state != WIND_RENDERER_UNAVAILABLE)
                draw_sample(&canvas,
                            column_x + SAMPLE_FIRST_CENTER + sample * SAMPLE_STEP,
                            &dashboard->days[day].samples[sample]);
        }
    }

    if (dashboard->state == WIND_RENDERER_UNAVAILABLE) {
        const char *message = "FORECAST UNAVAILABLE";
        const wind_text_metrics_t metrics = wind_font_measure(
            WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_DAY, message);
        draw_text(&canvas, (WIND_RENDERER_WIDTH - metrics.width) / 2, 312,
                  WIND_FONT_BERKELEY_MONO_BOLD, WIND_FONT_SIZE_DAY, message);
    }

    const int dither_result = dither_once(canvas.pixels, palette_out);
    if (dither_result == 0 &&
        dashboard->display_mode == WIND_RENDERER_MODE_THRESHOLD &&
        dashboard->state != WIND_RENDERER_UNAVAILABLE)
        draw_threshold_overlay(&canvas, palette_out, dashboard);
    if (dither_result == 0)
        draw_low_battery_overlay(&canvas, palette_out,
                                 dashboard->battery_percent);
    if (stats) {
        stats->dither_passes = dither_result == 0 ? 1 : 0;
        stats->coordinates_included = coordinates_included;
        stats->status_right = CONTENT_RIGHT;
        stats->clipped_primitives = canvas.clipped;
    }
    free(canvas.pixels);
    return dither_result == 0 ? 0 : -2;
}
