#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

extern "C" {
#include "wind_renderer.h"
#include "wind_renderer_fixture.h"
}

#ifndef WIND_RENDERER_SHARED_FIXTURE_DIR
#define WIND_RENDERER_SHARED_FIXTURE_DIR "../../shared/renderer-fixtures"
#endif

namespace {

bool WriteFixture(const std::filesystem::path &output_directory,
                  std::size_t fixture_index) {
    wind_renderer_input_v1_t input{};
    if (wind_renderer_fixture_build(fixture_index, &input) != 0) return false;

    std::vector<std::uint8_t> palette(WIND_RENDERER_PALETTE_BYTES, 0xff);
    wind_renderer_stats_t stats{};
    if (wind_renderer_input_v1_render(
            &input, palette.data(), palette.size(), &stats) != 0 ||
        stats.dither_passes != 1 || stats.clipped_primitives != 0) {
        return false;
    }
    if (!std::all_of(palette.begin(), palette.end(), [](std::uint8_t value) {
            return value == 0 || value == 1 || value == 3;
        })) {
        return false;
    }

    const auto red_pixels =
        std::count(palette.begin(), palette.end(), static_cast<std::uint8_t>(3));
    if (input.display_mode == WIND_RENDERER_MODE_THRESHOLD && red_pixels == 0)
        return false;

    const char *fixture_name = wind_renderer_fixture_name(fixture_index);
    if (!fixture_name) return false;
    const std::filesystem::path final_path =
        output_directory / (std::string(fixture_name) + ".bin");
    const std::filesystem::path temporary_path = final_path.string() + ".tmp";
    std::ofstream output(temporary_path, std::ios::binary | std::ios::trunc);
    output.write(reinterpret_cast<const char *>(palette.data()),
                 static_cast<std::streamsize>(palette.size()));
    output.close();
    if (!output.good() || std::filesystem::file_size(temporary_path) !=
                              WIND_RENDERER_PALETTE_BYTES) {
        std::filesystem::remove(temporary_path);
        return false;
    }
    std::filesystem::rename(temporary_path, final_path);
    std::cout << final_path << " " << palette.size() << " bytes, "
              << red_pixels << " red pixels\n";
    return true;
}

}  // namespace

int main(int argc, char **argv) {
    const std::filesystem::path output_directory =
        argc > 1 ? argv[1] : WIND_RENDERER_SHARED_FIXTURE_DIR;
    std::filesystem::create_directories(output_directory);
    for (std::size_t fixture_index = 0;
         fixture_index < WIND_RENDERER_FIXTURE_COUNT; ++fixture_index) {
        if (!WriteFixture(output_directory, fixture_index)) {
            std::cerr << "Could not export fixture " << fixture_index << "\n";
            return 1;
        }
    }
    return 0;
}
