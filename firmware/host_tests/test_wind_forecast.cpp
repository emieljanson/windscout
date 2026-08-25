#include <gtest/gtest.h>

#include <cstring>

extern "C" {
#include "wind_forecast.h"
}

static wind_forecast_t complete_forecast()
{
    wind_forecast_t forecast;
    wind_forecast_clear(&forecast);
    std::strcpy(forecast.spot_id, "edam");
    std::strcpy(forecast.spot_name, "Edam");
    std::strcpy(forecast.timezone, "Europe/Amsterdam");
    std::strcpy(forecast.provider, "open-meteo");
    std::strcpy(forecast.model, "knmi_seamless");
    forecast.latitude = 52.5126;
    forecast.longitude = 5.0486;
    forecast.retrieved_at = 1787544000;
    const int hours[] = {8, 11, 14, 17, 20};
    for (int day = 0; day < 5; ++day) {
        std::snprintf(forecast.days[day].local_date, sizeof(forecast.days[day].local_date),
                      "2026-08-%02d", 24 + day);
        for (int sample = 0; sample < 5; ++sample) {
            forecast.days[day].samples[sample] = {
                1787544000 + day * 86400 + sample * 10800, static_cast<uint8_t>(hours[sample]),
                static_cast<int16_t>(10 + sample), static_cast<int16_t>(15 + sample),
                static_cast<uint16_t>(sample * 45)};
        }
    }
    return forecast;
}

TEST(WindForecast, ValidatesExactlyFiveOrderedDaysAndSamples)
{
    auto forecast = complete_forecast();
    EXPECT_TRUE(wind_forecast_validate(&forecast));
    EXPECT_EQ(wind_forecast_sample(&forecast, 4, 4)->local_hour, 20);
    EXPECT_EQ(wind_forecast_sample(&forecast, 5, 0), nullptr);
}

TEST(WindForecast, RejectsMissingDuplicateAndOutOfOrderSamples)
{
    auto forecast = complete_forecast();
    forecast.days[2].samples[2].local_hour = 11;
    EXPECT_FALSE(wind_forecast_validate(&forecast));
    forecast = complete_forecast();
    forecast.days[3].samples[0].timestamp = forecast.days[2].samples[4].timestamp;
    EXPECT_FALSE(wind_forecast_validate(&forecast));
}

TEST(WindForecast, RoundsKnotsAndClassifiesChartOverflow)
{
    EXPECT_EQ(wind_forecast_round_knots(12.49), 12);
    EXPECT_EQ(wind_forecast_round_knots(12.5), 13);
    EXPECT_FALSE(wind_forecast_is_overflow(40));
    EXPECT_TRUE(wind_forecast_is_overflow(41));
}

TEST(WindForecast, ConvertsSourceDirectionToDestinationDirection)
{
    EXPECT_EQ(wind_forecast_destination_degrees(0), 180);
    EXPECT_EQ(wind_forecast_destination_degrees(90), 270);
    EXPECT_EQ(wind_forecast_destination_degrees(180), 0);
    EXPECT_EQ(wind_forecast_destination_degrees(270), 90);
    EXPECT_EQ(wind_forecast_destination_degrees(359), 179);
}

TEST(WindForecast, ClassifiesWeatherAtExactCloudAndRainBoundaries)
{
    wind_forecast_sample_t sample{};
    sample.weather_available = 1;
    sample.is_day = 1;
    sample.cloud_cover_percent = 20;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_CLEAR_DAY);
    sample.is_day = 0;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_CLEAR_NIGHT);
    sample.cloud_cover_percent = 21;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_PARTLY_CLOUDY_NIGHT);
    sample.cloud_cover_percent = 60;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_PARTLY_CLOUDY_NIGHT);
    sample.cloud_cover_percent = 61;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_CLOUDY);
    sample.precipitation_hundredths_mm = 9;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_CLOUDY);
    sample.precipitation_hundredths_mm = 10;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_LIGHT_RAIN);
    sample.precipitation_hundredths_mm = 99;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_LIGHT_RAIN);
    sample.precipitation_hundredths_mm = 100;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_RAIN);
    sample.precipitation_hundredths_mm = 249;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_RAIN);
    sample.precipitation_hundredths_mm = 250;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_HEAVY_RAIN);
    sample.weather_available = 0;
    EXPECT_EQ(wind_forecast_weather_state(&sample), WIND_WEATHER_UNAVAILABLE);
}
