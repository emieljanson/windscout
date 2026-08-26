#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include <gtest/gtest.h>

extern "C" {
#include "wind_renderer.h"
#include "wind_renderer_fixture.h"
}

namespace {

using Frame = std::vector<uint8_t>;

wind_renderer_dashboard_t Dashboard(wind_renderer_state_t state = WIND_RENDERER_FRESH) {
    static const char *days[] = {"MON", "TUE", "WED", "THU", "FRI"};
    static const char *dates[] = {"24 AUG", "25 AUG", "26 AUG", "27 AUG", "28 AUG"};
    static const char *times[] = {"08:00", "11:00", "14:00", "17:00", "20:00"};
    wind_renderer_dashboard_t result{};
    result.spot_name = "Edam";
    result.coordinates = "52.5126N 5.0486E";
    result.provider = "KNMI";
    result.updated_time = "11:05";
    result.state = state;
    result.age_hours = state == WIND_RENDERER_STALE ? 25 : 1;
    result.battery_percent = 74;
    result.threshold_kt = WIND_RENDERER_DEFAULT_THRESHOLD_KT;
    result.show_weather = 1;
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        result.days[day].day = days[day];
        result.days[day].date = dates[day];
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            auto &slot = result.days[day].samples[sample];
            slot.time = times[sample];
            slot.sustained_kt = 7 + day * 2 + sample * 3;
            slot.gust_kt = slot.sustained_kt + 5;
            slot.destination_degrees = day * 55 + sample * 27;
            slot.available = 1;
            slot.weather = static_cast<wind_renderer_weather_t>(1 + (day * 5 + sample) % 8);
            slot.temperature_tenths_c = 120 + day * 5 + sample;
            slot.temperature_available = 1;
        }
    }
    return result;
}

Frame Render(const wind_renderer_dashboard_t &dashboard,
             wind_renderer_stats_t *stats = nullptr) {
    Frame frame(WIND_RENDERER_PALETTE_BYTES, 0x7f);
    EXPECT_EQ(wind_renderer_render(&dashboard, frame.data(), frame.size(), stats), 0);
    return frame;
}

Frame RenderPreview(const wind_renderer_dashboard_t &dashboard,
                    wind_renderer_stats_t *stats = nullptr) {
    Frame frame(WIND_RENDERER_RGBA_BYTES, 0x7f);
    EXPECT_EQ(wind_renderer_render_preview_rgba(
                  &dashboard, frame.data(), frame.size(), stats),
              0);
    return frame;
}

int CountBlack(const Frame &frame, int left, int top, int right, int bottom) {
    int count = 0;
    for (int y = top; y <= bottom; ++y)
        for (int x = left; x <= right; ++x)
            count += frame[y * WIND_RENDERER_WIDTH + x] == 0;
    return count;
}

int CountColor(const Frame &frame, int left, int top, int right, int bottom,
               uint8_t color) {
    int count = 0;
    for (int y = top; y <= bottom; ++y)
        for (int x = left; x <= right; ++x)
            count += frame[y * WIND_RENDERER_WIDTH + x] == color;
    return count;
}

std::string FixturePath(const char *name) {
    return (std::filesystem::path(__FILE__).parent_path() / "fixtures" /
            (std::string("dashboard_") + name + ".pbm"))
        .string();
}

void WritePbm(const std::string &path, const Frame &frame) {
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    ASSERT_TRUE(output.good()) << path;
    output << "P4\n" << WIND_RENDERER_WIDTH << " " << WIND_RENDERER_HEIGHT << "\n";
    for (int y = 0; y < WIND_RENDERER_HEIGHT; ++y) {
        for (int x = 0; x < WIND_RENDERER_WIDTH; x += 8) {
            uint8_t byte = 0;
            for (int bit = 0; bit < 8; ++bit)
                if (frame[y * WIND_RENDERER_WIDTH + x + bit] == 0)
                    byte |= static_cast<uint8_t>(0x80u >> bit);
            output.put(static_cast<char>(byte));
        }
    }
    ASSERT_TRUE(output.good());
}

