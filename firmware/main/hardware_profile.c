#include "hardware_profile.h"

#include <stddef.h>
#include <string.h>

#define HARDWARE_PROFILE_MAGIC UINT32_C(0x57485052)

typedef struct {
    uint32_t magic;
    uint16_t format_version;
    uint8_t committed;
    uint8_t model;
    uint8_t source;
    uint8_t failure_latched;
    uint8_t failure_stage;
    uint8_t reserved;
    uint32_t revision;
    int32_t failure_error;
    uint32_t checksum;
} hardware_profile_record_t;

static hardware_profile_state_t s_boot_state;
static bool s_boot_state_loaded;

static uint32_t checksum_u8(uint32_t checksum, uint8_t value)
{
    checksum ^= value;
    return checksum * UINT32_C(16777619);
}

static uint32_t checksum_u32(uint32_t checksum, uint32_t value)
{
    for (unsigned int shift = 0; shift < 32; shift += 8) {
        checksum = checksum_u8(checksum, (uint8_t) (value >> shift));
    }
    return checksum;
}

static uint32_t record_checksum(const hardware_profile_record_t *record)
{
    uint32_t checksum = UINT32_C(2166136261);
    checksum = checksum_u32(checksum, record->magic);
    checksum = checksum_u32(checksum, record->format_version);
    checksum = checksum_u8(checksum, record->committed);
    checksum = checksum_u8(checksum, record->model);
    checksum = checksum_u8(checksum, record->source);
    checksum = checksum_u8(checksum, record->failure_latched);
    checksum = checksum_u8(checksum, record->failure_stage);
    checksum = checksum_u32(checksum, record->revision);
    return checksum_u32(checksum, (uint32_t) record->failure_error);
}

static bool model_valid(hardware_model_t model)
{
    return model == HARDWARE_MODEL_UNKNOWN || model == HARDWARE_MODEL_E1001 ||
           model == HARDWARE_MODEL_E1002 || model == HARDWARE_MODEL_E1003;
}

static bool source_valid_for_model(hardware_profile_source_t source, hardware_model_t model)
{
    if (model == HARDWARE_MODEL_UNKNOWN) return source == HARDWARE_PROFILE_SOURCE_NONE;
    if (source == HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION) return true;
    return source == HARDWARE_PROFILE_SOURCE_LIVE_LEGACY_E1002_HELLO &&
           model == HARDWARE_MODEL_E1002;
}

static bool stage_valid(hardware_driver_stage_t stage)
{
    return stage >= HARDWARE_DRIVER_STAGE_INITIALIZE &&
           stage <= HARDWARE_DRIVER_STAGE_SLEEP;
}

static bool record_valid(const hardware_profile_record_t *record)
{
    if (!record || record->magic != HARDWARE_PROFILE_MAGIC ||
        record->format_version != HARDWARE_PROFILE_FORMAT_VERSION || record->committed != 1 ||
        record->revision == 0 || !model_valid((hardware_model_t) record->model) ||
        !source_valid_for_model((hardware_profile_source_t) record->source,
                                (hardware_model_t) record->model) ||
        record->checksum != record_checksum(record)) {
        return false;
    }
    if (!record->failure_latched) {
        return record->failure_stage == HARDWARE_DRIVER_STAGE_NONE &&
               record->failure_error == ESP_OK;
    }
    return record->model != HARDWARE_MODEL_UNKNOWN &&
           stage_valid((hardware_driver_stage_t) record->failure_stage) &&
           record->failure_error != ESP_OK;
}

static hardware_profile_record_t unknown_record(uint32_t revision)
{
    hardware_profile_record_t record;
    memset(&record, 0, sizeof(record));
    record.magic = HARDWARE_PROFILE_MAGIC;
    record.format_version = HARDWARE_PROFILE_FORMAT_VERSION;
    record.committed = 1;
    record.model = HARDWARE_MODEL_UNKNOWN;
    record.source = HARDWARE_PROFILE_SOURCE_NONE;
    record.revision = revision;
    record.checksum = record_checksum(&record);
    return record;
}

static hardware_profile_state_t state_from_record(const hardware_profile_record_t *record,
                                                  bool side_buttons_held)
{
    hardware_profile_state_t state;
    memset(&state, 0, sizeof(state));
    if (!record_valid(record)) {
        state.stored_model = HARDWARE_MODEL_UNKNOWN;
        state.effective_model = HARDWARE_MODEL_UNKNOWN;
        state.source = HARDWARE_PROFILE_SOURCE_NONE;
        state.safe_boot_override = side_buttons_held;
        return state;
    }
    state.stored_model = (hardware_model_t) record->model;
    state.effective_model = side_buttons_held || record->failure_latched
                                ? HARDWARE_MODEL_UNKNOWN
                                : (hardware_model_t) record->model;
    state.source = (hardware_profile_source_t) record->source;
    state.revision = record->revision;
    state.safe_boot_override = side_buttons_held;
    state.driver_failure_latched = record->failure_latched != 0;
    state.failed_model = record->failure_latched ? (hardware_model_t) record->model
                                                  : HARDWARE_MODEL_UNKNOWN;
    state.failure_stage = (hardware_driver_stage_t) record->failure_stage;
    state.failure_error = (esp_err_t) record->failure_error;
    return state;
}

