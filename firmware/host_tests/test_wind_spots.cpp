#include <gtest/gtest.h>

#include <cstring>

extern "C" {
#include "wind_spots.h"
}

TEST(WindSpotsTest, HasStableProductOrder)
{
    ASSERT_EQ(wind_spots_count(), 3u);
    EXPECT_STREQ(wind_spots_at(0)->id, "edam");
    EXPECT_STREQ(wind_spots_at(1)->id, "brouwersdam");
    EXPECT_STREQ(wind_spots_at(2)->id, "castricum-aan-zee");
}

TEST(WindSpotsTest, NavigationWrapsInBothDirections)
{
    EXPECT_EQ(wind_spots_offset(0, 1), 1u);
    EXPECT_EQ(wind_spots_offset(2, 1), 0u);
    EXPECT_EQ(wind_spots_offset(0, -1), 2u);
    EXPECT_EQ(wind_spots_offset(1, -1), 0u);
}

TEST(WindSpotsTest, SelectionPersistsByIndexOnHost)
{
    ASSERT_EQ(wind_spots_store_selected(2), ESP_OK);
    size_t selected = 0;
    ASSERT_EQ(wind_spots_load_selected(&selected), ESP_OK);
    EXPECT_EQ(selected, 2u);
    EXPECT_EQ(wind_spots_store_selected(99), ESP_ERR_INVALID_ARG);
}
