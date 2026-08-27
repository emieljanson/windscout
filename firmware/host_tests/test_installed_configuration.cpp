#include <gtest/gtest.h>

extern "C" {
#include "installed_configuration.h"
}

TEST(InstalledConfigurationTest, DefaultIsValidAndStable)
{
    installed_configuration_t config;
    installed_configuration_default(&config);

    EXPECT_TRUE(installed_configuration_validate(&config));
    EXPECT_STREQ(config.board_id, WINDSCOUT_BOARD_ID);
    EXPECT_STREQ(config.spot.id, "brouwersdam");
    EXPECT_EQ(installed_configuration_digest(&config), UINT64_C(0xf70d51b9a49fdddb));
}

TEST(InstalledConfigurationTest, RejectsUnsupportedAndOutOfBoundsValues)
{
    installed_configuration_t config;
    installed_configuration_default(&config);
    config.spot.latitude = 90.0001;
    EXPECT_FALSE(installed_configuration_validate(&config));

    installed_configuration_default(&config);
    config.version++;
    EXPECT_FALSE(installed_configuration_validate(&config));

    installed_configuration_default(&config);
    config.board_id[0] = 'x';
    EXPECT_FALSE(installed_configuration_validate(&config));
}

TEST(InstalledConfigurationTest, InterruptedCandidateNeverReplacesActive)
{
    installed_configuration_reset_host_storage();
    installed_configuration_t original;
    installed_configuration_default(&original);
    ASSERT_EQ(installed_configuration_promote(&original), ESP_OK);

    installed_configuration_t candidate = original;
    snprintf(candidate.spot.id, sizeof(candidate.spot.id), "edam");
    snprintf(candidate.spot.display_name, sizeof(candidate.spot.display_name), "EDAM");
    candidate.spot.latitude = 52.5126;
    candidate.spot.longitude = 5.0486;
    candidate.generation++;

    for (int boundary = 0; boundary < INSTALLED_CONFIGURATION_WRITE_BOUNDARY_COUNT; ++boundary) {
        installed_configuration_set_host_failure_boundary(boundary);
        EXPECT_NE(installed_configuration_promote(&candidate), ESP_OK);
        installed_configuration_t loaded;
        ASSERT_EQ(installed_configuration_load(&loaded), ESP_OK);
        EXPECT_STREQ(loaded.spot.id, original.spot.id);
    }

    installed_configuration_set_host_failure_boundary(-1);
    ASSERT_EQ(installed_configuration_promote(&candidate), ESP_OK);
    installed_configuration_t loaded;
    ASSERT_EQ(installed_configuration_load(&loaded), ESP_OK);
    EXPECT_STREQ(loaded.spot.id, "edam");
}
