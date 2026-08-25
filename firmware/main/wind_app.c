#include "wind_app.h"

#include <stdlib.h>
#include <ctype.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static const int64_t UNAVAILABLE_RETRY_SECONDS = 60;

static wind_freshness_t freshness_for(const wind_forecast_t *forecast, int64_t now)
{
    if (!forecast) {
        return WIND_FRESHNESS_UNAVAILABLE;
    }
    int64_t age = now - forecast->retrieved_at;
    if (age < -5 * 60) {
        return WIND_FRESHNESS_UNAVAILABLE;
    }
    if (age <= 0 || age < 6 * 60 * 60) {
        return WIND_FRESHNESS_FRESH;
    }
    return age >= 24 * 60 * 60 ? WIND_FRESHNESS_STALE : WIND_FRESHNESS_AGED;
}

static bool forecast_covers_dashboard_window(const wind_forecast_t *forecast, int64_t now)
{
    if (!forecast || now <= 0 || !wind_forecast_validate(forecast)) {
        return false;
    }
    time_t current_time = (time_t) now;
    struct tm local;
    localtime_r(&current_time, &local);
    char today[WIND_FORECAST_DATE_LENGTH];
    if (strftime(today, sizeof(today), "%Y-%m-%d", &local) == 0) {
        return false;
    }
    return strcmp(forecast->days[0].local_date, today) == 0;
}

