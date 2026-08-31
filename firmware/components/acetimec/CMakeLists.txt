file(GLOB ACETIMEC_CORE_SOURCES
    "${CMAKE_CURRENT_LIST_DIR}/src/acetimec/*.c"
    "${CMAKE_CURRENT_LIST_DIR}/src/zoneinfo/*.c"
    "${CMAKE_CURRENT_LIST_DIR}/src/zonedb2025/*.c"
)

idf_component_register(
    SRCS ${ACETIMEC_CORE_SOURCES}
    INCLUDE_DIRS "src"
)
