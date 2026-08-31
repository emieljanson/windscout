#include <gtest/gtest.h>

#include <fstream>
#include <sstream>
#include <string>

extern "C" {
#include "hardware_profile.h"
#include "installed_configuration.h"
}

class HardwareProfileTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        hardware_profile_reset_host_storage();
        installed_configuration_reset_host_storage();
    }
};

static hardware_profile_state_t boot(bool side_buttons_held = false)
{
    hardware_profile_state_t state = {};
    EXPECT_EQ(hardware_profile_boot(side_buttons_held, &state), ESP_OK);
    return state;
}

static hardware_profile_update_result_t select_model(
    hardware_model_t model, hardware_profile_source_t source, uint32_t expected_revision)
{
    hardware_profile_update_result_t result = {};
    EXPECT_EQ(hardware_profile_select(model, source, expected_revision, &result), ESP_OK);
    return result;
}

TEST_F(HardwareProfileTest, MissingOrInvalidRecordsBootUnknownAndCannotUsePanel)
{
    auto state = boot();
    EXPECT_EQ(state.stored_model, HARDWARE_MODEL_UNKNOWN);
    EXPECT_EQ(state.effective_model, HARDWARE_MODEL_UNKNOWN);
    EXPECT_EQ(state.source, HARDWARE_PROFILE_SOURCE_NONE);
    EXPECT_FALSE(hardware_profile_can_use_panel());

    hardware_profile_seed_invalid_host_record(HARDWARE_PROFILE_HOST_RECORD_CORRUPT);
    state = boot();
    EXPECT_EQ(state.effective_model, HARDWARE_MODEL_UNKNOWN);

    hardware_profile_seed_invalid_host_record(HARDWARE_PROFILE_HOST_RECORD_UNCOMMITTED);
    state = boot();
    EXPECT_EQ(state.effective_model, HARDWARE_MODEL_UNKNOWN);

    hardware_profile_seed_invalid_host_record(HARDWARE_PROFILE_HOST_RECORD_UNSUPPORTED_VERSION);
    state = boot();
    EXPECT_EQ(state.effective_model, HARDWARE_MODEL_UNKNOWN);
}

TEST_F(HardwareProfileTest, FixedE1002BuildNeedsNoOwnerModelChoice)
{
    boot();
    EXPECT_TRUE(hardware_profile_can_use_panel_for_fixed_model(HARDWARE_MODEL_E1002));
    EXPECT_FALSE(hardware_profile_can_use_panel());

    boot(true);
    EXPECT_FALSE(hardware_profile_can_use_panel_for_fixed_model(HARDWARE_MODEL_E1002));

    hardware_profile_reset_host_storage();
    boot();
    select_model(HARDWARE_MODEL_E1001, HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 0);
    boot();
    EXPECT_FALSE(hardware_profile_can_use_panel_for_fixed_model(HARDWARE_MODEL_E1002));
}

TEST_F(HardwareProfileTest, SelectionActivatesOnlyAfterCommittedReadbackAndReboot)
{
    auto before = boot();
    auto update = select_model(HARDWARE_MODEL_E1001,
                               HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION,
                               before.revision);
    EXPECT_TRUE(update.reboot_required);
    EXPECT_FALSE(update.idempotent);
    EXPECT_EQ(update.committed_revision, 1u);
    EXPECT_FALSE(hardware_profile_can_use_panel());

    const auto after = boot();
    EXPECT_EQ(after.stored_model, HARDWARE_MODEL_E1001);
    EXPECT_EQ(after.effective_model, HARDWARE_MODEL_E1001);
    EXPECT_EQ(after.source, HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION);
    EXPECT_EQ(after.revision, 1u);
    EXPECT_TRUE(hardware_profile_can_use_panel());
}