esp_err_t wind_app_init(wind_app_t *app, const wind_app_config_t *config)
{
    if (!app || !config || !config->provider.fetch || !config->identity.spot_id ||
        !config->identity.timezone || !config->identity.model || !config->forecast_cache_path ||
        !config->panel_cache_path || !config->schedule_path || !config->render || !config->display ||
        config->render_signature == 0 || config->bitmap_size == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    memset(app, 0, sizeof(*app));
    app->config = *config;
    if (wind_schedule_state_load_scoped(config->schedule_path, config->identity.spot_id,
                                        config->identity.timezone, &app->schedule) != ESP_OK) {
        if (wind_schedule_state_set_scope(&app->schedule, config->identity.spot_id,
                                          config->identity.timezone) != ESP_OK) {
            return ESP_ERR_INVALID_ARG;
        }
    }
    app->initialized = true;
    return ESP_OK;
}

static esp_err_t run_internal(wind_app_t *app, bool force_refresh, bool allow_fetch,
                              bool publish_display, int64_t now, wind_app_outcome_t *outcome)
{
    if (!app || !app->initialized || now <= 0) {
        return ESP_ERR_INVALID_ARG;
    }
    wind_app_outcome_t local = {.fetch_result = ESP_OK};
    wind_forecast_t active;
    bool have_active = wind_cache_load(app->config.forecast_cache_path, &app->config.identity,
                                       &active) == ESP_OK;
    local.used_cache = have_active;

    bool cache_has_coverage = have_active && forecast_covers_dashboard_window(&active, now);
    bool coverage_refresh_due =
        have_active && !cache_has_coverage &&
        (!app->coverage_refresh_attempted ||
         app->coverage_refresh_cache_retrieved_at != active.retrieved_at);
    bool unavailable_retry_due =
        !have_active && app->unavailable_retry_at > 0 && now >= app->unavailable_retry_at;
    bool initial_fetch_due = !have_active && app->unavailable_retry_at == 0;

    int64_t boundary = wind_schedule_latest_boundary((time_t) now);
    bool due = wind_schedule_is_due(&app->schedule, (time_t) now, &boundary);
    if (allow_fetch &&
        (force_refresh || due || coverage_refresh_due || unavailable_retry_due || initial_fetch_due)) {
        local.attempted_fetch = true;
        if (coverage_refresh_due) {
            app->coverage_refresh_attempted = true;
            app->coverage_refresh_cache_retrieved_at = active.retrieved_at;
        }
        if (due) {
            wind_schedule_mark_attempted(&app->schedule, boundary);
            if (wind_schedule_state_store(app->config.schedule_path, &app->schedule) != ESP_OK) {
                if (outcome) {
                    *outcome = local;
                }
                return ESP_FAIL;
            }
        }
        wind_forecast_t fetched;
        wind_forecast_clear(&fetched);
        local.fetch_result = wind_provider_fetch(&app->config.provider, now, &fetched);
        if (local.fetch_result == ESP_OK && wind_forecast_validate(&fetched) &&
            forecast_covers_dashboard_window(&fetched, now)) {
            local.fetch_result = wind_cache_store(app->config.forecast_cache_path, &fetched);
            if (local.fetch_result == ESP_OK) {
                active = fetched;
                have_active = true;
                local.used_cache = false;
                local.published_forecast = true;
                app->unavailable_retry_at = 0;
                app->coverage_refresh_attempted = false;
                app->coverage_refresh_cache_retrieved_at = 0;
                wind_schedule_mark_satisfied(&app->schedule, boundary);
                wind_schedule_state_store(app->config.schedule_path, &app->schedule);
            }
        } else if (local.fetch_result == ESP_OK) {
            local.fetch_result = ESP_ERR_INVALID_RESPONSE;
        }
        if (!have_active && local.fetch_result != ESP_OK) {
            app->unavailable_retry_at = now + UNAVAILABLE_RETRY_SECONDS;
        }
    }

    local.freshness = freshness_for(have_active ? &active : NULL, now);
    if (!publish_display) {
        if (outcome) {
            *outcome = local;
        }
        return ESP_OK;
    }
    uint8_t *bitmap = (uint8_t *) malloc(app->config.bitmap_size);
    if (!bitmap) {
        return ESP_ERR_NO_MEM;
    }
    const bool refresh_failed = local.attempted_fetch && local.fetch_result != ESP_OK;
    esp_err_t result = app->config.render(app->config.io_context, have_active ? &active : NULL,
                                          local.freshness, refresh_failed, now, bitmap,
                                          app->config.bitmap_size);
    if (result != ESP_OK) {
        free(bitmap);
        if (outcome) {
            *outcome = local;
        }
        return result;
    }

    uint64_t hash = wind_cache_bitmap_hash(bitmap, app->config.bitmap_size);
    uint64_t confirmed_hash = 0;
    if (hash != 0 &&
        wind_cache_panel_load(app->config.panel_cache_path, app->config.render_signature,
                              &confirmed_hash) == ESP_OK &&
        hash == confirmed_hash) {
        local.display_unchanged = true;
        free(bitmap);
        if (outcome) {
            *outcome = local;
        }
        return ESP_OK;
    }

    result = app->config.display(app->config.io_context, bitmap, app->config.bitmap_size);
    free(bitmap);
    if (result != ESP_OK) {
        wind_cache_panel_invalidate(app->config.panel_cache_path);
        if (outcome) {
            *outcome = local;
        }
        return result;
    }
    result = wind_cache_panel_confirm(app->config.panel_cache_path, app->config.render_signature,
                                      hash);
    if (result == ESP_OK) {
        local.displayed = true;
    }
    if (outcome) {
        *outcome = local;
    }
    return result;
}

esp_err_t wind_app_run(wind_app_t *app, bool force_refresh, int64_t now,
                       wind_app_outcome_t *outcome)
{
    return run_internal(app, force_refresh, true, true, now, outcome);
}

esp_err_t wind_app_prefetch(wind_app_t *app, bool force_refresh, int64_t now,
                            wind_app_outcome_t *outcome)
{
    return run_internal(app, force_refresh, true, false, now, outcome);
}

esp_err_t wind_app_show_cached(wind_app_t *app, int64_t now, wind_app_outcome_t *outcome)
{
    return run_internal(app, false, false, true, now, outcome);
}

#ifdef ESP_PLATFORM
#include "board_hal.h"
#include "config.h"
#include "config_manager.h"
#include "display_manager.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "open_meteo_knmi_provider.h"
#include "wind_config.h"
#include "wind_spots.h"

#include "wind_renderer.h"

// Bump this whenever layout, typography, palette encoding, or final bitmap semantics change.
#define WIND_DASHBOARD_RENDER_SIGNATURE UINT64_C(0x57494E440000000B)

static const char *TAG = "wind_app";
typedef struct {
    wind_app_t app;
    open_meteo_knmi_config_t provider_config;
    const wind_spot_t *spot;
    char forecast_path[96];
    char schedule_path[96];
} wind_spot_runtime_t;

static wind_spot_runtime_t s_spots[3];
static size_t s_selected_index;
static SemaphoreHandle_t s_app_lock;
static bool s_ready;
static wind_renderer_display_mode_t s_display_mode =
    WIND_RENDERER_MODE_THRESHOLD;

static const char *day_name(int weekday)
{
    static const char *names[] = {"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY",
                                  "THURSDAY", "FRIDAY", "SATURDAY"};
    return weekday >= 0 && weekday < 7 ? names[weekday] : "";
}

static void format_coordinates(char *output, size_t size, double latitude, double longitude)
{
    int lat_degrees = (int) latitude;
    int lon_degrees = (int) longitude;
    double lat_minutes_full = (latitude - lat_degrees) * 60.0;
    double lon_minutes_full = (longitude - lon_degrees) * 60.0;
    int lat_minutes = (int) lat_minutes_full;
    int lon_minutes = (int) lon_minutes_full;
    int lat_seconds = (int) ((lat_minutes_full - lat_minutes) * 60.0 + 0.5);
    int lon_seconds = (int) ((lon_minutes_full - lon_minutes) * 60.0 + 0.5);
    snprintf(output, size,
             "%d\xC2\xB0" "%02d'%02d\"N "
             "%d\xC2\xB0" "%02d'%02d\"E",
             lat_degrees, lat_minutes, lat_seconds, lon_degrees, lon_minutes, lon_seconds);
}

static wind_renderer_state_t renderer_state(wind_freshness_t freshness)
{
    switch (freshness) {
        case WIND_FRESHNESS_FRESH: return WIND_RENDERER_FRESH;
        case WIND_FRESHNESS_AGED: return WIND_RENDERER_AGED;
        case WIND_FRESHNESS_STALE: return WIND_RENDERER_STALE;
        default: return WIND_RENDERER_UNAVAILABLE;
    }
}

static const char *display_model_name(const char *model)
{
    if (model && strcmp(model, "knmi_seamless") == 0) {
        return "KNMI SEAMLESS";
    }
    return model;
}

static esp_err_t write_dashboard_preview(const uint8_t *bitmap, size_t bitmap_size)
{
    if (!bitmap || bitmap_size != WIND_RENDERER_PALETTE_BYTES) {
        return ESP_ERR_INVALID_SIZE;
    }
    const char *temporary_path = WIND_DASHBOARD_PREVIEW_PATH ".tmp";
    FILE *file = fopen(temporary_path, "wb");
    if (!file) {
        return ESP_FAIL;
    }
    if (fprintf(file, "P4\n%d %d\n", WIND_RENDERER_WIDTH, WIND_RENDERER_HEIGHT) < 0) {
        fclose(file);
        return ESP_FAIL;
    }
    uint8_t rgb_row[WIND_RENDERER_WIDTH * 3];
    uint8_t packed_row[(WIND_RENDERER_WIDTH + 7) / 8];
    esp_err_t result = ESP_OK;
    for (int y = 0; y < WIND_RENDERER_HEIGHT && result == ESP_OK; ++y) {
        const uint8_t *palette_row = bitmap + (size_t) y * WIND_RENDERER_WIDTH;
        if (wind_renderer_palette_row_to_rgb(palette_row, WIND_RENDERER_WIDTH, rgb_row,
                                             sizeof(rgb_row)) != 0) {
            result = ESP_FAIL;
            break;
        }
        memset(packed_row, 0, sizeof(packed_row));
        for (int x = 0; x < WIND_RENDERER_WIDTH; ++x) {
            if (rgb_row[x * 3] < 128) {
                packed_row[x / 8] |= (uint8_t) (0x80u >> (x % 8));
            }
        }
        if (fwrite(packed_row, 1, sizeof(packed_row), file) != sizeof(packed_row)) {
            result = ESP_FAIL;
        }
    }
    if (fclose(file) != 0) {
        result = ESP_FAIL;
    }
    if (result == ESP_OK && rename(temporary_path, WIND_DASHBOARD_PREVIEW_PATH) != 0) {
        result = ESP_FAIL;
    }
    return result;
}

static esp_err_t render_dashboard(void *context, const wind_forecast_t *forecast,
                                  wind_freshness_t freshness, bool refresh_failed, int64_t now,
                                  uint8_t *bitmap, size_t bitmap_size)
{
    const wind_spot_t *spot = (const wind_spot_t *) context;
    wind_renderer_dashboard_t dashboard = {0};
    char coordinates[64] = "";
    char updated[32] = "";
    char dates[WIND_RENDERER_DAY_COUNT][16] = {{0}};
    char times[WIND_RENDERER_DAY_COUNT][WIND_RENDERER_SAMPLES_PER_DAY][3] = {{{0}}};
    struct tm local = {0};

    dashboard.spot_name = forecast ? forecast->spot_name : spot->display_name;
    dashboard.coordinates = coordinates;
    dashboard.provider = display_model_name(forecast ? forecast->model : WIND_MODEL);
    dashboard.updated_time = updated;
    dashboard.state = renderer_state(freshness);
    dashboard.refresh_failed = refresh_failed ? 1 : 0;
    dashboard.age_hours = forecast && now > forecast->retrieved_at
                              ? (int) ((now - forecast->retrieved_at) / 3600)
                              : 0;
    dashboard.battery_percent = board_hal_get_battery_percent();
    dashboard.display_mode = s_display_mode;
    format_coordinates(coordinates, sizeof(coordinates),
                       forecast ? forecast->latitude : spot->latitude,
                       forecast ? forecast->longitude : spot->longitude);

    if (forecast) {
        time_t retrieved = (time_t) forecast->retrieved_at;
        localtime_r(&retrieved, &local);
        char update_date[16] = "";
        strftime(update_date, sizeof(update_date), "%d %b", &local);
        const int hour_12 = local.tm_hour % 12 == 0 ? 12 : local.tm_hour % 12;
        snprintf(updated, sizeof(updated), "%s %d%s", update_date, hour_12,
                 local.tm_hour < 12 ? "AM" : "PM");
        for (char *cursor = updated; *cursor; ++cursor) {
            *cursor = (char) toupper((unsigned char) *cursor);
        }
        for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
            const wind_forecast_day_t *source_day = &forecast->days[day];
            time_t day_time = (time_t) source_day->samples[0].timestamp;
            localtime_r(&day_time, &local);
            dashboard.days[day].day = day == 0 ? "TODAY" : day_name(local.tm_wday);
            strftime(dates[day], sizeof(dates[day]), "%d %b", &local);
            dashboard.days[day].date = dates[day];
            for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
                const wind_forecast_sample_t *source = &source_day->samples[sample];
                const unsigned hour = source->local_hour <= 23 ? source->local_hour : 0;
                times[day][sample][0] = (char) ('0' + (hour / 10));
                times[day][sample][1] = (char) ('0' + (hour % 10));
                times[day][sample][2] = '\0';
                dashboard.days[day].samples[sample] = (wind_renderer_sample_t) {
                    .time = times[day][sample],
                    .sustained_kt = source->wind_knots,
                    .gust_kt = source->gust_knots,
                    .destination_degrees = source->destination_degrees,
                    .available = source->timestamp > 0,
                    .weather = (wind_renderer_weather_t) wind_forecast_weather_state(source),
                };
            }
        }
    }

    wind_renderer_stats_t stats;
    int render_result = wind_renderer_render(&dashboard, bitmap, bitmap_size, &stats);
    if (render_result != 0) {
        ESP_LOGE(TAG, "Dashboard render failed: %d", render_result);
        return ESP_FAIL;
    }
    if (write_dashboard_preview(bitmap, bitmap_size) != ESP_OK) {
        ESP_LOGW(TAG, "Could not publish dashboard preview");
    }
    return ESP_OK;
}