Frame ReadPbm(const std::string &path) {
    std::ifstream input(path, std::ios::binary);
    EXPECT_TRUE(input.good()) << path;
    std::string magic;
    int width = 0;
    int height = 0;
    input >> magic >> width >> height;
    input.get();
    EXPECT_EQ(magic, "P4");
    EXPECT_EQ(width, WIND_RENDERER_WIDTH);
    EXPECT_EQ(height, WIND_RENDERER_HEIGHT);
    Frame frame(WIND_RENDERER_PALETTE_BYTES, 1);
    for (int y = 0; y < WIND_RENDERER_HEIGHT && input.good(); ++y) {
        for (int x = 0; x < WIND_RENDERER_WIDTH; x += 8) {
            const int byte = input.get();
            if (byte < 0) return {};
            for (int bit = 0; bit < 8; ++bit)
                frame[y * WIND_RENDERER_WIDTH + x + bit] =
                    (byte & (0x80 >> bit)) ? 0 : 1;
        }
    }
    return frame;
}

Frame ReadPaletteFixture(const char *name) {
    const auto path = std::filesystem::path(WIND_RENDERER_SHARED_FIXTURE_DIR) /
                      (std::string(name) + ".bin");
    std::ifstream input(path, std::ios::binary);
    EXPECT_TRUE(input.good()) << path;
    Frame frame(std::istreambuf_iterator<char>(input), {});
    EXPECT_EQ(frame.size(), WIND_RENDERER_PALETTE_BYTES) << path;
    return frame;
}

void ExpectGolden(const char *name, const wind_renderer_dashboard_t &dashboard) {
    const Frame actual = Render(dashboard);
    const std::string path = FixturePath(name);
    if (std::getenv("WIND_UPDATE_GOLDENS")) WritePbm(path, actual);
    const Frame expected = ReadPbm(path);
    ASSERT_EQ(expected.size(), actual.size());
    EXPECT_EQ(expected, actual);
}

}  // namespace

TEST(WindRenderer, ProducesOneDeterministicMonochromeFrameWithoutClipping) {
    const auto dashboard = Dashboard();
    wind_renderer_stats_t first_stats{};
    const Frame first = Render(dashboard, &first_stats);
    const Frame second = Render(dashboard);
    EXPECT_EQ(first, second);
    EXPECT_EQ(first.size(), 800u * 480u);
    EXPECT_TRUE(std::all_of(first.begin(), first.end(),
                            [](uint8_t value) { return value == 0 || value == 1; }));
    EXPECT_EQ(first_stats.dither_passes, 1);
    EXPECT_EQ(first_stats.clipped_primitives, 0);
    EXPECT_EQ(first_stats.status_right, 770);
    EXPECT_EQ(first[12 * 800 + 12], 0);
    EXPECT_EQ(first[103 * 800 + 400], 0);
    EXPECT_EQ(first[467 * 800 + 787], 0);
}

