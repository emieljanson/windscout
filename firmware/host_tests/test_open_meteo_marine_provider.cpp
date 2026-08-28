#include <gtest/gtest.h>

#include <cmath>
#include <cstring>
#include <sstream>

extern "C" {
#include "open_meteo_marine_provider.h"
#include "wind_timezone.h"
}

static open_meteo_marine_config_t config()
{
    return {"brouwersdam", 51.7506, 3.8577, "Europe/Amsterdam"};
}

static std::string response(bool unsupported = false, bool partial = false, int count = 120,
                            int64_t start = 1787695200)
{
    std::ostringstream json;
    json << "{\"timezone\":\"Europe/Amsterdam\",\"hourly_units\":{"
            "\"time\":\"unixtime\",\"sea_level_height_msl\":\"m\"},\"hourly\":{"
            "\"time\":[";
    for (int index = 0; index < count; ++index) {
        if (index) json << ',';
        json << start + index * 3600;
    }
    json << "],\"sea_level_height_msl\":[";
    for (int index = 0; index < count; ++index) {
        if (index) json << ',';
        if (unsupported || (partial && index == 12)) json << "null";
        else json << std::sin(index / 6.0) * 0.8;
    }
    json << "]}}";
    return json.str();
}

TEST(OpenMeteoMarineProvider, PreservesBothTwoOClockHoursAcrossAutumnDst)
{
    auto settings = config();
    const int64_t start = 1792792800; // 2026-10-24 00:00 Europe/Amsterdam
    auto json = response(false, false, 121, start);
    wind_tide_t tide;
    ASSERT_EQ(open_meteo_marine_parse_json(&settings, json.data(), json.size(), 1792796400, &tide),
              ESP_OK);
    int repeated = 0;
    for (size_t index = 0; index < tide.sample_count; ++index) {
        if (std::strcmp(tide.samples[index].local_date, "2026-10-25") == 0 &&
            tide.samples[index].local_hour == 2) ++repeated;
    }
    EXPECT_EQ(repeated, 2);
}

TEST(OpenMeteoMarineProvider, ParsesCompleteHourlySeries)
{
    auto settings = config();
    auto json = response();
    wind_tide_t tide;
    ASSERT_EQ(open_meteo_marine_parse_json(&settings, json.data(), json.size(), 1787698800, &tide),
              ESP_OK);
    EXPECT_EQ(tide.capability, WIND_TIDE_AVAILABLE);
    EXPECT_EQ(tide.sample_count, 120);
    EXPECT_STREQ(tide.samples[0].local_date, "2026-08-26");
    EXPECT_EQ(tide.samples[0].local_hour, 0);
}

TEST(OpenMeteoMarineProvider, DistinguishesUnsupportedFromInvalidPartialData)
{
    auto settings = config();
    wind_tide_t tide;
    auto unsupported = response(true);
    ASSERT_EQ(open_meteo_marine_parse_json(&settings, unsupported.data(), unsupported.size(),
                                            1787698800, &tide), ESP_OK);
    EXPECT_EQ(tide.capability, WIND_TIDE_UNSUPPORTED);
    EXPECT_EQ(tide.sample_count, 0);
    auto partial = response(false, true);
    EXPECT_EQ(open_meteo_marine_parse_json(&settings, partial.data(), partial.size(),
                                            1787698800, &tide), ESP_ERR_INVALID_RESPONSE);
}

TEST(OpenMeteoMarineProvider, RejectsMisalignedTimesWithoutMutatingOutput)
{
    auto settings = config();
    auto json = response();
    const auto timestamp = json.find("1787702400");
    ASSERT_NE(timestamp, std::string::npos);
    json.replace(timestamp, 10, "1787702460");
    wind_tide_t tide;
    std::memset(&tide, 0x5a, sizeof(tide));
    auto before = tide;
    EXPECT_EQ(open_meteo_marine_parse_json(&settings, json.data(), json.size(), 1787698800, &tide),
              ESP_ERR_INVALID_RESPONSE);
    EXPECT_EQ(std::memcmp(&tide, &before, sizeof(tide)), 0);
}
