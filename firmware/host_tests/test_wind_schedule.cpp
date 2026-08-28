#include <gtest/gtest.h>

#include <cstdlib>
#include <filesystem>

extern "C" {
#include "wind_schedule.h"
#include "wind_timezone.h"
}

static const char *TIMEZONE = "Europe/Amsterdam";

static time_t local_time(int year, int month, int day, int hour, int minute)
{
    wind_local_datetime_t value = {
        .year = (int16_t) year, .month = (uint8_t) month, .day = (uint8_t) day,
        .hour = (uint8_t) hour, .minute = (uint8_t) minute,
    };
    int64_t unix_seconds = 0;
    EXPECT_EQ(wind_timezone_to_unix(TIMEZONE, &value, &unix_seconds), ESP_OK);
    return (time_t) unix_seconds;
}

class WindScheduleTest : public testing::Test {};

TEST_F(WindScheduleTest, SelectsAllFixedBoundariesAndNextBoundary)
{
    const int hours[] = {0, 7, 11, 15, 19};
    const int minutes[] = {5, 0, 0, 0, 0};
    for (int i = 0; i < 5; ++i) {
        time_t at = local_time(2026, 8, 24, hours[i], minutes[i]);
        EXPECT_EQ(wind_schedule_latest_boundary(TIMEZONE, at), at);
    }
    EXPECT_EQ(wind_schedule_next_boundary(TIMEZONE, local_time(2026, 8, 24, 19, 0)),
              local_time(2026, 8, 25, 0, 5));
}

TEST_F(WindScheduleTest, AttemptsAutomaticallyOncePerBoundaryAndManualDoesNotAlterState)
{
    wind_schedule_state_t state;
    ASSERT_EQ(wind_schedule_state_set_scope(&state, "edam", "Europe/Amsterdam"), ESP_OK);
    time_t now = local_time(2026, 8, 24, 11, 30);
    int64_t boundary = 0;
    ASSERT_TRUE(wind_schedule_is_due(&state, now, &boundary));
    wind_schedule_mark_attempted(&state, boundary);
    EXPECT_FALSE(wind_schedule_is_due(&state, now, nullptr));
    EXPECT_TRUE(wind_schedule_is_due(&state, local_time(2026, 8, 24, 15, 1), nullptr));
}

TEST_F(WindScheduleTest, HandlesDstDaysUsingLocalWallClock)
{
    time_t before_jump = local_time(2026, 3, 29, 0, 6);
    EXPECT_EQ(wind_schedule_next_boundary(TIMEZONE, before_jump),
              local_time(2026, 3, 29, 7, 0));
    time_t repeated_hour_day = local_time(2026, 10, 25, 19, 1);
    EXPECT_EQ(wind_schedule_next_boundary(TIMEZONE, repeated_hour_day),
              local_time(2026, 10, 26, 0, 5));
}

TEST_F(WindScheduleTest, OffersOneRetryBeforeTheNextRegularBoundary)
{
    wind_schedule_state_t state;
    ASSERT_EQ(wind_schedule_state_set_scope(&state, "edam", "Europe/Amsterdam"), ESP_OK);
    const time_t failed_at = local_time(2026, 8, 24, 11, 0);
    const int64_t boundary = wind_schedule_latest_boundary(TIMEZONE, failed_at);
    wind_schedule_mark_attempted(&state, boundary);
    wind_schedule_schedule_retry(&state, boundary, failed_at + 5 * 60);

    EXPECT_EQ(wind_schedule_next_attempt(&state, failed_at), failed_at + 5 * 60);
    EXPECT_FALSE(wind_schedule_retry_is_due(&state, failed_at + 4 * 60, nullptr));
    EXPECT_TRUE(wind_schedule_retry_is_due(&state, failed_at + 5 * 60, nullptr));

    wind_schedule_consume_retry(&state);
    EXPECT_FALSE(wind_schedule_retry_is_due(&state, failed_at + 10 * 60, nullptr));
    EXPECT_EQ(wind_schedule_next_attempt(&state, failed_at + 5 * 60),
              wind_schedule_next_boundary(TIMEZONE, failed_at + 5 * 60));
}

TEST_F(WindScheduleTest, PersistsScopeAndRejectsStateFromAnotherSpot)
{
    auto path = std::filesystem::temp_directory_path() / "einkwind-schedule-scope-test";
    std::filesystem::remove(path);
    std::filesystem::remove(path.string() + ".tmp");

    wind_schedule_state_t state;
    ASSERT_EQ(wind_schedule_state_set_scope(&state, "edam", "Europe/Amsterdam"), ESP_OK);
    ASSERT_EQ(wind_schedule_state_set_scope(&state, "edam", "Europe/Amsterdam"), ESP_OK);
    const time_t boundary = local_time(2026, 8, 24, 11, 0);
    wind_schedule_mark_attempted(&state, boundary);
    wind_schedule_schedule_retry(&state, boundary, boundary + 5 * 60);
    ASSERT_EQ(wind_schedule_state_store(path.c_str(), &state), ESP_OK);

    wind_schedule_state_t loaded;
    ASSERT_EQ(wind_schedule_state_load_scoped(path.c_str(), "edam", "Europe/Amsterdam", &loaded),
              ESP_OK);
    EXPECT_EQ(loaded.last_attempted_boundary, state.last_attempted_boundary);
    EXPECT_EQ(loaded.retry_at, boundary + 5 * 60);
    EXPECT_EQ(loaded.retry_boundary, boundary);

    EXPECT_EQ(wind_schedule_state_load_scoped(path.c_str(), "brouwersdam", "Europe/Amsterdam",
                                              &loaded),
              ESP_ERR_INVALID_STATE);
    EXPECT_TRUE(wind_schedule_state_matches_scope(&loaded, "brouwersdam", "Europe/Amsterdam"));
    EXPECT_EQ(loaded.last_attempted_boundary, 0);

    std::filesystem::remove(path);
    std::filesystem::remove(path.string() + ".tmp");
}