TEST(WindRenderer, UsesTheSameCompositionForACleanUnditheredPreview) {
    auto dashboard = Dashboard();
    dashboard.display_mode = WIND_RENDERER_MODE_BACKGROUND_FADE;
    const Frame palette_before = Render(dashboard);
    wind_renderer_stats_t stats{};
    const Frame preview = RenderPreview(dashboard, &stats);
    const Frame palette_after = Render(dashboard);

    EXPECT_EQ(palette_before, palette_after);
    EXPECT_EQ(preview.size(), static_cast<size_t>(WIND_RENDERER_RGBA_BYTES));
    EXPECT_EQ(stats.dither_passes, 0);
    EXPECT_EQ(stats.clipped_primitives, 0);
    bool has_continuous_gray = false;
    bool all_alpha_opaque = true;
    for (size_t offset = 0; offset < preview.size(); offset += 4) {
        all_alpha_opaque = all_alpha_opaque && preview[offset + 3] == 255;
        if (preview[offset] == preview[offset + 1] &&
            preview[offset + 1] == preview[offset + 2] &&
            preview[offset] > 0 && preview[offset] < 255) {
            has_continuous_gray = true;
        }
    }
    EXPECT_TRUE(all_alpha_opaque);
    EXPECT_TRUE(has_continuous_gray);

    dashboard.display_mode = WIND_RENDERER_MODE_THRESHOLD;
    const Frame threshold = RenderPreview(dashboard);
    bool has_red = false;
    for (size_t offset = 0; offset < threshold.size(); offset += 4) {
        if (threshold[offset] == 255 && threshold[offset + 1] == 0 &&
            threshold[offset + 2] == 0 && threshold[offset + 3] == 255) {
            has_red = true;
            break;
        }
    }
    EXPECT_TRUE(has_red);
}

TEST(WindRenderer, ExpandsNativePaletteToPhysicalBlackWhiteAndRedRgb) {
    const uint8_t palette[] = {0, 1, 3, 0};
    std::array<uint8_t, 12> rgb{};
    ASSERT_EQ(wind_renderer_palette_row_to_rgb(
                  palette, std::size(palette), rgb.data(), rgb.size()),
              0);
    const std::array<uint8_t, 12> expected = {
        0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0,
    };
    EXPECT_EQ(rgb, expected);

    const uint8_t invalid[] = {2};
    EXPECT_NE(wind_renderer_palette_row_to_rgb(
                  invalid, std::size(invalid), rgb.data(), rgb.size()),
              0);
}

TEST(WindRenderer, UsesFixedScaleAndPinsOverflowValueAboveTheBar) {
    auto dashboard = Dashboard();
    const int speeds[] = {0, 1, 39, 40, 44};
    for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
        dashboard.days[0].samples[sample].sustained_kt = speeds[sample];
        dashboard.days[0].samples[sample].gust_kt = speeds[sample];
    }
    const Frame frame = Render(dashboard);
    const auto black = [&frame](int x, int y) { return frame[y * 800 + x] == 0; };
    constexpr int baseline = 424;
    EXPECT_FALSE(black(38, baseline - 1));
    EXPECT_TRUE(black(64, baseline - 6));
    EXPECT_FALSE(black(64, baseline - 7));
    EXPECT_TRUE(black(90, baseline - 234));
    EXPECT_FALSE(black(90, baseline - 235));
    EXPECT_TRUE(black(116, baseline - 240));
    int overflow_label_pixels = 0;
    for (int y = baseline - 261; y <= baseline - 242; ++y)
        for (int x = 132; x <= 152; ++x)
            if (black(x, y)) ++overflow_label_pixels;
    EXPECT_GT(overflow_label_pixels, 0);
}

TEST(WindRenderer, PlacesFiveTimeSlotsAcrossEachDayOnOneBaseline) {
    auto dashboard = Dashboard();
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day)
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            dashboard.days[day].samples[sample].sustained_kt = 10;
            dashboard.days[day].samples[sample].gust_kt = 12;
        }

    const Frame frame = Render(dashboard);
    constexpr int baseline = 424;
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day) {
        std::array<int, WIND_RENDERER_SAMPLES_PER_DAY> centers{};
        std::array<int, WIND_RENDERER_SAMPLES_PER_DAY> baselines{};
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            centers[sample] = 12 + day * 155 + 26 + sample * 26;
            baselines[sample] = baseline;
            EXPECT_EQ(frame[(baseline - 1) * 800 + centers[sample]], 0)
                << "day " << day << ", sample " << sample;
        }
        for (int sample = 1; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            EXPECT_LT(centers[sample - 1], centers[sample]);
            EXPECT_NE(centers[sample - 1], centers[sample]);
            EXPECT_EQ(baselines[sample - 1], baselines[sample]);
        }
    }
}

