#ifndef ALBUM_MANAGER_H
#define ALBUM_MANAGER_H

#include <stdbool.h>
#include <stddef.h>
#include <string.h>

#include "esp_err.h"

#define ALBUM_NAME_MAX_LEN 127

static inline bool album_manager_is_valid_name(const char *album_name)
{
    if (!album_name || album_name[0] == '\0' || strlen(album_name) > ALBUM_NAME_MAX_LEN ||
        strstr(album_name, "..") != NULL) {
        return false;
    }

    for (const unsigned char *cursor = (const unsigned char *) album_name; *cursor; cursor++) {
        if (*cursor == '/' || *cursor == '\\' || *cursor < 0x20 || *cursor == 0x7f) {
            return false;
        }
    }
    return true;
}

esp_err_t album_manager_init(void);
esp_err_t album_manager_ensure_default_album(void);
esp_err_t album_manager_list_albums(char ***albums, int *count);
void album_manager_free_album_list(char **albums, int count);
esp_err_t album_manager_create_album(const char *album_name);
esp_err_t album_manager_delete_album(const char *album_name);
esp_err_t album_manager_set_album_enabled(const char *album_name, bool enabled);
bool album_manager_is_album_enabled(const char *album_name);
esp_err_t album_manager_get_enabled_albums(char ***albums, int *count);
esp_err_t album_manager_get_album_path(const char *album_name, char *path, size_t path_len);
bool album_manager_album_exists(const char *album_name);

#endif