static esp_err_t display_dashboard(void *context, const uint8_t *bitmap, size_t bitmap_size)
{
    (void) context;
    if (!bitmap || bitmap_size != WIND_RENDERER_PALETTE_BYTES) {
        return ESP_ERR_INVALID_SIZE;
    }
    const size_t rgb_row_size = (size_t) WIND_RENDERER_WIDTH * 3;
    uint8_t *rgb_row = (uint8_t *) malloc(rgb_row_size);
    if (!rgb_row) {
        return ESP_ERR_NO_MEM;
    }
    esp_err_t result = display_manager_begin_rgb_stream();
    if (result != ESP_OK) {
        free(rgb_row);
        return result;
    }
    for (int y = 0; y < WIND_RENDERER_HEIGHT && result == ESP_OK; ++y) {
        if (wind_renderer_palette_row_to_rgb(
                bitmap + (size_t) y * WIND_RENDERER_WIDTH,
                WIND_RENDERER_WIDTH, rgb_row, rgb_row_size) != 0) {
            result = ESP_ERR_INVALID_RESPONSE;
            break;
        }
        result = display_manager_push_rgb_row(y, rgb_row, WIND_RENDERER_WIDTH);
    }
    esp_err_t end_result = display_manager_end_rgb_stream(result == ESP_OK, NULL);
    free(rgb_row);
    return result != ESP_OK ? result : end_result;
}

