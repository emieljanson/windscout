cmake_minimum_required(VERSION 3.14)
project(esp32_photoframe_tests)

set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fetch Google Test
include(FetchContent)
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG v1.14.0
)
# For Windows: Prevent overriding the parent project's compiler/linker settings
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

set(ENABLE_CJSON_TEST OFF CACHE BOOL "" FORCE)
set(ENABLE_CJSON_UTILS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  cjson
  GIT_REPOSITORY https://github.com/DaveGamble/cJSON.git
  GIT_TAG v1.7.18
)
FetchContent_MakeAvailable(cjson)

# Enable testing
enable_testing()

# Cron engine tests
add_executable(
  cron_test
  test_cron.cpp
  ../main/cron.c
)

target_link_libraries(
  cron_test
  GTest::gtest_main
)

target_include_directories(
  cron_test
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/../main
)

# Wake-schedule simulation (early-wake re-sleep loop vs. the real cron engine)
add_executable(
  wake_schedule_test
  test_wake_schedule.cpp
  ../main/cron.c
)

target_link_libraries(
  wake_schedule_test
  GTest::gtest_main
)

target_include_directories(
  wake_schedule_test
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}/../main
)

# Discover tests
include(GoogleTest)
gtest_discover_tests(cron_test)
gtest_discover_tests(wake_schedule_test)

# On-device image pipeline characterization tests (host build of
# main/image_processor.c against ESP-IDF stubs + system libpng)
find_package(PNG REQUIRED)

add_executable(
  image_pipeline_test
  test_image_pipeline.cpp
  ../main/image_processor.c
  stubs/esp_stubs.c
  stubs/fake_display_manager.c
  stubs/fake_config_manager.c
  stubs/fake_processing_settings.c
)

target_include_directories(
  image_pipeline_test
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/stubs
  ${CMAKE_CURRENT_SOURCE_DIR}/../main
)

target_link_libraries(
  image_pipeline_test
  GTest::gtest_main
  PNG::PNG
  m
)

gtest_discover_tests(image_pipeline_test)

# .current.* / thumbnail lifecycle tests for the shared display flow.
# FS_MOUNT_POINT is redirected to a local directory so the tests exercise
# the real path scheme against the host filesystem.
add_executable(
  display_flow_test
  test_display_flow.cpp
  ../main/display_flow.c
  ../main/image_processor.c
  stubs/esp_stubs.c
  stubs/fake_display_manager.c
  stubs/fake_config_manager.c
  stubs/fake_processing_settings.c
  stubs/fake_storage.c
)

target_compile_definitions(
  display_flow_test
  PRIVATE
  FS_MOUNT_POINT="pf_storage"
)

target_include_directories(
  display_flow_test
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/stubs
  ${CMAKE_CURRENT_SOURCE_DIR}/../main
)

target_link_libraries(
  display_flow_test
  GTest::gtest_main
  PNG::PNG
  m
)

gtest_discover_tests(display_flow_test)

add_executable(epaper_contract_test test_epaper_contract.cpp)
target_include_directories(
  epaper_contract_test
  PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/stubs
  ${CMAKE_CURRENT_SOURCE_DIR}/../components/epaper/include
)
target_link_libraries(epaper_contract_test GTest::gtest_main)
gtest_discover_tests(epaper_contract_test)

function(add_wind_test target test_source)
  add_executable(${target} ${test_source} ${ARGN})
  target_include_directories(${target} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
    ${CMAKE_CURRENT_SOURCE_DIR}/../main
  )
  target_link_libraries(${target} GTest::gtest_main m)
  gtest_discover_tests(${target})
endfunction()

add_wind_test(wind_forecast_test test_wind_forecast.cpp ../main/wind_forecast.c)

add_wind_test(wind_spots_test test_wind_spots.cpp ../main/wind_spots.c)

add_wind_test(
  wind_provider_test
  test_wind_provider.cpp
  ../main/wind_forecast.c
  ../main/open_meteo_knmi_provider.c
)
target_link_libraries(wind_provider_test cjson)
target_include_directories(wind_provider_test BEFORE PRIVATE ${cjson_SOURCE_DIR})
target_compile_definitions(
  wind_provider_test
  PRIVATE WIND_PROVIDER_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/fixtures/open_meteo_knmi.json"
)

add_wind_test(
  wind_cache_test
  test_wind_cache.cpp
  ../main/wind_forecast.c
  ../main/wind_cache.c
)

add_wind_test(
  wind_schedule_test
  test_wind_schedule.cpp
  ../main/wind_schedule.c
)

add_wind_test(
  wind_app_test
  test_wind_app.cpp
  ../main/wind_forecast.c
  ../main/wind_cache.c
  ../main/wind_schedule.c
  ../main/wind_app.c
)

add_test(
  NAME wind_config_validation_test
  COMMAND ${CMAKE_COMMAND}
    -DTEST_C_COMPILER=${CMAKE_C_COMPILER}
    -DWIND_CONFIG_INCLUDE_DIR=${CMAKE_CURRENT_SOURCE_DIR}/../main
    -DTEST_BINARY_DIR=${CMAKE_CURRENT_BINARY_DIR}/wind_config_validation
    -P ${CMAKE_CURRENT_SOURCE_DIR}/test_wind_config.cmake
)

set(WIND_FONT_SOURCES
  ../main/wind_font.c
  ../main/fonts/berkeley_mono_12.c
  ../main/fonts/berkeley_mono_14.c
  ../main/fonts/berkeley_mono_32.c
  ../main/fonts/berkeley_mono_bold_15.c
  ../main/fonts/berkeley_mono_bold_condensed_15.c
  ../main/fonts/inter_bold_15.c
  ../main/fonts/inter_16.c
  ../main/fonts/inter_28.c
)

add_wind_test(wind_font_test test_wind_font.cpp ${WIND_FONT_SOURCES})

add_wind_test(
  wind_renderer_test
  test_wind_renderer.cpp
  ../main/wind_renderer.c
  ${WIND_FONT_SOURCES}
)
target_compile_definitions(
  wind_renderer_test
  PRIVATE WIND_RENDERER_GOLDEN_DIR="${CMAKE_CURRENT_SOURCE_DIR}/goldens"
)