#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "nvs.h"

#define HARDWARE_PROFILE_NAMESPACE "wind_hw"
#define HARDWARE_PROFILE_ACTIVE_KEY "active"
#define HARDWARE_PROFILE_CANDIDATE_KEY "candidate"

static SemaphoreHandle_t s_profile_mutex;

static bool lock_profile(void)
{
    if (!s_profile_mutex) s_profile_mutex = xSemaphoreCreateMutex();
    return s_profile_mutex && xSemaphoreTake(s_profile_mutex, portMAX_DELAY) == pdTRUE;
}

static void unlock_profile(void)
{
    xSemaphoreGive(s_profile_mutex);
}

static esp_err_t load_record(hardware_profile_record_t *record)
{
    nvs_handle_t handle;
    esp_err_t result = nvs_open(HARDWARE_PROFILE_NAMESPACE, NVS_READONLY, &handle);
    if (result != ESP_OK) return result;
    size_t size = sizeof(*record);
    result = nvs_get_blob(handle, HARDWARE_PROFILE_ACTIVE_KEY, record, &size);
    nvs_close(handle);
    return result == ESP_OK && size == sizeof(*record) && record_valid(record)
               ? ESP_OK : ESP_ERR_INVALID_STATE;
}

static esp_err_t store_record(hardware_profile_record_t *record)
{
    nvs_handle_t handle;
    esp_err_t result = nvs_open(HARDWARE_PROFILE_NAMESPACE, NVS_READWRITE, &handle);
    if (result != ESP_OK) return result;

    record->committed = 0;
    record->checksum = record_checksum(record);
    result = nvs_set_blob(handle, HARDWARE_PROFILE_CANDIDATE_KEY, record, sizeof(*record));
    if (result == ESP_OK) result = nvs_commit(handle);

    record->committed = 1;
    record->checksum = record_checksum(record);
    if (result == ESP_OK) {
        result = nvs_set_blob(handle, HARDWARE_PROFILE_CANDIDATE_KEY, record, sizeof(*record));
    }
    if (result == ESP_OK) result = nvs_commit(handle);
    if (result == ESP_OK) {
        result = nvs_set_blob(handle, HARDWARE_PROFILE_ACTIVE_KEY, record, sizeof(*record));
    }
    if (result == ESP_OK) result = nvs_commit(handle);
    if (result == ESP_OK) {
        hardware_profile_record_t readback;
        size_t size = sizeof(readback);
        result = nvs_get_blob(handle, HARDWARE_PROFILE_ACTIVE_KEY, &readback, &size);
        if (result == ESP_OK &&
            (size != sizeof(readback) || !record_valid(&readback) ||
             memcmp(&readback, record, sizeof(readback)) != 0)) {
            result = ESP_ERR_INVALID_STATE;
        }
    }
    if (result == ESP_OK) {
        (void) nvs_erase_key(handle, HARDWARE_PROFILE_CANDIDATE_KEY);
        (void) nvs_commit(handle);
    }
    nvs_close(handle);
    return result;
}
#else
static hardware_profile_record_t s_host_active;
static int s_host_failure_boundary = -1;

static bool lock_profile(void)
{
    return true;
}

static void unlock_profile(void) {}

static esp_err_t load_record(hardware_profile_record_t *record)
{
    if (!record || !record_valid(&s_host_active)) return ESP_ERR_INVALID_STATE;
    *record = s_host_active;
    return ESP_OK;
}

static esp_err_t store_record(hardware_profile_record_t *record)
{
    record->committed = 0;
    record->checksum = record_checksum(record);
    if (s_host_failure_boundary == 0) return ESP_FAIL;
    record->committed = 1;
    record->checksum = record_checksum(record);
    if (s_host_failure_boundary == 1) return ESP_FAIL;
    if (s_host_failure_boundary == 2) return ESP_FAIL;
    s_host_active = *record;
    return record_valid(&s_host_active) ? ESP_OK : ESP_ERR_INVALID_STATE;
}
#endif

