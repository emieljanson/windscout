set(EPAPER_SRCS "epaper_busy_wait.c")
if(CONFIG_BOARD_DRIVER_SEEEDSTUDIO_RETERMINAL_E100X)
    list(APPEND EPAPER_SRCS "epaper_dispatcher.c")
endif()

idf_component_register(
    SRCS "${EPAPER_SRCS}"
    INCLUDE_DIRS "include"
    REQUIRES driver
)
