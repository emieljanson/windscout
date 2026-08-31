#include <gtest/gtest.h>

#include <type_traits>

extern "C" {
#include "epaper.h"
}

static_assert(std::is_same_v<decltype(epaper_display(nullptr)), esp_err_t>);

TEST(EpaperContractTest, DisplayReportsSuccessOrFailure)
{
    SUCCEED();
}
