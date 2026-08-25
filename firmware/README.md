# WindScout firmware

WindScout is an 800 x 480 monochrome wind forecast dashboard for the Seeed
Studio reTerminal E1002. It fetches a five-day KNMI Seamless forecast directly,
caches the last valid result, renders locally and only refreshes the E-ink panel
when the final bitmap changed.

## Dashboard

- Five days with samples at 08:00, 11:00, 14:00, 17:00 and 20:00 local time.
- Vertical bars show sustained wind; horizontal markers show gusts.
- Arrows point toward the direction the wind travels.
- A fixed 0-40 kt scale makes days directly comparable.
- Fresh, aged, stale and unavailable states remain legible without color.
- Geometry sits on integer pixels; text and arrows pass through one final
  Floyd-Steinberg monochrome dither pass.

## Local configuration

Copy `main/wind_config.example.h` to `main/wind_config.local.h` and adjust the
spot and provider settings. The local file is ignored by Git.

The public Open-Meteo endpoint is only appropriate for development and
non-commercial use. A product build must use a licensed customer endpoint and
API key; commercial mode deliberately refuses an empty key.

## Build and test

```sh
make test
./build.py --board seeedstudio_reterminal_e1002
idf.py -p /dev/cu.usbmodemXXXX flash monitor
```

Wi-Fi provisioning, deep sleep, battery reporting, hardware buttons and OTA are
retained from the upstream ESP32 Photo Frame firmware. See `UPSTREAM.md` for
origin and license details.