static esp_err_t ensure_ready(void)
{
    if (s_ready) {
        return ESP_OK;
    }
    if (wind_spots_count() != sizeof(s_spots) / sizeof(s_spots[0])) {
        return ESP_ERR_INVALID_SIZE;
    }
    if (!s_app_lock) {
        s_app_lock = xSemaphoreCreateMutex();
        if (!s_app_lock) {
            return ESP_ERR_NO_MEM;
        }
    }
    if (wind_spots_load_selected(&s_selected_index) != ESP_OK ||
        !wind_spots_at(s_selected_index)) {
        s_selected_index = 0;
    }
    for (size_t index = 0; index < wind_spots_count(); ++index) {
        wind_spot_runtime_t *runtime = &s_spots[index];
        runtime->spot = wind_spots_at(index);
        int forecast_length = index == 0
                                  ? snprintf(runtime->forecast_path,
                                             sizeof(runtime->forecast_path), "%s",
                                             WIND_FORECAST_CACHE_PATH)
                                  : snprintf(runtime->forecast_path,
                                             sizeof(runtime->forecast_path),
                                             "/storage/wind-%s.cache", runtime->spot->id);
        int schedule_length = index == 0
                                  ? snprintf(runtime->schedule_path,
                                             sizeof(runtime->schedule_path), "%s",
                                             WIND_SCHEDULE_CACHE_PATH)
                                  : snprintf(runtime->schedule_path,
                                             sizeof(runtime->schedule_path),
                                             "/storage/wind-%s.schedule", runtime->spot->id);
        if (forecast_length < 0 || forecast_length >= (int) sizeof(runtime->forecast_path) ||
            schedule_length < 0 || schedule_length >= (int) sizeof(runtime->schedule_path)) {
            return ESP_ERR_INVALID_SIZE;
        }
        runtime->provider_config = (open_meteo_knmi_config_t) {
            .endpoint = WIND_PROVIDER_ENDPOINT,
            .api_key = WIND_PROVIDER_API_KEY,
            .development_mode = WIND_PROVIDER_DEVELOPMENT_MODE,
            .commercial_mode = WIND_PROVIDER_COMMERCIAL_MODE,
            .spot_id = runtime->spot->id,
            .spot_name = runtime->spot->display_name,
            .latitude = runtime->spot->latitude,
            .longitude = runtime->spot->longitude,
            .timezone = runtime->spot->timezone,
            .model = WIND_MODEL,
        };
        if (!open_meteo_knmi_config_valid(&runtime->provider_config)) {
            ESP_LOGE(TAG, "Provider configuration rejected for %s", runtime->spot->id);
            return ESP_ERR_INVALID_STATE;
        }
        wind_provider_t provider;
        open_meteo_knmi_provider_init(&provider, &runtime->provider_config);
        wind_app_config_t config = {
            .provider = provider,
            .identity = {.spot_id = runtime->spot->id,
                         .timezone = runtime->spot->timezone,
                         .model = WIND_MODEL},
            .forecast_cache_path = runtime->forecast_path,
            .panel_cache_path = WIND_PANEL_CACHE_PATH,
            .schedule_path = runtime->schedule_path,
            .render_signature = WIND_DASHBOARD_RENDER_SIGNATURE,
            .bitmap_size = WIND_RENDERER_PALETTE_BYTES,
            .render = render_dashboard,
            .display = display_dashboard,
            .io_context = (void *) runtime->spot,
        };
        esp_err_t result = wind_app_init(&runtime->app, &config);
        if (result != ESP_OK) {
            return result;
        }
    }
    s_ready = true;
    return ESP_OK;
}