static esp_err_t read_current_or_unknown(hardware_profile_record_t *record)
{
    esp_err_t result = load_record(record);
    if (result != ESP_OK) *record = unknown_record(0);
    return ESP_OK;
}

esp_err_t hardware_profile_boot(bool side_buttons_held, hardware_profile_state_t *out_state)
{
    if (!out_state) return ESP_ERR_INVALID_ARG;
    if (!lock_profile()) return ESP_ERR_NO_MEM;
    hardware_profile_record_t record;
    (void) read_current_or_unknown(&record);
    s_boot_state = state_from_record(&record, side_buttons_held);
    s_boot_state_loaded = true;
    *out_state = s_boot_state;
    unlock_profile();
    return ESP_OK;
}

esp_err_t hardware_profile_get_state(hardware_profile_state_t *out_state)
{
    if (!out_state) return ESP_ERR_INVALID_ARG;
    if (!s_boot_state_loaded) return ESP_ERR_INVALID_STATE;
    *out_state = s_boot_state;
    return ESP_OK;
}

bool hardware_profile_can_use_panel(void)
{
    return s_boot_state_loaded && s_boot_state.effective_model != HARDWARE_MODEL_UNKNOWN &&
           !s_boot_state.driver_failure_latched;
}

bool hardware_profile_can_use_panel_for_fixed_model(hardware_model_t fixed_model)
{
    if (!s_boot_state_loaded || s_boot_state.safe_boot_override ||
        s_boot_state.driver_failure_latched) {
        return false;
    }
    if (s_boot_state.effective_model != HARDWARE_MODEL_UNKNOWN) {
        return s_boot_state.effective_model == fixed_model;
    }
    return fixed_model == HARDWARE_MODEL_E1001 || fixed_model == HARDWARE_MODEL_E1002 ||
           fixed_model == HARDWARE_MODEL_E1003;
}

static esp_err_t persist_transition(hardware_profile_record_t *record,
                                    hardware_profile_update_result_t *out_result)
{
    record->magic = HARDWARE_PROFILE_MAGIC;
    record->format_version = HARDWARE_PROFILE_FORMAT_VERSION;
    record->committed = 1;
    record->checksum = record_checksum(record);
    esp_err_t result = store_record(record);
    if (result == ESP_OK) {
        hardware_profile_record_t readback;
        result = load_record(&readback);
        if (result == ESP_OK && memcmp(&readback, record, sizeof(readback)) != 0) {
            result = ESP_ERR_INVALID_STATE;
        }
    }
    if (result == ESP_OK && out_result) {
        out_result->committed_revision = record->revision;
        out_result->reboot_required = true;
        out_result->idempotent = false;
    }
    return result;
}

esp_err_t hardware_profile_select(hardware_model_t model, hardware_profile_source_t source,
                                  uint32_t expected_revision,
                                  hardware_profile_update_result_t *out_result)
{
    if (!out_result || model == HARDWARE_MODEL_UNKNOWN ||
        !source_valid_for_model(source, model)) return ESP_ERR_INVALID_ARG;
    memset(out_result, 0, sizeof(*out_result));
    if (!lock_profile()) return ESP_ERR_NO_MEM;
    hardware_profile_record_t current;
    (void) read_current_or_unknown(&current);
    if (current.revision != expected_revision) {
        unlock_profile();
        return ESP_ERR_INVALID_STATE;
    }
    if (current.model == model && !current.failure_latched) {
        out_result->committed_revision = current.revision;
        out_result->idempotent = true;
        unlock_profile();
        return ESP_OK;
    }
    if (current.model != HARDWARE_MODEL_UNKNOWN) {
        unlock_profile();
        return ESP_ERR_INVALID_STATE;
    }
    hardware_profile_record_t next = unknown_record(current.revision + 1);
    next.model = (uint8_t) model;
    next.source = (uint8_t) source;
    next.checksum = record_checksum(&next);
    esp_err_t result = persist_transition(&next, out_result);
    unlock_profile();
    return result;
}

esp_err_t hardware_profile_clear(uint32_t expected_revision,
                                 hardware_profile_update_result_t *out_result)
{
    if (!out_result) return ESP_ERR_INVALID_ARG;
    memset(out_result, 0, sizeof(*out_result));
    if (!lock_profile()) return ESP_ERR_NO_MEM;
    hardware_profile_record_t current;
    (void) read_current_or_unknown(&current);
    if (current.revision != expected_revision) {
        unlock_profile();
        return ESP_ERR_INVALID_STATE;
    }
    if (current.model == HARDWARE_MODEL_UNKNOWN && !current.failure_latched) {
        out_result->committed_revision = current.revision;
        out_result->idempotent = true;
        unlock_profile();
        return ESP_OK;
    }
    hardware_profile_record_t next = unknown_record(current.revision + 1);
    esp_err_t result = persist_transition(&next, out_result);
    unlock_profile();
    return result;
}

