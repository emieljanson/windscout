#include "wind_display_config.h"

void wind_display_config_default(wind_display_config_t *config)
{
    if (!config) return;
    *config = (wind_display_config_t) {
        .version = WIND_DISPLAY_CONFIG_VERSION,
        .display_mode = WIND_RENDERER_MODE_SOLID,
        .threshold_kt = WIND_RENDERER_DEFAULT_THRESHOLD_KT,
        .show_weather = true,
        .show_temperature = false,
        .show_tide = false,
        .show_dedicated_footer = false,
        .use_24_hour = true,
        .temperature_fahrenheit = false,
    };
}

bool wind_display_config_stored_version_supported(uint32_t stored_version)
{
    return stored_version >= 1u && stored_version <= WIND_DISPLAY_CONFIG_VERSION;
}

bool wind_display_config_validate(const wind_display_config_t *config)
{
    return config && config->version == WIND_DISPLAY_CONFIG_VERSION &&
           (config->display_mode == WIND_RENDERER_MODE_THRESHOLD ||
            config->display_mode == WIND_RENDERER_MODE_SOLID) &&
           config->threshold_kt >= WIND_RENDERER_MIN_THRESHOLD_KT &&
           config->threshold_kt <= WIND_RENDERER_MAX_THRESHOLD_KT;
}

uint64_t wind_display_config_signature(const wind_display_config_t *config)
{
    if (!wind_display_config_validate(config)) return 0;
    uint64_t value = config->version;
    value = value * 131u + config->display_mode;
    value = value * 131u + config->threshold_kt;
    value = value * 131u + (config->show_weather ? 1u : 0u);
    value = value * 131u + (config->show_temperature ? 1u : 0u);
    value = value * 131u + (config->show_tide ? 1u : 0u);
    value = value * 131u + (config->show_dedicated_footer ? 1u : 0u);
    value = value * 131u + (config->use_24_hour ? 1u : 0u);
    value = value * 131u + (config->temperature_fahrenheit ? 1u : 0u);
    return value;
}
