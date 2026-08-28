# WindScout USB serial protocol v1

The E1002 USB-C connector exposes its UART bridge. Installer responses are serialized with firmware console output so log bytes can appear between frames, but never inside a CRC-protected frame. Browser parsers ignore console bytes while searching for the next frame magic.

## Frame

Every frame starts with the eight-byte magic `WINDSC01`, followed by little-endian fields: protocol version (`u16`), message type (`u16`), request ID (`u32`), payload length (`u32`), payload CRC32 (`u32`), then a UTF-8 JSON object. Payloads are limited to 4096 bytes. Unknown versions, types, oversized payloads, timeouts, malformed JSON, or bad checksums return a typed error when a request ID can be trusted and otherwise reset the parser silently.

## Commands

| Family | Request | Result |
| --- | --- | --- |
| Identity | `hello` | Board ID, firmware and flash-layout versions, protocol/config ranges, capabilities |
| State | `get_state` | Configuration digest, Wi-Fi health, last render status, and asynchronous apply status; never credentials |
| Session | `begin` with browser `unixTime` | Sets the system clock and battery-backed RTC before configuration or network work |
| Wi-Fi | `scan_networks` | Deduplicated SSIDs with signal/security metadata |
| Wi-Fi | `test_wifi` | Write-only `ssid` and `password`; returns status only |
| Configuration | `stage_configuration` | Validates one configuration candidate and returns its digest |
| Configuration | `apply_configuration` | Starts the candidate render and returns `applying` without blocking the serial service |
| Verification | `get_state` | Poll until apply is complete and Wi-Fi, accepted digest, and render status all verify |

Each request receives one result or typed error with the same request ID. The browser times out an idle request after 15 seconds and network testing after 45 seconds. Forecast/render work runs asynchronously; the browser polls state once per second for at most three minutes. A reconnect starts a new session and request-ID space.

`unixTime` is a required integer Unix timestamp in seconds, captured from the owner's browser immediately before `begin`. Firmware with the required `clock-sync` capability accepts dates from 2025 through 2099 and returns `clock_rejected` without starting the session when it cannot persist that time. The absolute clock comes from the browser; local display and wake times come from the installed spot's IANA timezone.

## Redaction and compatibility

`password` is write-only. It is forbidden in hello/state/status results, diagnostics, logs, errors, screenshots, and toasts. Implementations must reject unknown fields on credential-bearing requests. Capability negotiation, not firmware-version guessing, decides which optional commands are available. The flash-layout version decides whether an update may preserve partitions or requires a clean reinstall; firmware predating this field is layout 1. Protocol v1 supports configuration schema v2 and board ID `seeedstudio_reterminal_e1002` only.