TEST(WindRenderer, SupportsBackgroundThresholdAndSolidDisplayModes) {
    auto dashboard = Dashboard();
    for (int day = 0; day < WIND_RENDERER_DAY_COUNT; ++day)
        for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
            dashboard.days[day].samples[sample].sustained_kt = 10;
            dashboard.days[day].samples[sample].gust_kt = 14;
        }

    dashboard.display_mode = WIND_RENDERER_MODE_BACKGROUND_FADE;
    const Frame background = Render(dashboard);
    dashboard.display_mode = WIND_RENDERER_MODE_THRESHOLD;
    const Frame threshold = Render(dashboard);
    dashboard.display_mode = WIND_RENDERER_MODE_SOLID;
    const Frame solid = Render(dashboard);

    // The background treatment reaches both outer edges and the row directly
    // above the black value separator, but is absent in the other modes.
    EXPECT_GT(CountBlack(background, 13, 330, 20, 431), 0);
    EXPECT_GT(CountBlack(background, 779, 330, 786, 431), 0);
    const int background_bottom = CountBlack(background, 13, 425, 786, 431);
    const int threshold_bottom = CountBlack(threshold, 13, 425, 786, 431);
    const int solid_bottom = CountBlack(solid, 13, 425, 786, 431);
    EXPECT_GT(background_bottom, threshold_bottom);
    EXPECT_EQ(threshold_bottom, solid_bottom);
    EXPECT_GT(CountColor(threshold, 28, 320, 771, 324, 3), 0);
    EXPECT_EQ(CountColor(solid, 28, 320, 771, 324, 3), 0);
}

TEST(WindRenderer, UsesTheConfiguredThresholdAcrossItsSupportedRange) {
    auto dashboard = Dashboard();
    dashboard.display_mode = WIND_RENDERER_MODE_THRESHOLD;

    dashboard.threshold_kt = WIND_RENDERER_MIN_THRESHOLD_KT;
    const Frame minimum = Render(dashboard);
    dashboard.threshold_kt = WIND_RENDERER_DEFAULT_THRESHOLD_KT;
    const Frame default_threshold = Render(dashboard);
    const Frame repeated_default = Render(dashboard);
    dashboard.threshold_kt = WIND_RENDERER_MAX_THRESHOLD_KT;
    const Frame maximum = Render(dashboard);

    const auto threshold_y = [](int knots) { return 424 - knots * 240 / 40; };
    EXPECT_GT(CountColor(minimum, 36, threshold_y(WIND_RENDERER_MIN_THRESHOLD_KT),
                         762, threshold_y(WIND_RENDERER_MIN_THRESHOLD_KT), 3),
              0);
    EXPECT_GT(CountColor(default_threshold, 36,
                         threshold_y(WIND_RENDERER_DEFAULT_THRESHOLD_KT), 762,
                         threshold_y(WIND_RENDERER_DEFAULT_THRESHOLD_KT), 3),
              0);
    EXPECT_GT(CountColor(maximum, 36, threshold_y(WIND_RENDERER_MAX_THRESHOLD_KT),
                         762, threshold_y(WIND_RENDERER_MAX_THRESHOLD_KT), 3),
              0);
    EXPECT_NE(minimum, default_threshold);
    EXPECT_NE(default_threshold, maximum);
    EXPECT_EQ(default_threshold, repeated_default);
}

