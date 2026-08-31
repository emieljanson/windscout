#include <gtest/gtest.h>

#include <vector>

extern "C" {
#include "wind_clock.h"
}

namespace {
struct FakeClock {
    time_t rtc_value = 1787932800;
    esp_err_t rtc_read_result = ESP_OK;
    esp_err_t rtc_write_result = ESP_OK;
    esp_err_t system_write_result = ESP_OK;
    std::vector<char> writes;
    time_t system_value = 0;
};

esp_err_t read_rtc(void *context, time_t *value)
{
    auto *clock = static_cast<FakeClock *>(context);
    if (clock->rtc_read_result == ESP_OK) *value = clock->rtc_value;
    return clock->rtc_read_result;
}

esp_err_t write_rtc(void *context, time_t value)
{
    auto *clock = static_cast<FakeClock *>(context);
    clock->writes.push_back('r');
    clock->rtc_value = value;
    return clock->rtc_write_result;
}

esp_err_t write_system(void *context, time_t value)
{
    auto *clock = static_cast<FakeClock *>(context);
    clock->writes.push_back('s');
    clock->system_value = value;
    return clock->system_write_result;
}
}

TEST(WindClockTest, WritesRtcBeforeSystemClock)
{
    FakeClock clock;
    ASSERT_EQ(wind_clock_set_unix(1787932800, &clock, write_rtc, write_system), ESP_OK);
    EXPECT_EQ(clock.writes, (std::vector<char>{'r', 's'}));
    EXPECT_EQ(clock.rtc_value, 1787932800);
    EXPECT_EQ(clock.system_value, 1787932800);
}

TEST(WindClockTest, StopsWhenEitherClockWriteFails)
{
    FakeClock rtc_failure;
    rtc_failure.rtc_write_result = ESP_FAIL;
    EXPECT_EQ(wind_clock_set_unix(1787932800, &rtc_failure, write_rtc, write_system), ESP_FAIL);
    EXPECT_EQ(rtc_failure.writes, (std::vector<char>{'r'}));

    FakeClock system_failure;
    system_failure.system_write_result = ESP_FAIL;
    EXPECT_EQ(wind_clock_set_unix(1787932800, &system_failure, write_rtc, write_system), ESP_FAIL);
    EXPECT_EQ(system_failure.writes, (std::vector<char>{'r', 's'}));
}

TEST(WindClockTest, RejectsImplausibleTimes)
{
    FakeClock clock;
    EXPECT_EQ(wind_clock_set_unix(1735689599, &clock, write_rtc, write_system),
              ESP_ERR_INVALID_ARG);
    EXPECT_EQ(wind_clock_set_unix(4102444800, &clock, write_rtc, write_system),
              ESP_ERR_INVALID_ARG);
    EXPECT_TRUE(clock.writes.empty());
}

TEST(WindClockTest, RestoresOnlyPlausibleRetainedRtcValues)
{
    FakeClock clock;
    ASSERT_EQ(wind_clock_restore_from_rtc(&clock, read_rtc, write_system), ESP_OK);
    EXPECT_EQ(clock.system_value, clock.rtc_value);

    FakeClock old_clock;
    old_clock.rtc_value = 1704067200;
    EXPECT_EQ(wind_clock_restore_from_rtc(&old_clock, read_rtc, write_system),
              ESP_ERR_INVALID_STATE);
    EXPECT_TRUE(old_clock.writes.empty());

    FakeClock read_failure;
    read_failure.rtc_read_result = ESP_FAIL;
    EXPECT_EQ(wind_clock_restore_from_rtc(&read_failure, read_rtc, write_system), ESP_FAIL);
    EXPECT_TRUE(read_failure.writes.empty());
}
