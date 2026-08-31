#include <gtest/gtest.h>

#include <type_traits>

extern "C" {
#include "epaper.h"
}

static_assert(std::is_same_v<decltype(epaper_display(nullptr)), esp_err_t>);
static_assert(std::is_same_v<decltype(epaper_init(nullptr)), esp_err_t>);
static_assert(std::is_same_v<decltype(epaper_clear(nullptr, 0)), esp_err_t>);
static_assert(std::is_same_v<decltype(epaper_enter_deepsleep()), esp_err_t>);

TEST(EpaperContractTest, DisplayReportsSuccessOrFailure)
{
    SUCCEED();
}