TEST(WindRenderer, RejectsInvalidConfigurationAndIncompleteAvailableSamples) {
    Frame frame(WIND_RENDERER_PALETTE_BYTES);
    auto dashboard = Dashboard();

    dashboard.display_mode = WIND_RENDERER_MODE_COUNT;
    EXPECT_NE(wind_renderer_render(&dashboard, frame.data(), frame.size(), nullptr), 0);

    dashboard = Dashboard();
    dashboard.threshold_kt = WIND_RENDERER_MIN_THRESHOLD_KT - 1;
    EXPECT_NE(wind_renderer_render(&dashboard, frame.data(), frame.size(), nullptr), 0);
    dashboard.threshold_kt = WIND_RENDERER_MAX_THRESHOLD_KT + 1;
    EXPECT_NE(wind_renderer_render(&dashboard, frame.data(), frame.size(), nullptr), 0);

    dashboard = Dashboard();
    dashboard.days[0].samples[0].time = nullptr;
    EXPECT_NE(wind_renderer_render(&dashboard, frame.data(), frame.size(), nullptr), 0);

    dashboard = Dashboard();
    const std::string oversized(WIND_RENDERER_SPOT_NAME_CAPACITY, 'W');
    dashboard.spot_name = oversized.c_str();
    EXPECT_NE(wind_renderer_render(&dashboard, frame.data(), frame.size(), nullptr), 0);
}

TEST(WindRenderer, ConvertsVersionedBoundedInputToTheCanonicalDashboard) {
    wind_renderer_input_v2_t input{};
    wind_renderer_input_v2_init(&input);
    EXPECT_EQ(wind_renderer_contract_version(), WIND_RENDERER_CONTRACT_VERSION);
    EXPECT_EQ(input.version, WIND_RENDERER_CONTRACT_VERSION);
    EXPECT_EQ(input.threshold_kt, WIND_RENDERER_DEFAULT_THRESHOLD_KT);

    EXPECT_EQ(wind_renderer_input_v2_set_metadata(
                  &input, "Brouwersdam", "51.7506N 3.8577E", "KNMI", "11:05"),
              0);
    EXPECT_EQ(wind_renderer_input_v2_set_status(
                  &input, WIND_RENDERER_FRESH, 0, 1, 74,
                  WIND_RENDERER_MODE_THRESHOLD, 23),
              0);
    EXPECT_EQ(wind_renderer_input_v2_set_display_rows(&input, 1, 1, 1, 1), 0);
    EXPECT_EQ(wind_renderer_input_v2_set_day(&input, 0, "TODAY", "24 AUG"), 0);
    EXPECT_EQ(wind_renderer_input_v2_set_sample(
                  &input, 0, 0, "08", 18, 24, 245, 1,
                  WIND_RENDERER_WEATHER_CLEAR_DAY, -24, 1),
              0);
    EXPECT_EQ(wind_renderer_input_v2_set_tide_sample(&input, 0, 0, 8, -350, 1), 0);
    EXPECT_EQ(wind_renderer_input_v2_set_tide_sample(&input, 1, 0, 9, -300, 1), 0);

    wind_renderer_dashboard_t dashboard{};
    EXPECT_EQ(wind_renderer_input_v2_to_dashboard(&input, &dashboard), 0);
    EXPECT_STREQ(dashboard.spot_name, "Brouwersdam");
    EXPECT_EQ(dashboard.threshold_kt, 23);
    EXPECT_EQ(dashboard.days[0].samples[0].sustained_kt, 18);
    EXPECT_EQ(dashboard.days[0].samples[0].temperature_tenths_c, -24);
    EXPECT_EQ(dashboard.tide_samples[0].sea_level_mm, -350);

    const std::string oversized(WIND_RENDERER_SPOT_NAME_CAPACITY, 'W');
    EXPECT_NE(wind_renderer_input_v2_set_metadata(
                  &input, oversized.c_str(), "", "KNMI", "11:05"),
              0);
    EXPECT_NE(wind_renderer_input_v2_set_status(
                  &input, WIND_RENDERER_FRESH, 0, 1, 74,
                  WIND_RENDERER_MODE_COUNT, 23),
              0);
    EXPECT_NE(wind_renderer_input_v2_set_sample(
                  &input, 0, 0, "", 18, 24, 245, 1,
                  WIND_RENDERER_WEATHER_CLEAR_DAY, 120, 1),
              0);

    input.version = WIND_RENDERER_CONTRACT_VERSION + 1;
    EXPECT_NE(wind_renderer_input_v2_to_dashboard(&input, &dashboard), 0);
}

