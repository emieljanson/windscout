# WindScout

WindScout turns a Seeed Studio reTerminal E1002 into a quiet, battery-efficient
wind forecast dashboard. The device downloads forecast data itself and renders
the complete monochrome interface locally; no map service or rendering backend
is required.

The active implementation and setup instructions live in
[`firmware/`](firmware/README.md). Product decisions and acceptance criteria are
captured in [`docs/plans/2026-08-24-1109-feat-local-wind-dashboard-plan.md`](docs/plans/2026-08-24-1109-feat-local-wind-dashboard-plan.md).

## Repository layout

- `firmware/main/`: forecast, cache, schedule, renderer and device integration.
- `firmware/host_tests/`: deterministic host tests and 800 x 480 golden frames.
- `docs/`: font provenance, implementation plan and durable rendering lessons.

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
