# WindScout USB serial protocol v1

The installer owns the E1002 USB Serial/JTAG channel. Firmware logs use UART and must never be mixed with protocol frames.

## Frame

Every frame starts with the eight-byte magic `WINDSC01`, followed by little-endian fields: protocol version (`u16`), message type (`u16`), request ID (`u32`), payload length (`u32`), payload CRC32 (`u32`), then a UTF-8 JSON object. Payloads are limited to 4096 bytes. Unknown versions, types, oversized payloads, timeouts, malformed JSON, or bad checksums return a typed error when a request ID can be trusted and otherwise reset the parser silently.

## Commands

| Family | Request | Result |
| --- | --- | --- |
| Identity | `hello` | Board ID, firmware version, protocol/config ranges, capabilities |
| State | `get_state` | Configuration digest, Wi-Fi health, last render status; never credentials |
| Wi-Fi | `scan_networks` | Deduplicated SSIDs with signal/security metadata |
| Wi-Fi | `test_wifi` | Write-only `ssid` and `password`; returns status only |
| Configuration | `stage_configuration` | Validates one configuration candidate and returns its digest |
| Configuration | `promote_configuration` | Promotes the staged generation after a valid render |
| Verification | `get_status` | Wi-Fi, accepted digest, forecast and render status |
| Lifecycle | `reboot` | Acknowledges before restarting |

Each request receives one result or typed error with the same request ID. The browser times out an idle request after 15 seconds, network testing after 45 seconds, and forecast/render verification after 90 seconds. A reconnect starts a new session and request-ID space.

## Redaction and compatibility

`password` is write-only. It is forbidden in hello/state/status results, diagnostics, logs, errors, screenshots, and toasts. Implementations must reject unknown fields on credential-bearing requests. Capability negotiation, not firmware-version guessing, decides which optional commands are available. Protocol v1 supports configuration schema v2 and board ID `seeedstudio_reterminal_e1002` only.
