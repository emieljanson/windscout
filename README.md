# WindScout

WindScout turns a Seeed Studio reTerminal E1002 into a quiet, battery-efficient
wind forecast dashboard. The device downloads forecast data itself and renders
the complete interface locally; no map service or rendering backend is
required. The browser configurator compiles that same renderer to WebAssembly.
Both surfaces therefore share one 800 x 480 composition and all drawing logic;
only the final output pass differs. The device applies the exact e-ink palette
and dithering, while the browser keeps the pre-dither grayscale and red accents
for a clean, sharp preview.

The active implementation and setup instructions live in
[`firmware/`](firmware/README.md). Product decisions and acceptance criteria are
captured in [`docs/plans/2026-08-24-1109-feat-local-wind-dashboard-plan.md`](docs/plans/2026-08-24-1109-feat-local-wind-dashboard-plan.md).

## Repository layout

- `firmware/main/`: forecast, cache, schedule, renderer and device integration.
- `firmware/host_tests/`: deterministic host tests and 800 x 480 golden frames.
- `web/`: interactive 3D configurator with direct browser forecast retrieval.
- `shared/renderer-fixtures/`: full-palette parity fixtures shared by native and
  WebAssembly tests.
- `docs/`: font provenance, implementation plan and durable rendering lessons.

## Web configurator

Run the configurator locally from `web/`:

```sh
npm install
npm run dev
```

The checked-in WebAssembly module is generated with a pinned Emscripten image.
Regenerate it after changing the renderer, fonts, icons or bridge:

```sh
npm run renderer:build
npm run renderer:check
npm test -- --run tests/shared-renderer.test.js
```

The configurator retrieves Best fit, KNMI, ECMWF, ICON, and GFS in one
Open-Meteo request. Best fit is the default, while the Model control can
switch the 3D preview instantly between the already normalized forecasts.
Cached forecasts are separated by spot and model.

Weather is shown by default. Air temperature and tide are independent optional
rows; wind always remains visible and expands into the space left over. Tide is
retrieved separately from Open-Meteo Marine only when needed on the device, so
a marine-data failure cannot break the regular forecast. Tide timing is an
indicative model forecast and is not suitable for navigation.

The parity tests compare every one of the 384,000 device-palette bytes for all
eight row combinations and a missing-data state, including red threshold
pixels. Compiling to WebAssembly therefore cannot silently change what the
device would receive. A separate preview test verifies that the same
composition can be exported as opaque RGBA with continuous gray and red
accents. Forecast and optional marine requests go directly from the browser to
Open-Meteo; the renderer itself performs no networking or persistence.

The Berkeley Mono bitmap assets are derived from a separately licensed local
font. Check that licence before distributing firmware binaries.

## Firmware updates over Wi-Fi

USB-C is only required for the first installation or recovery. For normal local
development, build the application and upload it over the network:

```sh
cd firmware
./build.py --board seeedstudio_reterminal_e1002 --step firmware
./scripts/ota-upload.sh
```

The upload route is deliberately locked. It opens while USB is connected, for
ten minutes after pressing the WAKE button, or for ten minutes after waking the
device with that button. The device writes the upload to its inactive firmware
partition, validates it, switches boot partitions and only then restarts.

Tagged GitHub releases (`v*`) publish the same OTA binary automatically. A
WindScout can check and install those releases from its web interface. Keep
USB-C available as the recovery path if an experimental build cannot boot or
connect to Wi-Fi.
