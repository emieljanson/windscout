#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <vector>

#include <gtest/gtest.h>

extern "C" {
#include "epaper_frame.h"
}

namespace {

using Frame = std::vector<uint8_t>;

std::filesystem::path SharedFixture(const char *name)
{
    return std::filesystem::path(WIND_RENDERER_SHARED_FIXTURE_DIR) /
           (std::string(name) + ".bin");
}

std::filesystem::path TransportFixture(const char *name)
{
    return std::filesystem::path(__FILE__).parent_path() / "fixtures" /
           (std::string("e1002-spectra6-") + name + ".bin");
}

Frame Read(const std::filesystem::path &path)
{
    std::ifstream input(path, std::ios::binary);
    EXPECT_TRUE(input.good()) << path;
    return Frame(std::istreambuf_iterator<char>(input), {});
}

void ExpectOrUpdate(const std::filesystem::path &path, const Frame &actual)
{
    if (std::getenv("WIND_UPDATE_EPAPER_GOLDENS")) {
        std::ofstream output(path, std::ios::binary | std::ios::trunc);
        ASSERT_TRUE(output.good()) << path;
        output.write(reinterpret_cast<const char *>(actual.data()),
                     static_cast<std::streamsize>(actual.size()));
        ASSERT_TRUE(output.good()) << path;
    }
    EXPECT_EQ(Read(path), actual);
}

}  // namespace

TEST(EpaperEncodingCharacterization, E1002ThresholdFrameIsByteExact)
{
    const Frame logical = Read(SharedFixture("threshold-17"));
    ASSERT_EQ(logical.size(), static_cast<size_t>(EPAPER_LOGICAL_FRAME_BYTES));
    Frame transport(EPAPER_E1002_TRANSPORT_BYTES, 0x7f);
    ASSERT_EQ(epaper_encode_e1002_spectra6(
                  logical.data(), logical.size(), transport.data(), transport.size()),
              ESP_OK);
    ExpectOrUpdate(TransportFixture("threshold-17"), transport);
}

TEST(EpaperGray4Encoding, PacksFourCodesIntoTwoExactBitplanes)
{
    Frame logical(EPAPER_LOGICAL_FRAME_BYTES, 3);
    for (size_t x = 0; x < 8; ++x) logical[x] = static_cast<uint8_t>(x % 4);
    Frame transport(EPAPER_E1001_TRANSPORT_BYTES, 0);

    ASSERT_EQ(epaper_encode_e1001_gray4(
                  logical.data(), logical.size(), transport.data(), transport.size()),
              ESP_OK);
    EXPECT_EQ(transport.size(), 96000u);
    EXPECT_EQ(transport[0], 0xAA);  // inverted low plane: 0,1,2,3 repeated
    EXPECT_EQ(transport[EPAPER_GRAY4_PLANE_BYTES], 0xCC);
}

TEST(EpaperGray4Encoding, RejectsInvalidCodesAndWrongBufferSizes)
{
    Frame logical(EPAPER_LOGICAL_FRAME_BYTES, 3);
    Frame transport(EPAPER_E1001_TRANSPORT_BYTES, 0);
    logical[123] = 4;
    EXPECT_EQ(epaper_encode_e1001_gray4(
                  logical.data(), logical.size(), transport.data(), transport.size()),
              ESP_ERR_INVALID_ARG);
    logical[123] = 3;
    EXPECT_EQ(epaper_encode_e1001_gray4(
                  logical.data(), logical.size() - 1, transport.data(), transport.size()),
              ESP_ERR_INVALID_SIZE);
    EXPECT_EQ(epaper_encode_e1001_gray4(
                  logical.data(), logical.size(), transport.data(), transport.size() - 1),
              ESP_ERR_INVALID_SIZE);
}