esp_err_t hardware_profile_record_driver_failure(hardware_model_t model,
                                                 hardware_driver_stage_t stage,
                                                 esp_err_t error)
{
    if (model == HARDWARE_MODEL_UNKNOWN || !stage_valid(stage) || error == ESP_OK) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!lock_profile()) return ESP_ERR_NO_MEM;
    hardware_profile_record_t current;
    if (load_record(&current) != ESP_OK || current.model != model) {
        unlock_profile();
        return ESP_ERR_INVALID_STATE;
    }
    if (current.failure_latched && current.failure_stage == (uint8_t) stage &&
        current.failure_error == error) {
        unlock_profile();
        return ESP_OK;
    }
    current.revision++;
    current.failure_latched = 1;
    current.failure_stage = (uint8_t) stage;
    current.failure_error = error;
    current.checksum = record_checksum(&current);
    esp_err_t result = persist_transition(&current, NULL);
    if (result == ESP_OK) {
        s_boot_state = state_from_record(&current, false);
        s_boot_state_loaded = true;
    }
    unlock_profile();
    return result;
}

esp_err_t hardware_profile_retry_driver(hardware_model_t model, uint32_t expected_revision,
                                        hardware_profile_update_result_t *out_result)
{
    if (!out_result || model == HARDWARE_MODEL_UNKNOWN) return ESP_ERR_INVALID_ARG;
    memset(out_result, 0, sizeof(*out_result));
    if (!lock_profile()) return ESP_ERR_NO_MEM;
    hardware_profile_record_t current;
    if (load_record(&current) != ESP_OK || current.revision != expected_revision ||
        !current.failure_latched) {
        unlock_profile();
        return ESP_ERR_INVALID_STATE;
    }
    if (current.model != model) {
        unlock_profile();
        return ESP_ERR_INVALID_ARG;
    }
    current.revision++;
    current.failure_latched = 0;
    current.failure_stage = HARDWARE_DRIVER_STAGE_NONE;
    current.failure_error = ESP_OK;
    current.checksum = record_checksum(&current);
    esp_err_t result = persist_transition(&current, out_result);
    unlock_profile();
    return result;
}

const char *hardware_model_name(hardware_model_t model)
{
    switch (model) {
    case HARDWARE_MODEL_E1001: return "e1001";
    case HARDWARE_MODEL_E1002: return "e1002";
    case HARDWARE_MODEL_E1003: return "e1003";
    default: return "unknown";
    }
}

const char *hardware_profile_source_name(hardware_profile_source_t source)
{
    switch (source) {
    case HARDWARE_PROFILE_SOURCE_OWNER_CONFIRMATION: return "owner-confirmation";
    case HARDWARE_PROFILE_SOURCE_LIVE_LEGACY_E1002_HELLO: return "live-legacy-e1002-hello";
    default: return "none";
    }
}

const char *hardware_driver_stage_name(hardware_driver_stage_t stage)
{
    switch (stage) {
    case HARDWARE_DRIVER_STAGE_INITIALIZE: return "initialize";
    case HARDWARE_DRIVER_STAGE_TRANSPORT: return "transport";
    case HARDWARE_DRIVER_STAGE_REFRESH: return "refresh";
    case HARDWARE_DRIVER_STAGE_BUSY: return "busy";
    case HARDWARE_DRIVER_STAGE_SLEEP: return "sleep";
    default: return "none";
    }
}

#ifndef ESP_PLATFORM
void hardware_profile_reset_host_storage(void)
{
    memset(&s_host_active, 0, sizeof(s_host_active));
    memset(&s_boot_state, 0, sizeof(s_boot_state));
    s_boot_state_loaded = false;
    s_host_failure_boundary = -1;
}

void hardware_profile_set_host_failure_boundary(int boundary)
{
    s_host_failure_boundary = boundary;
}

void hardware_profile_seed_invalid_host_record(hardware_profile_host_record_kind_t kind)
{
    s_host_active = unknown_record(1);
    switch (kind) {
    case HARDWARE_PROFILE_HOST_RECORD_CORRUPT: s_host_active.checksum ^= UINT32_C(1); break;
    case HARDWARE_PROFILE_HOST_RECORD_UNCOMMITTED:
        s_host_active.committed = 0;
        s_host_active.checksum = record_checksum(&s_host_active);
        break;
    case HARDWARE_PROFILE_HOST_RECORD_UNSUPPORTED_VERSION:
        s_host_active.format_version++;
        s_host_active.checksum = record_checksum(&s_host_active);
        break;
    }
}
#endif
