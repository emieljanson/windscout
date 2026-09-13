/* GT911 register protocol. Bus is shared with the RTC, sensor and charger.
 * https://wiki.seeedstudio.com/reterminal_e10xx_with_arduino_peripherals_2/
 */
static i2c_master_dev_handle_t touch_device;
static uint16_t touch_width, touch_height;
static int touch_wake_level;

static esp_err_t touch_read_register(uint16_t reg, uint8_t *data, size_t size) {
    uint8_t address[] = {(uint8_t)(reg >> 8), (uint8_t)(reg & 255)};
    return i2c_master_transmit_receive(touch_device,address,2,data,size,50);
}

static esp_err_t touch_ack(void) {
    const uint8_t clear[] = {0x81,0x4e,0};
    return i2c_master_transmit(touch_device,clear,sizeof(clear),50);
}

static bool touch_probe(void) {
    const uint8_t addresses[] = {0x5d,0x14};
    for (size_t i=0;i<2;++i) {
        if (i2c_master_probe(i2c_bus,addresses[i],50)!=ESP_OK) continue;
        i2c_device_config_t config={.dev_addr_length=I2C_ADDR_BIT_LEN_7,
            .device_address=addresses[i],.scl_speed_hz=100000};
        if (i2c_master_bus_add_device(i2c_bus,&config,&touch_device)!=ESP_OK) continue;
        uint8_t product[4], limits[4], mode;
        if (touch_read_register(0x8140,product,4)==ESP_OK &&
            product[0]=='9' && product[1]=='1' && product[2]=='1' &&
            touch_read_register(0x8048,limits,4)==ESP_OK &&
            touch_read_register(0x804d,&mode,1)==ESP_OK) {
            touch_width=limits[0]|(limits[1]<<8);
            touch_height=limits[2]|(limits[3]<<8);
            touch_wake_level=(mode&3)==0 || (mode&3)==3;
            if (touch_width && touch_height) return true;
        }
        i2c_master_bus_rm_device(touch_device); touch_device=NULL;
    }
    return false;
}

static void touch_init(void) {
    gpio_hold_dis(BOARD_HAL_TOUCH_RESET);
    gpio_hold_dis(BOARD_HAL_TOUCH_INT);
    gpio_config_t interrupt={.pin_bit_mask=1ULL<<BOARD_HAL_TOUCH_INT,
        .mode=GPIO_MODE_INPUT,.pull_up_en=GPIO_PULLUP_ENABLE};
    gpio_config(&interrupt);
    /* Probe first: resetting after deep sleep would discard the wake touch. */
    if (touch_probe()) return;
    gpio_config_t reset={.pin_bit_mask=1ULL<<BOARD_HAL_TOUCH_RESET,.mode=GPIO_MODE_OUTPUT};
    gpio_config(&reset);
    gpio_set_level(BOARD_HAL_TOUCH_RESET,0); vTaskDelay(pdMS_TO_TICKS(20));
    gpio_set_level(BOARD_HAL_TOUCH_RESET,1); vTaskDelay(pdMS_TO_TICKS(120));
    if (!touch_probe()) ESP_LOGW(TAG,"GT911 unavailable; physical buttons remain usable");
}

bool board_hal_touch_available(void) { return touch_device != NULL; }
int board_hal_touch_wake_level(void) { return touch_wake_level; }

esp_err_t board_hal_touch_read(board_touch_sample_t *sample) {
    if (!sample) return ESP_ERR_INVALID_ARG;
    if (!touch_device) return ESP_ERR_NOT_SUPPORTED;
    uint8_t status;
    esp_err_t result=touch_read_register(0x814e,&status,1);
    if (result!=ESP_OK) return result;
    if (!(status&0x80)) return ESP_ERR_NOT_FINISHED;
    *sample=(board_touch_sample_t){.contacts=(unsigned)(status&15)};
    if (sample->contacts>5) { (void)touch_ack(); return ESP_ERR_INVALID_RESPONSE; }
    if (sample->contacts) {
        uint8_t point[8];
        result=touch_read_register(0x814f,point,8);
        if (result!=ESP_OK) { (void)touch_ack(); return result; }
        unsigned x=point[1]|(point[2]<<8), y=point[3]|(point[4]<<8);
        if (x>=touch_width || y>=touch_height) { (void)touch_ack(); return ESP_ERR_INVALID_RESPONSE; }
        /* Firmware and the GT911 configuration both use native landscape axes. */
        sample->x=(uint32_t)x*1872/touch_width;
        sample->y=(uint32_t)y*1404/touch_height;
    }
    return touch_ack();
}