esp_err_t wind_app_configure_runtime(void)
{
    static const char *rules[] = {"5 0 *", "0 7 *", "0 11 *", "0 15 *", "0 19 *"};
    config_manager_set_timezone(WIND_TIMEZONE);
    config_manager_set_cron_rules(rules, 5);
    config_manager_set_auto_rotate(true);
    return ESP_OK;
}

esp_err_t wind_app_refresh(bool force_refresh)
{
    esp_err_t result = ensure_ready();
    if (result != ESP_OK) {
        return result;
    }
    xSemaphoreTake(s_app_lock, portMAX_DELAY);
    time_t now;
    time(&now);
    for (size_t index = 0; index < wind_spots_count(); ++index) {
        wind_app_outcome_t outcome;
        esp_err_t spot_result = index == s_selected_index
                                    ? wind_app_run(&s_spots[index].app, force_refresh, now, &outcome)
                                    : wind_app_prefetch(&s_spots[index].app, force_refresh, now,
                                                        &outcome);
        ESP_LOGI(TAG, "%s: fetch=%d published=%d displayed=%d unchanged=%d",
                 s_spots[index].spot->id, outcome.attempted_fetch, outcome.published_forecast,
                 outcome.displayed, outcome.display_unchanged);
        if (index == s_selected_index || result == ESP_OK) {
            result = spot_result;
        }
    }
    xSemaphoreGive(s_app_lock);
    return result;
}