TEST_F(HardwareProfileTest, IdenticalRetryIsIdempotentButStaleOrConflictingSessionIsRejected)
{
    boot();
    const auto first = select_model(HARDWARE_MODEL_E1001,
                                    HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 0);
    EXPECT_EQ(first.committed_revision, 1u);

    hardware_profile_update_result_t stale = {};
    EXPECT_EQ(hardware_profile_select(HARDWARE_MODEL_E1002,
                                      HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 0, &stale),
              ESP_ERR_INVALID_STATE);

    boot();
    hardware_profile_update_result_t same = {};
    EXPECT_EQ(hardware_profile_select(HARDWARE_MODEL_E1001,
                                      HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 1, &same),
              ESP_OK);
    EXPECT_TRUE(same.idempotent);
    EXPECT_FALSE(same.reboot_required);
    EXPECT_EQ(same.committed_revision, 1u);

    hardware_profile_update_result_t conflict = {};
    EXPECT_EQ(hardware_profile_select(HARDWARE_MODEL_E1002,
                                      HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 1, &conflict),
              ESP_ERR_INVALID_STATE);
}

TEST_F(HardwareProfileTest, OnlyLiveLegacyE1002EvidenceCanSeedLegacyIdentity)
{
    boot();
    hardware_profile_update_result_t result = {};
    EXPECT_EQ(hardware_profile_select(HARDWARE_MODEL_E1001,
                                      HARDWARE_PROFILE_SOURCE_LIVE_LEGACY_E1002_HELLO,
                                      0, &result), ESP_ERR_INVALID_ARG);

    EXPECT_EQ(hardware_profile_select(HARDWARE_MODEL_E1002,
                                      HARDWARE_PROFILE_SOURCE_LIVE_LEGACY_E1002_HELLO,
                                      0, &result), ESP_OK);
    EXPECT_TRUE(result.reboot_required);
    EXPECT_EQ(boot().effective_model, HARDWARE_MODEL_E1002);
}

TEST_F(HardwareProfileTest, InstalledWeatherConfigurationNeverSeedsHardwareIdentity)
{
    installed_configuration_t configuration;
    installed_configuration_default(&configuration);
    ASSERT_EQ(installed_configuration_promote(&configuration), ESP_OK);

    const auto state = boot();
    EXPECT_EQ(state.stored_model, HARDWARE_MODEL_UNKNOWN);
    EXPECT_EQ(state.source, HARDWARE_PROFILE_SOURCE_NONE);
}

TEST_F(HardwareProfileTest, InterruptedWriteKeepsPreviousProfileOrUnknown)
{
    for (int boundary = 0; boundary < HARDWARE_PROFILE_WRITE_BOUNDARY_COUNT; ++boundary) {
        hardware_profile_reset_host_storage();
        boot();
        hardware_profile_set_host_failure_boundary(boundary);
        hardware_profile_update_result_t result = {};
        EXPECT_NE(hardware_profile_select(HARDWARE_MODEL_E1001,
                                          HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION,
                                          0, &result), ESP_OK);
        EXPECT_EQ(boot().effective_model, HARDWARE_MODEL_UNKNOWN);
    }

    hardware_profile_reset_host_storage();
    boot();
    select_model(HARDWARE_MODEL_E1001, HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 0);
    ASSERT_EQ(boot().effective_model, HARDWARE_MODEL_E1001);
    for (int boundary = 0; boundary < HARDWARE_PROFILE_WRITE_BOUNDARY_COUNT; ++boundary) {
        hardware_profile_set_host_failure_boundary(boundary);
        hardware_profile_update_result_t result = {};
        EXPECT_NE(hardware_profile_clear(1, &result), ESP_OK);
        EXPECT_EQ(boot().effective_model, HARDWARE_MODEL_E1001);
    }
}

