#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

#define HARDWARE_PROFILE_FORMAT_VERSION 1u
#define HARDWARE_PROFILE_WRITE_BOUNDARY_COUNT 3

typedef enum {
    HARDWARE_MODEL_UNKNOWN = 0,
    HARDWARE_MODEL_E1001 = 1,
    HARDWARE_MODEL_E1002 = 2,
    HARDWARE_MODEL_E1003 = 3,
} hardware_model_t;

typedef enum {
    HARDWARE_PROFILE_SOURCE_NONE = 0,
    HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION = 1,
    HARDWARE_PROFILE_SOURCE_LIVE_LEGACY_E1002_HELLO = 2,
} hardware_profile_source_t;

typedef enum {
    HARDWARE_DRIVER_STAGE_NONE = 0,
    HARDWARE_DRIVER_STAGE_INITIALIZE = 1,
    HARDWARE_DRIVER_STAGE_TRANSPORT = 2,
    HARDWARE_DRIVER_STAGE_REFRESH = 3,
    HARDWARE_DRIVER_STAGE_BUSY = 4,
    HARDWARE_DRIVER_STAGE_SLEEP = 5,
} hardware_driver_stage_t;

typedef struct {
    hardware_model_t stored_model;
    hardware_model_t effective_model;
    hardware_profile_source_t source;
    uint32_t revision;
    bool safe_boot_override;
    bool driver_failure_latched;
    hardware_model_t failed_model;
    hardware_driver_stage_t failure_stage;
    esp_err_t failure_error;
} hardware_profile_state_t;

typedef struct {
    uint32_t committed_revision;
    bool reboot_required;
    bool idempotent;
} hardware_profile_update_result_t;

esp_err_t hardware_profile_boot(bool side_buttons_held, hardware_profile_state_t *out_state);
esp_err_t hardware_profile_get_state(hardware_profile_state_t *out_state);
bool hardware_profile_can_use_panel(void);
bool hardware_profile_can_use_panel_for_fixed_model(hardware_model_t fixed_model);

esp_err_t hardware_profile_select(hardware_model_t model, hardware_profile_source_t source,
                                  uint32_t expected_revision,
                                  hardware_profile_update_result_t *out_result);
esp_err_t hardware_profile_clear(uint32_t expected_revision,
                                 hardware_profile_update_result_t *out_result);
esp_err_t hardware_profile_record_driver_failure(hardware_model_t model,
                                                 hardware_driver_stage_t stage,
                                                 esp_err_t error);
esp_err_t hardware_profile_retry_driver(hardware_model_t model, uint32_t expected_revision,
                                        hardware_profile_update_result_t *out_result);

const char *hardware_model_name(hardware_model_t model);
const char *hardware_profile_source_name(hardware_profile_source_t source);
const char *hardware_driver_stage_name(hardware_driver_stage_t stage);

#ifndef ESP_PLATFORM
typedef enum {
    HARDWARE_PROFILE_HOST_RECORD_CORRUPT,
    HARDWARE_PROFILE_HOST_RECORD_UNCOMMITTED,
    HARDWARE_PROFILE_HOST_RECORD_UNSUPPORTED_VERSION,
} hardware_profile_host_record_kind_t;

void hardware_profile_reset_host_storage(void);
void hardware_profile_set_host_failure_boundary(int boundary);
void hardware_profile_seed_invalid_host_record(hardware_profile_host_record_kind_t kind);
#endif

#ifdef __cplusplus
}
#endif
