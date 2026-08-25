#include <algorithm>
#include <cstring>
#include <string>
#include <vector>

#include <gtest/gtest.h>

extern "C" {
#include "wind_font.h"
}

TEST(WindFont, MeasuresGeneratedMetricsAtEveryDashboardSize) {
    const struct {
        wind_font_family_t family;
        int size;
        const char *text;
        int width;
        int ascent;
        int descent;
    } cases[] = {
        {WIND_FONT_BERKELEY_MONO, 12, "52.5126°N 5.0486°E", 126, 12, 3},
        {WIND_FONT_BERKELEY_MONO, 14, "KNMI 11:05", 80, 14, 4},
        {WIND_FONT_BERKELEY_MONO, 32, "44 kt", 95, 31, 8},
        {WIND_FONT_INTER, 16, "MON 08:00", 89, 16, 4},
        {WIND_FONT_INTER, 28, "Edam", 74, 28, 7},
        {WIND_FONT_INTER, 58, "Edam", 163, 57, 14},
    };
    for (const auto &item : cases) {
        const auto measured = wind_font_measure(item.family, item.size, item.text);
        EXPECT_EQ(measured.width, item.width);
        EXPECT_EQ(measured.ascent, item.ascent);
        EXPECT_EQ(measured.descent, item.descent);
    }
}

TEST(WindFont, DropsCoordinatesBeforeEllipsizingName) {
    const char *name = "Edam";
    const char *coordinates = "52.5126°N, 5.0486°E";
    char fitted[128];
    int coordinates_included = 0;
    const int full_width = wind_font_measure(WIND_FONT_INTER, 28,
                                             "Edam 52.5126°N, 5.0486°E").width;
    size_t bytes = wind_font_fit_ellipsis(WIND_FONT_INTER, 28, name, coordinates,
                                          full_width, fitted, sizeof(fitted),
                                          &coordinates_included);
    EXPECT_GT(bytes, 0u);
    EXPECT_STREQ(fitted, "Edam 52.5126°N, 5.0486°E");
    EXPECT_EQ(coordinates_included, 1);

    const int name_width = wind_font_measure(WIND_FONT_INTER, 28, name).width;
    wind_font_fit_ellipsis(WIND_FONT_INTER, 28, name, coordinates, name_width,
                           fitted, sizeof(fitted), &coordinates_included);
    EXPECT_STREQ(fitted, "Edam");
    EXPECT_EQ(coordinates_included, 0);

    wind_font_fit_ellipsis(WIND_FONT_INTER, 28, "Noord-Holland Windmeetpost",
                           coordinates, name_width, fitted, sizeof(fitted),
                           &coordinates_included);
    EXPECT_EQ(coordinates_included, 0);
    EXPECT_NE(std::strstr(fitted, "…"), nullptr);
    EXPECT_LE(wind_font_measure(WIND_FONT_INTER, 28, fitted).width, name_width);
}

TEST(WindFont, DrawsAccentsAndFallbackInsideClippedBuffer) {
    constexpr int width = 64;
    constexpr int height = 24;
    constexpr int stride = 68;
    constexpr size_t guard = 32;
    std::vector<uint8_t> storage(guard + stride * height + guard, 0xa5);
    uint8_t *luma = storage.data() + guard;
    std::fill(luma, luma + stride * height, 255);

    wind_font_draw(luma, width, height, stride, -5, 17,
                   WIND_FONT_BERKELEY_MONO, 14, 0, "Edam ëé ☃");

    EXPECT_TRUE(std::all_of(storage.begin(), storage.begin() + guard,
                            [](uint8_t value) { return value == 0xa5; }));
    EXPECT_TRUE(std::all_of(storage.end() - guard, storage.end(),
                            [](uint8_t value) { return value == 0xa5; }));
    EXPECT_TRUE(std::any_of(luma, luma + stride * height,
                            [](uint8_t value) { return value < 255; }));
    EXPECT_EQ(wind_font_measure(WIND_FONT_BERKELEY_MONO, 14, "☃").width,
              wind_font_measure(WIND_FONT_BERKELEY_MONO, 14, "?").width);
}

TEST(WindFont, UsesBaselineMetricsForCrossFamilyPlacement) {
    const auto spot = wind_font_measure(WIND_FONT_INTER, 28, "Edam");
    const auto coordinates = wind_font_measure(WIND_FONT_BERKELEY_MONO, 12,
                                               "52.5126°N");
    const auto status = wind_font_measure(WIND_FONT_BERKELEY_MONO, 14,
                                          "KNMI 11:05");
    const int baseline = 40;
    EXPECT_EQ(baseline - spot.ascent, 12);
    EXPECT_EQ(baseline - coordinates.ascent, 28);
    EXPECT_EQ(baseline - status.ascent, 26);
    EXPECT_EQ(baseline + spot.descent, 47);
}

TEST(WindFont, UnsupportedSizeIsAStableNoOp) {
    uint8_t pixel = 123;
    const auto measured = wind_font_measure(WIND_FONT_INTER, 17, "Edam");
    EXPECT_EQ(measured.width, 0);
    EXPECT_EQ(measured.ascent, 0);
    EXPECT_EQ(measured.descent, 0);
    wind_font_draw(&pixel, 1, 1, 1, 0, 0, WIND_FONT_INTER, 17, 0, "x");
    EXPECT_EQ(pixel, 123);
}