static esp_err_t navigate(int direction)
{
    esp_err_t result = ensure_ready();
    if (result != ESP_OK) {
        return result;
    }
    xSemaphoreTake(s_app_lock, portMAX_DELAY);
    const size_t target = wind_spots_offset(s_selected_index, direction);
    wind_spot_runtime_t *runtime = &s_spots[target];
    wind_forecast_t cached;
    const bool have_cache = wind_cache_load(runtime->forecast_path, &runtime->app.config.identity,
                                            &cached) == ESP_OK;
    time_t now;
    time(&now);
    wind_app_outcome_t outcome;
    result = have_cache ? wind_app_show_cached(&runtime->app, now, &outcome)
                        : wind_app_run(&runtime->app, true, now, &outcome);
    if (result == ESP_OK) {
        s_selected_index = target;
        esp_err_t store_result = wind_spots_store_selected(target);
        if (store_result != ESP_OK) {
            ESP_LOGW(TAG, "Could not persist selected spot: %s", esp_err_to_name(store_result));
        }
        ESP_LOGI(TAG, "Selected spot %s (cached=%d)", runtime->spot->id, have_cache);
    }
    xSemaphoreGive(s_app_lock);
    return result;
}

esp_err_t wind_app_select_previous(void) { return navigate(-1); }
esp_err_t wind_app_select_next(void) { return navigate(1); }
esp_err_t wind_app_select_next_display_mode(void)
{
    esp_err_t ready = ensure_ready();
    if (ready != ESP_OK) {
        return ready;
    }
    if (xSemaphoreTake(s_app_lock, portMAX_DELAY) != pdTRUE) {
        return ESP_ERR_TIMEOUT;
    }

    s_display_mode = (wind_renderer_display_mode_t)
        ((s_display_mode + 1) % WIND_RENDERER_MODE_COUNT);
    wind_cache_panel_invalidate(WIND_PANEL_CACHE_PATH);
    ESP_LOGI(TAG, "Selected display mode %d", (int) s_display_mode);

    time_t now;
    time(&now);
    wind_app_outcome_t outcome = {0};
    esp_err_t result = wind_app_show_cached(&s_spots[s_selected_index].app,
                                            now, &outcome);
    xSemaphoreGive(s_app_lock);
    return result;
}

bool wind_app_navigation_requires_network(int direction)
{
    if (ensure_ready() != ESP_OK) {
        return true;
    }
    const size_t target = wind_spots_offset(s_selected_index, direction);
    wind_forecast_t cached;
    return wind_cache_load(s_spots[target].forecast_path, &s_spots[target].app.config.identity,
                           &cached) != ESP_OK;
}

esp_err_t wind_app_start(void)
{
    return wind_app_refresh(false);
}

esp_err_t wind_app_clear_panel_confirmation(void)
{
    return wind_cache_panel_invalidate(WIND_PANEL_CACHE_PATH);
}

int wind_app_seconds_until_next_boundary(void)
{
    time_t now;
    time(&now);
    int64_t next = wind_schedule_next_boundary(now);
    int seconds = next > now ? (int) (next - now) : 1;
    if (s_ready && s_selected_index < wind_spots_count()) {
        int64_t retry_at = s_spots[s_selected_index].app.unavailable_retry_at;
        if (retry_at > 0) {
            int retry_seconds = retry_at > now ? (int) (retry_at - now) : 1;
            if (retry_seconds < seconds) {
                seconds = retry_seconds;
            }
        }
    }
    return seconds;
}
#else
esp_err_t wind_app_configure_runtime(void) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t wind_app_start(void) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t wind_app_refresh(bool force_refresh)
{
    (void) force_refresh;
    return ESP_ERR_NOT_SUPPORTED;
}
esp_err_t wind_app_select_previous(void) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t wind_app_select_next(void) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t wind_app_select_next_display_mode(void) { return ESP_ERR_NOT_SUPPORTED; }
bool wind_app_navigation_requires_network(int direction)
{
    (void) direction;
    return true;
}
esp_err_t wind_app_clear_panel_confirmation(void) { return ESP_ERR_NOT_SUPPORTED; }
int wind_app_seconds_until_next_boundary(void) { return 0; }
#endif
