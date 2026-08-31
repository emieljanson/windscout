#include <gtest/gtest.h>

#include <array>
#include <cstring>
#include <string>
#include <vector>

extern "C" {
#include "wind_usb_protocol.h"
}

namespace {
struct Frames {
    std::vector<uint32_t> ids;
    std::vector<std::string> payloads;
};

void collect(const wind_usb_frame_t *frame, void *context)
{
    auto *frames = static_cast<Frames *>(context);
    frames->ids.push_back(frame->request_id);
    frames->payloads.emplace_back(reinterpret_cast<const char *>(frame->payload), frame->payload_length);
}
}

TEST(WindUsbProtocolTest, ReassemblesAFrameAcrossArbitraryChunks)
{
    std::array<uint8_t, WIND_USB_MAX_FRAME_SIZE> encoded{};
    const char payload[] = R"({"command":"hello"})";
    size_t size = wind_usb_encode_frame(42, WIND_USB_MESSAGE_REQUEST,
                                        reinterpret_cast<const uint8_t *>(payload),
                                        strlen(payload), encoded.data(), encoded.size());
    ASSERT_GT(size, 0u);

    wind_usb_parser_t parser;
    wind_usb_parser_init(&parser);
    Frames frames;
    for (size_t offset = 0; offset < size; offset += 3) {
        const size_t chunk = std::min<size_t>(3, size - offset);
        EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data() + offset, chunk, collect, &frames),
                  ESP_OK);
    }
    ASSERT_EQ(frames.ids.size(), 1u);
    EXPECT_EQ(frames.ids[0], 42u);
    EXPECT_EQ(frames.payloads[0], payload);
}

TEST(WindUsbProtocolTest, DropsCorruptOversizedAndDuplicateFrames)
{
    wind_usb_parser_t parser;
    wind_usb_parser_init(&parser);
    Frames frames;

    std::array<uint8_t, WIND_USB_MAX_FRAME_SIZE> encoded{};
    const char payload[] = R"({"command":"get_state"})";
    size_t size = wind_usb_encode_frame(7, WIND_USB_MESSAGE_REQUEST,
                                        reinterpret_cast<const uint8_t *>(payload), strlen(payload),
                                        encoded.data(), encoded.size());
    ASSERT_GT(size, 0u);
    encoded[size - 1] ^= 0xff;
    EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data(), size, collect, &frames),
              ESP_ERR_INVALID_CRC);
    EXPECT_TRUE(frames.ids.empty());

    wind_usb_parser_init(&parser);
    size = wind_usb_encode_frame(7, WIND_USB_MESSAGE_REQUEST,
                                 reinterpret_cast<const uint8_t *>(payload), strlen(payload),
                                 encoded.data(), encoded.size());
    ASSERT_GT(size, 0u);
    EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data(), size, collect, &frames), ESP_OK);
    EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data(), size, collect, &frames), ESP_OK);
    EXPECT_EQ(frames.ids.size(), 1u);

    std::array<uint8_t, WIND_USB_HEADER_SIZE> oversized{};
    memcpy(oversized.data(), WIND_USB_MAGIC, WIND_USB_MAGIC_SIZE);
    wind_usb_write_u16(oversized.data() + 8, WIND_USB_PROTOCOL_VERSION);
    wind_usb_write_u32(oversized.data() + 16, WIND_USB_MAX_PAYLOAD + 1);
    wind_usb_parser_init(&parser);
    EXPECT_EQ(wind_usb_parser_feed(&parser, oversized.data(), oversized.size(), collect, &frames),
              ESP_ERR_INVALID_SIZE);
}

TEST(WindUsbProtocolTest, RecoversAfterNoiseAndNeverEchoesInput)
{
    wind_usb_parser_t parser;
    wind_usb_parser_init(&parser);
    Frames frames;
    const std::array<uint8_t, 17> noise = {0xff, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15};
    EXPECT_EQ(wind_usb_parser_feed(&parser, noise.data(), noise.size(), collect, &frames), ESP_OK);

    std::array<uint8_t, WIND_USB_MAX_FRAME_SIZE> encoded{};
    const char payload[] = R"({"command":"hello"})";
    size_t size = wind_usb_encode_frame(9, WIND_USB_MESSAGE_REQUEST,
                                        reinterpret_cast<const uint8_t *>(payload), strlen(payload),
                                        encoded.data(), encoded.size());
    EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data(), size, collect, &frames), ESP_OK);
    ASSERT_EQ(frames.payloads.size(), 1u);
    EXPECT_EQ(frames.payloads.front(), payload);
}

TEST(WindUsbProtocolTest, HelloStartsANewBrowserSessionAtRequestOne)
{
    wind_usb_parser_t parser;
    wind_usb_parser_init(&parser);
    Frames frames;
    std::array<uint8_t, WIND_USB_MAX_FRAME_SIZE> encoded{};
    const char state[] = R"({"command":"get_state"})";
    size_t size = wind_usb_encode_frame(9, WIND_USB_MESSAGE_REQUEST,
                                        reinterpret_cast<const uint8_t *>(state), strlen(state),
                                        encoded.data(), encoded.size());
    ASSERT_GT(size, 0u);
    EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data(), size, collect, &frames), ESP_OK);

    const char hello[] = R"({ "client": "browser", "command" : "hello" })";
    size = wind_usb_encode_frame(1, WIND_USB_MESSAGE_REQUEST,
                                 reinterpret_cast<const uint8_t *>(hello), strlen(hello),
                                 encoded.data(), encoded.size());
    ASSERT_GT(size, 0u);
    EXPECT_EQ(wind_usb_parser_feed(&parser, encoded.data(), size, collect, &frames), ESP_OK);
    ASSERT_EQ(frames.ids.size(), 2u);
    EXPECT_EQ(frames.ids.back(), 1u);
}
