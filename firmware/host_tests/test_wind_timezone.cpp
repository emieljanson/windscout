#include <gtest/gtest.h>

#include <atomic>
#include <thread>

extern "C" {
#include "wind_timezone.h"
}

TEST(WindTimezoneTest, ResolvesSeasonalOffsetsAcrossHemispheres)
{
    wind_local_datetime_t local;

    ASSERT_EQ(wind_timezone_from_unix("Europe/Amsterdam", 1767225600, &local), ESP_OK); // 2026-01-01 00:00 UTC
    EXPECT_EQ(local.hour, 1);
    EXPECT_EQ(local.utc_offset_seconds, 3600);
    ASSERT_EQ(wind_timezone_from_unix("Europe/Amsterdam", 1782864000, &local), ESP_OK); // 2026-07-01 00:00 UTC
    EXPECT_EQ(local.hour, 2);
    EXPECT_EQ(local.utc_offset_seconds, 7200);

    ASSERT_EQ(wind_timezone_from_unix("Pacific/Auckland", 1767225600, &local), ESP_OK);
    EXPECT_EQ(local.hour, 13);
    EXPECT_EQ(local.utc_offset_seconds, 13 * 3600);
    ASSERT_EQ(wind_timezone_from_unix("Pacific/Auckland", 1782864000, &local), ESP_OK);
    EXPECT_EQ(local.hour, 12);
    EXPECT_EQ(local.utc_offset_seconds, 12 * 3600);
}

TEST(WindTimezoneTest, SupportsFractionalOffsetsAndZoneLinks)
{
    wind_local_datetime_t local;
    ASSERT_EQ(wind_timezone_from_unix("Asia/Kathmandu", 1767225600, &local), ESP_OK);
    EXPECT_EQ(local.hour, 5);
    EXPECT_EQ(local.minute, 45);
    EXPECT_EQ(local.utc_offset_seconds, 20700);

    ASSERT_EQ(wind_timezone_from_unix("US/Pacific", 1767225600, &local), ESP_OK);
    EXPECT_EQ(local.year, 2025);
    EXPECT_EQ(local.month, 12);
    EXPECT_EQ(local.day, 31);
    EXPECT_EQ(local.hour, 16);
}

TEST(WindTimezoneTest, ConvertsLocalScheduleTimesAcrossDst)
{
    wind_local_datetime_t before = {.year = 2026, .month = 3, .day = 28, .hour = 7};
    wind_local_datetime_t after = {.year = 2026, .month = 3, .day = 29, .hour = 7};
    int64_t before_epoch = 0;
    int64_t after_epoch = 0;
    ASSERT_EQ(wind_timezone_to_unix("Europe/Amsterdam", &before, &before_epoch), ESP_OK);
    ASSERT_EQ(wind_timezone_to_unix("Europe/Amsterdam", &after, &after_epoch), ESP_OK);
    EXPECT_EQ(after_epoch - before_epoch, 23 * 3600);
}

TEST(WindTimezoneTest, RejectsUnknownZonesWithoutAffectingOtherConversions)
{
    wind_local_datetime_t before;
    wind_local_datetime_t after;
    ASSERT_EQ(wind_timezone_from_unix("Asia/Kathmandu", 1767225600, &before), ESP_OK);
    EXPECT_FALSE(wind_timezone_is_supported("Europe/Definitely-Not-A-Zone"));
    EXPECT_EQ(wind_timezone_from_unix("Europe/Definitely-Not-A-Zone", 1767225600,
                                      &after), ESP_ERR_NOT_FOUND);
    ASSERT_EQ(wind_timezone_from_unix("Asia/Kathmandu", 1767225600, &after), ESP_OK);
    EXPECT_EQ(after.utc_offset_seconds, before.utc_offset_seconds);
}

TEST(WindTimezoneTest, DefinesDstGapAndOverlapBehavior)
{
    wind_local_datetime_t spring_gap = {
        .year = 2026, .month = 3, .day = 29, .hour = 2, .minute = 30,
    };
    wind_local_datetime_t autumn_overlap = {
        .year = 2026, .month = 10, .day = 25, .hour = 2, .minute = 30,
    };
    int64_t spring_epoch = 0;
    int64_t autumn_epoch = 0;
    ASSERT_EQ(wind_timezone_to_unix("Europe/Amsterdam", &spring_gap, &spring_epoch), ESP_OK);
    ASSERT_EQ(wind_timezone_to_unix("Europe/Amsterdam", &autumn_overlap, &autumn_epoch), ESP_OK);

    wind_local_datetime_t normalized_spring;
    wind_local_datetime_t normalized_autumn;
    ASSERT_EQ(wind_timezone_from_unix("Europe/Amsterdam", spring_epoch, &normalized_spring), ESP_OK);
    ASSERT_EQ(wind_timezone_from_unix("Europe/Amsterdam", autumn_epoch, &normalized_autumn), ESP_OK);
    EXPECT_EQ(normalized_spring.hour, 3);
    EXPECT_EQ(normalized_spring.minute, 30);
    EXPECT_EQ(normalized_autumn.hour, 2);
    EXPECT_EQ(normalized_autumn.minute, 30);
    EXPECT_EQ(normalized_autumn.utc_offset_seconds, 2 * 3600);
}

TEST(WindTimezoneTest, AppliesCurrentIana2026cRuleChanges)
{
    struct Case {
        const char *zone;
        int64_t unix_seconds;
        int expected_hour;
        int expected_offset;
    } cases[] = {
        {"America/Edmonton", 1798804800, 6, -6 * 3600},
        {"Canada/Mountain", 1798804800, 6, -6 * 3600},
        {"America/Vancouver", 1798804800, 5, -7 * 3600},
        {"Canada/Pacific", 1798804800, 5, -7 * 3600},
        {"Africa/Casablanca", 1790856000, 12, 0},
        {"Africa/El_Aaiun", 1790856000, 12, 0},
    };
    for (const Case &test : cases) {
        wind_local_datetime_t local;
        ASSERT_EQ(wind_timezone_from_unix(test.zone, test.unix_seconds, &local), ESP_OK) << test.zone;
        EXPECT_EQ(local.hour, test.expected_hour) << test.zone;
        EXPECT_EQ(local.utc_offset_seconds, test.expected_offset) << test.zone;
        int64_t round_trip = 0;
        ASSERT_EQ(wind_timezone_to_unix(test.zone, &local, &round_trip), ESP_OK) << test.zone;
        EXPECT_EQ(round_trip, test.unix_seconds) << test.zone;
    }
}

TEST(WindTimezoneTest, KeepsConcurrentZoneConversionsIndependent)
{
    std::atomic<bool> correct = true;
    auto convert = [&correct](const char *zone, int expected_hour) {
        for (int iteration = 0; iteration < 250; ++iteration) {
            wind_local_datetime_t local;
            if (wind_timezone_from_unix(zone, 1767225600, &local) != ESP_OK ||
                local.hour != expected_hour) {
                correct = false;
                return;
            }
        }
    };
    std::thread amsterdam(convert, "Europe/Amsterdam", 1);
    std::thread auckland(convert, "Pacific/Auckland", 13);
    std::thread kathmandu(convert, "Asia/Kathmandu", 5);
    amsterdam.join();
    auckland.join();
    kathmandu.join();
    EXPECT_TRUE(correct.load());
}
