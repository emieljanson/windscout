#include <gtest/gtest.h>

#include <fstream>
#include <sstream>
#include <cstring>

extern "C" {
#include "open_meteo_knmi_provider.h"
}

static open_meteo_knmi_config_t development_config()
{
    return {OPEN_METEO_FREE_ENDPOINT, "", true, false, "edam", "Edam", 52.5126, 5.0486,
            "Europe/Amsterdam", "knmi_seamless"};
}

static std::string fixture()
{
    std::ifstream file(WIND_PROVIDER_FIXTURE);
    std::ostringstream contents;
    contents << file.rdbuf();
    return contents.str();
}

TEST(WindProvider, ParsesCompleteLocalFiveDayForecast)
{
    setenv("TZ", "Europe/Amsterdam", 1);
    tzset();
    auto config = development_config();
    auto json = fixture();
    wind_forecast_t forecast;
    ASSERT_EQ(open_meteo_knmi_parse_json(&config, json.data(), json.size(), 1787544000,
                                         "2026-08-24", &forecast),
              ESP_OK);
    EXPECT_STREQ(forecast.model, "knmi_seamless");
    EXPECT_STREQ(forecast.days[4].local_date, "2026-08-28");
    EXPECT_EQ(forecast.days[0].samples[0].wind_knots, 10);
    EXPECT_EQ(forecast.days[0].samples[1].wind_knots, 12);
    EXPECT_EQ(forecast.days[0].samples[3].destination_degrees, 90);
    EXPECT_EQ(forecast.days[4].samples[4].wind_knots, 44);
    EXPECT_TRUE(forecast.days[0].samples[0].weather_available);
    EXPECT_EQ(forecast.days[0].samples[1].precipitation_hundredths_mm, 9);
    EXPECT_EQ(wind_forecast_weather_state(&forecast.days[0].samples[2]),
              WIND_WEATHER_LIGHT_RAIN);
    EXPECT_EQ(wind_forecast_weather_state(&forecast.days[0].samples[4]), WIND_WEATHER_RAIN);
    EXPECT_TRUE(forecast.days[0].samples[0].temperature_available);
    EXPECT_EQ(forecast.days[0].samples[0].temperature_tenths_c, -24);
}

TEST(WindProvider, KeepsTemperatureIndependentWhenOneValueIsNull)
{
    setenv("TZ", "Europe/Amsterdam", 1);
    tzset();
    auto config = development_config();
    auto json = fixture();
    const auto value = json.find("-2.35");
    ASSERT_NE(value, std::string::npos);
    json.replace(value, 5, "null ");
    wind_forecast_t forecast;
    ASSERT_EQ(open_meteo_knmi_parse_json(&config, json.data(), json.size(), 1787544000,
                                         "2026-08-24", &forecast), ESP_OK);
    EXPECT_FALSE(forecast.days[0].samples[0].temperature_available);
    EXPECT_TRUE(forecast.days[0].samples[1].temperature_available);
}

TEST(WindProvider, RejectsTimezoneUnitsAndArrayLengthMismatch)
{
    auto config = development_config();
    auto json = fixture();
    wind_forecast_t forecast;
    auto timezone = json;
    timezone.replace(timezone.find("Europe/Amsterdam"), 16, "UTC             ");
    EXPECT_NE(open_meteo_knmi_parse_json(&config, timezone.data(), timezone.size(), 1787544000,
                                         "2026-08-24", &forecast),
              ESP_OK);
    auto bad_unit = json;
    bad_unit.replace(bad_unit.find("\"kn\""), 4, "\"km\"");
    EXPECT_NE(open_meteo_knmi_parse_json(&config, bad_unit.data(), bad_unit.size(), 1787544000,
                                         "2026-08-24", &forecast),
              ESP_OK);
    auto short_array = json;
    short_array.erase(short_array.find(", 49"), 4);
    EXPECT_NE(open_meteo_knmi_parse_json(&config, short_array.data(), short_array.size(), 1787544000,
                                         "2026-08-24", &forecast),
              ESP_OK);
}

TEST(WindProvider, RejectsPartialAndOversizedResponsesWithoutOutputMutation)
{
    auto config = development_config();
    wind_forecast_t forecast;
    std::memset(&forecast, 0x5a, sizeof(forecast));
    auto before = forecast;
    const char *partial = "{\"timezone\":\"Europe/Amsterdam\"}";
    EXPECT_NE(open_meteo_knmi_parse_json(&config, partial, std::strlen(partial), 1787544000,
                                         "2026-08-24", &forecast),
              ESP_OK);
    EXPECT_EQ(std::memcmp(&forecast, &before, sizeof(forecast)), 0);
    std::string oversized(OPEN_METEO_RESPONSE_LIMIT + 1, 'x');
    EXPECT_EQ(open_meteo_knmi_parse_json(&config, oversized.data(), oversized.size(), 1787544000,
                                         "2026-08-24", &forecast),
              ESP_ERR_INVALID_ARG);
}

TEST(WindProvider, FailsClosedAcrossLicensingModes)
{
    auto config = development_config();
    EXPECT_TRUE(open_meteo_knmi_config_valid(&config));
    config.commercial_mode = true;
    config.development_mode = false;
    EXPECT_FALSE(open_meteo_knmi_config_valid(&config));
    config.endpoint = "https://customer.example/v1/forecast";
    EXPECT_FALSE(open_meteo_knmi_config_valid(&config));
    config.api_key = "customer-key";
    EXPECT_TRUE(open_meteo_knmi_config_valid(&config));
}