TEST_F(HardwareProfileTest, SideButtonChordForcesOneSafeBootWithoutErasingStoredProfile)
{
    boot();
    select_model(HARDWARE_MODEL_E1002, HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 0);
    ASSERT_EQ(boot().effective_model, HARDWARE_MODEL_E1002);

    auto safe = boot(true);
    EXPECT_TRUE(safe.safe_boot_override);
    EXPECT_EQ(safe.stored_model, HARDWARE_MODEL_E1002);
    EXPECT_EQ(safe.effective_model, HARDWARE_MODEL_UNKNOWN);
    EXPECT_FALSE(hardware_profile_can_use_panel());

    auto normal = boot(false);
    EXPECT_FALSE(normal.safe_boot_override);
    EXPECT_EQ(normal.effective_model, HARDWARE_MODEL_E1002);
}

TEST_F(HardwareProfileTest, DriverFailureStaysLatchedUntilSameDriverRetryOrProfileClear)
{
    boot();
    select_model(HARDWARE_MODEL_E1001, HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION, 0);
    ASSERT_EQ(boot().effective_model, HARDWARE_MODEL_E1001);
    ASSERT_EQ(hardware_profile_record_driver_failure(HARDWARE_MODEL_E1001,
                                                     HARDWARE_DRIVER_STAGE_BUSY,
                                                     ESP_ERR_TIMEOUT), ESP_OK);

    auto failed = boot();
    EXPECT_TRUE(failed.driver_failure_latched);
    EXPECT_EQ(failed.effective_model, HARDWARE_MODEL_UNKNOWN);
    EXPECT_EQ(failed.failed_model, HARDWARE_MODEL_E1001);
    EXPECT_EQ(failed.failure_stage, HARDWARE_DRIVER_STAGE_BUSY);
    EXPECT_EQ(failed.failure_error, ESP_ERR_TIMEOUT);
    EXPECT_FALSE(hardware_profile_can_use_panel());

    hardware_profile_update_result_t result = {};
    EXPECT_EQ(hardware_profile_retry_driver(HARDWARE_MODEL_E1002, failed.revision, &result),
              ESP_ERR_INVALID_ARG);
    EXPECT_EQ(hardware_profile_retry_driver(HARDWARE_MODEL_E1001, failed.revision, &result),
              ESP_OK);
    EXPECT_TRUE(result.reboot_required);
    EXPECT_FALSE(hardware_profile_can_use_panel());
    EXPECT_EQ(boot().effective_model, HARDWARE_MODEL_E1001);

    ASSERT_EQ(hardware_profile_record_driver_failure(HARDWARE_MODEL_E1001,
                                                     HARDWARE_DRIVER_STAGE_REFRESH,
                                                     ESP_FAIL), ESP_OK);
    failed = boot();
    EXPECT_EQ(hardware_profile_clear(failed.revision, &result), ESP_OK);
    EXPECT_TRUE(result.reboot_required);
    EXPECT_EQ(boot().effective_model, HARDWARE_MODEL_UNKNOWN);
}

TEST_F(HardwareProfileTest, MainLoadsNvsAndProfileBeforeAnyDisplayFacingInitialization)
{
    std::ifstream source(WIND_MAIN_SOURCE);
    ASSERT_TRUE(source.good());
    std::stringstream buffer;
    buffer << source.rdbuf();
    const std::string text = buffer.str();

    const auto nvs = text.find("nvs_flash_init()");
    const auto profile = text.find("hardware_profile_boot(");
    const auto board = text.find("board_hal_init()");
    const auto display = text.find("display_manager_init()");
    const auto app = text.find("wind_app_start()");
    ASSERT_NE(nvs, std::string::npos);
    ASSERT_NE(profile, std::string::npos);
    ASSERT_NE(board, std::string::npos);
    ASSERT_NE(display, std::string::npos);
    ASSERT_NE(app, std::string::npos);
    EXPECT_LT(nvs, profile);
    EXPECT_LT(profile, board);
    EXPECT_LT(profile, display);
    EXPECT_LT(profile, app);
    EXPECT_NE(text.find("if (!hardware_profile_allows_panel())"), std::string::npos);
}
