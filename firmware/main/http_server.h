#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

esp_err_t http_server_init(void);
esp_err_t http_server_stop(void);
void http_server_set_ready(void);
void http_server_enable_maintenance(uint32_t duration_seconds);
bool http_server_is_maintenance_enabled(void);

#endif
