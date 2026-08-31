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
                            int64_t start = 1787695200, bool include_quarters = true,
                            bool flat = false)
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
        else json << (flat ? 0.1 : std::sin(index / 6.0) * 0.8);
    }
    json << "]}";
    if (include_quarters) {
        const int quarter_count = (count - 1) * 4 + 1;
        json << ",\"minutely_15_units\":{\"time\":\"unixtime\","
                "\"sea_level_height_msl\":\"m\"},\"minutely_15\":{\"time\":[";
        for (int index = 0; index < quarter_count; ++index) {
            if (index) json << ',';
            json << start + index * 900;
        }
        json << "],\"sea_level_height_msl\":[";
        for (int index = 0; index < quarter_count; ++index) {
            if (index) json << ',';
            json << (flat ? 0.1 : std::cos((index - 25) * std::acos(-1.0) / 24.0) * 0.8);
        }
        json << "]}";
    }
    json << '}';
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
    ASSERT_GT(tide.extremum_count, 0);
    bool found_quarter_high = false;
    for (size_t index = 0; index < tide.extremum_count; ++index) {
        const auto &extremum = tide.extrema[index];
        found_quarter_high = found_quarter_high ||
            (std::strcmp(extremum.local_date, "2026-08-26") == 0 &&
             extremum.local_hour == 6 && extremum.local_minute == 15 && extremum.is_high);
    }
    EXPECT_TRUE(found_quarter_high);
}

TEST(OpenMeteoMarineProvider, FallsBackToHourlyExtremaWhenQuarterSeriesIsAbsent)
{
    auto settings = config();
    auto json = response(false, false, 120, 1787695200, false);
    wind_tide_t tide;
    ASSERT_EQ(open_meteo_marine_parse_json(&settings, json.data(), json.size(), 1787698800, &tide),
              ESP_OK);
    ASSERT_GT(tide.extremum_count, 0);
    for (size_t index = 0; index < tide.extremum_count; ++index) {
        EXPECT_EQ(tide.extrema[index].local_minute, 0);
    }
}

TEST(OpenMeteoMarineProvider, MarksFlatSeriesUnsupportedInsteadOfDrawingUnlabeledTide)
{
    auto settings = config();
    auto json = response(false, false, 120, 1787695200, true, true);
    wind_tide_t tide;
    ASSERT_EQ(open_meteo_marine_parse_json(&settings, json.data(), json.size(), 1787698800, &tide),
              ESP_OK);
    EXPECT_EQ(tide.capability, WIND_TIDE_UNSUPPORTED);
    EXPECT_EQ(tide.sample_count, 0);
    EXPECT_EQ(tide.extremum_count, 0);
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
