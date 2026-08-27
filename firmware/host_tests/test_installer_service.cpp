#include <gtest/gtest.h>

#include <cstring>
#include <string>

extern "C" {
#include "wind_installer_service.h"
}

namespace {
struct FakeDevice {
    bool wifi_ok = true;
    bool render_ok = true;
    bool commit_ok = true;
    int commits = 0;
    int wake_acquires = 0;
    int wake_releases = 0;
    std::string password;
};

esp_err_t test_wifi(void *context, const char *, const char *password)
{
    auto *fake = static_cast<FakeDevice *>(context);
    fake->password = password;
    return fake->wifi_ok ? ESP_OK : ESP_FAIL;
}

esp_err_t render(void *context, const installed_configuration_t *)
{
    return static_cast<FakeDevice *>(context)->render_ok ? ESP_OK : ESP_FAIL;
}

esp_err_t commit(void *context, const installed_configuration_t *, const char *, const char *)
{
    auto *fake = static_cast<FakeDevice *>(context);
    if (!fake->commit_ok) return ESP_FAIL;
    fake->commits++;
    return ESP_OK;
}

void wake(void *context, bool held)
{
    auto *fake = static_cast<FakeDevice *>(context);
    held ? fake->wake_acquires++ : fake->wake_releases++;
}

wind_installer_service_t make_service(FakeDevice *fake)
{
    wind_installer_service_t service;
    wind_installer_dependencies_t dependencies = {
        .context = fake,
        .test_wifi = test_wifi,
        .render_candidate = render,
        .commit = commit,
        .set_wake_lock = wake,
    };
    wind_installer_service_init(&service, &dependencies);
    return service;
}

std::string request(wind_installer_service_t *service, const char *json)
{
    char response[2048] = {0};
    EXPECT_EQ(wind_installer_service_handle_json(service, json, strlen(json), response,
                                                  sizeof(response)), ESP_OK);
    return response;
}
}

TEST(InstallerServiceTest, HelloAndStateAreRedacted)
{
    FakeDevice fake;
    auto service = make_service(&fake);
    const std::string hello = request(&service, R"({"command":"hello"})");
    EXPECT_NE(hello.find(WINDSCOUT_BOARD_ID), std::string::npos);
    EXPECT_EQ(hello.find("password"), std::string::npos);
    const std::string state = request(&service, R"({"command":"get_state"})");
    EXPECT_EQ(state.find("password"), std::string::npos);
}

TEST(InstallerServiceTest, CommitsOnlyAfterWifiAndRenderSucceed)
{
    FakeDevice fake;
    auto service = make_service(&fake);
    request(&service, R"({"command":"begin"})");
    request(&service, R"({"command":"stage_configuration","configuration":{"version":2,"boardId":"seeedstudio_reterminal_e1002","spot":{"id":"edam","name":"Edam","latitude":52.5126,"longitude":5.0486,"timezone":"Europe/Amsterdam"},"forecastModel":"best_match","display":{"showThreshold":false,"threshold":17,"showWeather":true,"showTemperature":false,"showTide":false,"timeFormat":"24-hour","temperatureUnit":"celsius"},"digest":"bde996ae21f5ca31"}})");
    const std::string wifi = request(&service, R"({"command":"test_wifi","ssid":"Home","password":"secret-value"})");
    EXPECT_NE(wifi.find("wifi_ready"), std::string::npos);
    EXPECT_EQ(wifi.find("secret-value"), std::string::npos);
    const std::string applied = request(&service, R"({"command":"apply_configuration"})");
    EXPECT_NE(applied.find("complete"), std::string::npos);
    EXPECT_EQ(fake.commits, 1);
    EXPECT_TRUE(service.credentials_cleared);
    EXPECT_EQ(fake.wake_acquires, 1);
    EXPECT_EQ(fake.wake_releases, 1);
}

TEST(InstallerServiceTest, WrongWifiAndRenderFailureRemainRetryable)
{
    FakeDevice fake;
    auto service = make_service(&fake);
    request(&service, R"({"command":"begin"})");
    request(&service, R"({"command":"stage_configuration","configuration":{"version":2,"boardId":"seeedstudio_reterminal_e1002","spot":{"id":"edam","name":"Edam","latitude":52.5126,"longitude":5.0486,"timezone":"Europe/Amsterdam"},"forecastModel":"best_match","display":{"showThreshold":false,"threshold":17,"showWeather":true,"showTemperature":false,"showTide":false,"timeFormat":"24-hour","temperatureUnit":"celsius"},"digest":"bde996ae21f5ca31"}})");

    fake.wifi_ok = false;
    const std::string rejected = request(&service, R"({"command":"test_wifi","ssid":"Home","password":"wrong"})");
    EXPECT_NE(rejected.find("wifi_rejected"), std::string::npos);
    EXPECT_EQ(fake.commits, 0);

    fake.wifi_ok = true;
    fake.render_ok = false;
    request(&service, R"({"command":"test_wifi","ssid":"Home","password":"right"})");
    const std::string failed = request(&service, R"({"command":"apply_configuration"})");
    EXPECT_NE(failed.find("render_failed"), std::string::npos);
    EXPECT_EQ(fake.commits, 0);
    EXPECT_TRUE(service.wake_lock_held);

    request(&service, R"({"command":"cancel"})");
    EXPECT_FALSE(service.wake_lock_held);
    EXPECT_TRUE(service.credentials_cleared);
}

TEST(InstallerServiceTest, TimeoutAndMalformedRequestsReleaseOrPreserveStateSafely)
{
    FakeDevice fake;
    auto service = make_service(&fake);
    request(&service, R"({"command":"begin"})");
    EXPECT_TRUE(service.wake_lock_held);
    wind_installer_service_timeout(&service);
    EXPECT_FALSE(service.wake_lock_held);
    EXPECT_TRUE(service.credentials_cleared);

    char response[128];
    EXPECT_EQ(wind_installer_service_handle_json(&service, "{", 1, response, sizeof(response)),
              ESP_ERR_INVALID_ARG);
    EXPECT_EQ(fake.commits, 0);
}
