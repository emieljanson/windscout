set(srcs "")
if(CONFIG_EP_DRIVER_UC8179_GRAY4_EXPERIMENTAL)
    list(APPEND srcs "src/driver_uc8179.c")
endif()

idf_component_register(
    SRCS "${srcs}"
    REQUIRES driver esp_driver_gpio esp_driver_spi epaper
    WHOLE_ARCHIVE
)