TEST(WindRenderer, MatchesEveryFullPaletteCrossRuntimeFixture) {
    for (std::size_t fixture_index = 0;
         fixture_index < WIND_RENDERER_FIXTURE_COUNT; ++fixture_index) {
        wind_renderer_input_v2_t input{};
        ASSERT_EQ(wind_renderer_fixture_build(fixture_index, &input), 0);
        Frame actual(WIND_RENDERER_PALETTE_BYTES);
        ASSERT_EQ(wind_renderer_input_v2_render(
                      &input, actual.data(), actual.size(), nullptr),
                  0);
        const char *name = wind_renderer_fixture_name(fixture_index);
        ASSERT_NE(name, nullptr);
        const Frame expected = ReadPaletteFixture(name);
        EXPECT_EQ(actual, expected) << name;
        if (input.display_mode == WIND_RENDERER_MODE_THRESHOLD) {
            EXPECT_GT(std::count(actual.begin(), actual.end(),
                                 static_cast<uint8_t>(3)),
                      0)
                << name;
        }
    }
}

TEST(WindRenderer, AllocatesEveryOptionalRowCombinationAndKeepsWindFlexible) {
    for (int mask = 0; mask < 8; ++mask) {
        auto dashboard = Dashboard();
        dashboard.show_weather = mask & 1;
        dashboard.show_temperature = (mask >> 1) & 1;
        dashboard.show_tide = (mask >> 2) & 1;
        dashboard.tide_available = 0;
        wind_renderer_stats_t stats{};
        const Frame frame = Render(dashboard, &stats);
        EXPECT_EQ(stats.clipped_primitives, 0) << mask;
        EXPECT_EQ(stats.wind_baseline,
                  459 - (dashboard.show_weather ? 35 : 0) -
                      (dashboard.show_temperature ? 26 : 0) -
                      (dashboard.show_tide ? 58 : 0)) << mask;
        EXPECT_EQ(frame[(stats.wind_baseline - 1) * 800 + 38], 0) << mask;
    }
}

TEST(WindRenderer, DrawsTemperatureAndTideWithoutMovingEnabledRowsWhenDataIsMissing) {
    auto dashboard = Dashboard();
    dashboard.show_temperature = 1;
    dashboard.show_tide = 1;
    dashboard.tide_available = 1;
    dashboard.tide_sample_count = 120;
    for (int index = 0; index < 120; ++index) {
        dashboard.tide_samples[index] = {
            index / 24, index % 24,
            static_cast<int>(std::sin(index / 6.0) * 800), 1,
        };
    }
    wind_renderer_stats_t populated_stats{};
    const Frame populated = Render(dashboard, &populated_stats);
    EXPECT_GT(CountBlack(populated, 13, populated_stats.temperature_row_top + 1, 786,
                         populated_stats.tide_row_top - 1), 0);
    EXPECT_GT(CountBlack(populated, 13, populated_stats.tide_row_top + 1, 786, 466), 0);

    for (auto &day : dashboard.days)
        for (auto &sample : day.samples) sample.temperature_available = 0;
    dashboard.tide_available = 0;
    wind_renderer_stats_t missing_stats{};
    (void)Render(dashboard, &missing_stats);
    EXPECT_EQ(missing_stats.wind_baseline, populated_stats.wind_baseline);
    EXPECT_EQ(missing_stats.temperature_row_top, populated_stats.temperature_row_top);
    EXPECT_EQ(missing_stats.tide_row_top, populated_stats.tide_row_top);
}

