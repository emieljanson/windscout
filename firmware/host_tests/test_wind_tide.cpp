#include <gtest/gtest.h>

#include <cstdio>
#include <cstring>

extern "C" {
#include "wind_tide.h"
}

static wind_tide_t complete_tide(int count = 120)
{
    wind_tide_t tide;
    wind_tide_clear(&tide);
    std::strcpy(tide.spot_id, "brouwersdam");
    std::strcpy(tide.timezone, "Europe/Amsterdam");
    std::strcpy(tide.provider, "open-meteo-marine");
    tide.retrieved_at = 1787695200;
    tide.capability = WIND_TIDE_AVAILABLE;
    tide.sample_count = static_cast<uint16_t>(count);
    for (int index = 0; index < count; ++index) {
        auto &sample = tide.samples[index];
        sample.timestamp = 1787695200 + index * 3600;
        std::snprintf(sample.local_date, sizeof(sample.local_date), "2026-08-%02d",
                      26 + index / 24);
        sample.local_hour = static_cast<uint8_t>(index % 24);
        sample.sea_level_mm = index - 60;
    }
    return tide;
}

TEST(WindTide, ValidatesAvailableAndUnsupportedStates)
{
    auto tide = complete_tide();
    EXPECT_TRUE(wind_tide_validate(&tide));
    wind_tide_clear(&tide);
    std::strcpy(tide.spot_id, "edam");
    std::strcpy(tide.timezone, "Europe/Amsterdam");
    std::strcpy(tide.provider, "open-meteo-marine");
    tide.retrieved_at = 1787695200;
    tide.capability = WIND_TIDE_UNSUPPORTED;
    EXPECT_TRUE(wind_tide_validate(&tide));
}

TEST(WindTide, RejectsMisalignedOrOversizedSeries)
{
    auto tide = complete_tide();
    tide.samples[20].timestamp += 60;
    EXPECT_FALSE(wind_tide_validate(&tide));
    tide = complete_tide();
    tide.sample_count = WIND_TIDE_MAX_SAMPLES + 1;
    EXPECT_FALSE(wind_tide_validate(&tide));
}
