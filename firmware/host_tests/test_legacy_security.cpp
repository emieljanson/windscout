#include <cassert>
#include <string>

extern "C" {
#include "album_manager.h"
#include "utils.h"
}

int main()
{
    assert(album_manager_is_valid_name("Default"));
    assert(album_manager_is_valid_name("Holiday 2026"));
    assert(!album_manager_is_valid_name(nullptr));
    assert(!album_manager_is_valid_name(""));
    assert(!album_manager_is_valid_name(".."));
    assert(!album_manager_is_valid_name("album/child"));
    assert(!album_manager_is_valid_name("album\\child"));
    assert(!album_manager_is_valid_name("album\nchild"));
    assert(!album_manager_is_valid_name(std::string(ALBUM_NAME_MAX_LEN + 1, 'a').c_str()));

    assert(utils_url_allows_credentials("https://images.example/frame", "https://images.example/api"));
    assert(utils_url_allows_credentials("HTTPS://IMAGES.EXAMPLE/frame", "https://images.example/api"));
    assert(!utils_url_allows_credentials("http://images.example/frame", "https://images.example/api"));
    assert(!utils_url_allows_credentials("https://evil.example/frame", "https://images.example/api"));
    assert(!utils_url_allows_credentials("https://images.example.evil/frame",
                                         "https://images.example/api"));
    assert(!utils_url_allows_credentials("https://images.example:444/frame",
                                         "https://images.example/api"));
    return 0;
}
