#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "power_manager.h"

typedef struct {
    bool down[2];
    bool armed[2];
    uint32_t pressed_at[2];
} wind_navigation_buttons_t;

static inline int wind_navigation_wake_direction(wakeup_source_t wake, size_t spots)
{
    if (spots < 2) return 0;
    if (wake == WAKEUP_SOURCE_ROTATE_BUTTON) return -1;
    if (wake == WAKEUP_SOURCE_CLEAR_BUTTON) return 1;
    return 0;
}

static inline bool wind_navigation_sleep_after_wake(wakeup_source_t wake, size_t spots)
{
    return wake == WAKEUP_SOURCE_TIMER || wind_navigation_wake_direction(wake, spots) != 0;
}

// A button must first be seen released. Installer activity and recovery chords
// cancel a press, including when one of the chord's buttons is released first.
static inline int wind_navigation_poll(wind_navigation_buttons_t *state,
                                       bool previous, bool next, bool installer,
                                       size_t spots, uint32_t now_ms)
{
    const bool held[2] = {previous, next};
    const bool blocked = installer || (previous && next);
    int direction = 0;
    for (size_t i = 0; i < 2; ++i) {
        if (blocked) state->armed[i] = false;
        if (held[i] && !state->down[i]) state->pressed_at[i] = now_ms;
        if (!held[i] && state->down[i] && state->armed[i] && !blocked && spots > 1) {
            const uint32_t duration = now_ms - state->pressed_at[i];
            if (duration >= 50 && duration < 3000) direction = i == 0 ? -1 : 1;
        }
        if (!held[i] && !blocked) state->armed[i] = true;
        state->down[i] = held[i];
    }
    return direction;
}

// A selection notification invalidates the previous spot's deadline. Re-read
// it even when a notification arrives just before the wait starts.
static inline void wind_navigation_wait_for_refresh(
    void *context, int (*seconds_until_wake)(void *), bool (*wait_notified)(void *, int))
{
    for (;;) {
        const int seconds = seconds_until_wake(context);
        if (!wait_notified(context, seconds > 0 ? seconds : 1)) return;
    }
}
