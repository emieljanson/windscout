#include <gtest/gtest.h>

#include <cstdlib>
#include <filesystem>

extern "C" {
#include "wind_schedule.h"
}

static time_t local_time(int year, int month, int day, int hour, int minute)
{
    tm value = {};
    value.tm_year = year - 1900;
    value.tm_mon = month - 1;
    value.tm_mday = day;
    value.tm_hour = hour;
    value.tm_min = minute;
    value.tm_isdst = -1;
    return mktime(&value);
}

class WindScheduleTest : public testing::Test {
  protected:
    void SetUp() override
    {
        setenv("TZ", "Europe/Amsterdam", 1);
        tzset();
    }
};

TEST_F(WindScheduleTest, SelectsAllFixedBoundariesAndNextBoundary)
{
    const int hours[] = {0, 7, 11, 15, 19};
    const int minutes[] = {5, 0, 0, 0, 0};
    for (int i = 0; i < 5; ++i) {
        time_t at = local_time(2026, 8, 24, hours[i], minutes[i]);
        EXPECT_EQ(wind_schedule_latest_boundary(at), at);
    }
    EXPECT_EQ(wind_schedule_next_boundary(local_time(2026, 8, 24, 19, 0)),
              local_time(2026, 8, 25, 0, 5));
}

TEST_F(WindScheduleTest, AttemptsAutomaticallyOncePerBoundaryAndManualDoesNotAlterState)
{
    wind_schedule_state_t state;
    wind_schedule_state_clear(&state);
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
    EXPECT_EQ(wind_schedule_next_boundary(before_jump), local_time(2026, 3, 29, 7, 0));
    time_t repeated_hour_day = local_time(2026, 10, 25, 19, 1);
    EXPECT_EQ(wind_schedule_next_boundary(repeated_hour_day), local_time(2026, 10, 26, 0, 5));
}

TEST_F(WindScheduleTest, PersistsScopeAndRejectsStateFromAnotherSpot)
{
    auto path = std::filesystem::temp_directory_path() / "einkwind-schedule-scope-test";
    std::filesystem::remove(path);
    std::filesystem::remove(path.string() + ".tmp");

    wind_schedule_state_t state;
    wind_schedule_state_clear(&state);
    ASSERT_EQ(wind_schedule_state_set_scope(&state, "edam", "Europe/Amsterdam"), ESP_OK);
    wind_schedule_mark_attempted(&state, local_time(2026, 8, 24, 11, 0));
    ASSERT_EQ(wind_schedule_state_store(path.c_str(), &state), ESP_OK);

    wind_schedule_state_t loaded;
    ASSERT_EQ(wind_schedule_state_load_scoped(path.c_str(), "edam", "Europe/Amsterdam", &loaded),
              ESP_OK);
    EXPECT_EQ(loaded.last_attempted_boundary, state.last_attempted_boundary);

    EXPECT_EQ(wind_schedule_state_load_scoped(path.c_str(), "brouwersdam", "Europe/Amsterdam",
                                              &loaded),
              ESP_ERR_INVALID_STATE);
    EXPECT_TRUE(wind_schedule_state_matches_scope(&loaded, "brouwersdam", "Europe/Amsterdam"));
    EXPECT_EQ(loaded.last_attempted_boundary, 0);

    std::filesystem::remove(path);
    std::filesystem::remove(path.string() + ".tmp");
}