TEST(WindRenderer, KeepsStraightStructuralPixelsAtFullLumaInCleanPreview) {
    auto dashboard = Dashboard();
    dashboard.show_temperature = 1;
    dashboard.show_tide = 1;
    const Frame preview = RenderPreview(dashboard);
    const auto channel = [&preview](int x, int y) { return preview[(y * 800 + x) * 4]; };
    for (int x = 12; x <= 787; ++x) {
        EXPECT_TRUE(channel(x, 12) == 0 || channel(x, 12) == 255);
        EXPECT_TRUE(channel(x, 348) == 0 || channel(x, 348) == 255);
    }
}

TEST(WindRenderer, MakesBatteryRedBelowTenPercentOnly) {
    auto dashboard = Dashboard();
    dashboard.battery_percent = 9;
    const Frame low = Render(dashboard);
    EXPECT_GT(CountColor(low, 746, 65, 771, 78, 3), 0);

    dashboard.battery_percent = 10;
    const Frame ten = Render(dashboard);
    EXPECT_EQ(CountColor(ten, 746, 65, 771, 78, 3), 0);
}

TEST(WindRenderer, KeepsStatusRightAlignedAndDropsCoordinatesBeforeEllipsis) {
    auto dashboard = Dashboard();
    wind_renderer_stats_t normal_stats{};
    (void)Render(dashboard, &normal_stats);
    EXPECT_EQ(normal_stats.coordinates_included, 1);

    dashboard.spot_name = "Noord-Holland Windmeetpost Met Een Uitzonderlijk Lange Naam";
    wind_renderer_stats_t long_stats{};
    (void)Render(dashboard, &long_stats);
    EXPECT_EQ(long_stats.coordinates_included, 0);
    EXPECT_EQ(long_stats.status_right, normal_stats.status_right);
    EXPECT_EQ(long_stats.clipped_primitives, 0);
}

TEST(WindRenderer, CoversAgedStaleUnavailableAndBatteryWarnings) {
    auto aged = Dashboard(WIND_RENDERER_AGED);
    aged.age_hours = 8;
    aged.battery_percent = 12;
    auto stale = Dashboard(WIND_RENDERER_STALE);
    stale.days[2].samples[3].available = 0;
    auto offline = Dashboard();
    offline.refresh_failed = 1;
    auto unavailable = Dashboard(WIND_RENDERER_UNAVAILABLE);
    unavailable.battery_percent = -1;
    for (const auto *dashboard : {&aged, &stale, &offline, &unavailable}) {
        wind_renderer_stats_t stats{};
        const Frame frame = Render(*dashboard, &stats);
        EXPECT_EQ(stats.dither_passes, 1);
        EXPECT_EQ(stats.clipped_primitives, 0);
        EXPECT_TRUE(std::all_of(frame.begin(), frame.end(),
                                [](uint8_t value) { return value <= 1; }));
    }
}

TEST(WindRendererGolden, Normal) { ExpectGolden("normal", Dashboard()); }

TEST(WindRendererGolden, HighWind) {
    auto dashboard = Dashboard();
    for (int sample = 0; sample < WIND_RENDERER_SAMPLES_PER_DAY; ++sample) {
        dashboard.days[0].samples[sample].sustained_kt = 36 + sample * 2;
        dashboard.days[0].samples[sample].gust_kt = 42 + sample * 3;
    }
    ExpectGolden("high_wind", dashboard);
}

TEST(WindRendererGolden, LongName) {
    auto dashboard = Dashboard();
    dashboard.spot_name = "Noord-Holland Windmeetpost Met Een Uitzonderlijk Lange Naam";
    ExpectGolden("long_name", dashboard);
}

TEST(WindRendererGolden, Stale) {
    auto dashboard = Dashboard(WIND_RENDERER_STALE);
    dashboard.age_hours = 25;
    dashboard.battery_percent = 12;
    ExpectGolden("stale", dashboard);
}

TEST(WindRendererGolden, Unavailable) {
    auto dashboard = Dashboard(WIND_RENDERER_UNAVAILABLE);
    dashboard.battery_percent = -1;
    ExpectGolden("unavailable", dashboard);
}
