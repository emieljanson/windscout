# Deterministic E-ink dashboard rendering

## Settled approach

- Compose the entire 800 x 480 dashboard in one grayscale buffer, then apply
  Floyd-Steinberg exactly once.
- Dither the grayscale composition to palette index `0` for black and `1` for
  white, then apply deliberate palette index `3` overlays for threshold and
  low-battery warnings.
- Keep borders, grid lines, bar edges and gust markers on integer coordinates so
  they remain solid instead of becoming dithered gray.
- Use a fixed 0-40 kt vertical scale. Values above the scale get an overflow
  indicator rather than silently changing the scale.
- Use length, position, numbers and arrow direction as the primary information
  channels. Color is not dependable enough on Spectra 6 for precise wind speed.
- Cache forecast state separately from the hash of the last confirmed panel.
  Commit valid forecast data before rendering, and confirm the panel hash only
  after a successful physical refresh.
- Keep one C renderer as the layout authority. ESP32 calls it directly and the
  configurator runs the same sources through a thin, versioned WebAssembly
  bridge whose setters hide compiler-specific struct layout.
- Treat palette output and browser preview as two final passes over that one
  composition, never as two drawing implementations. The device gets its exact
  palette plus e-ink dithering; the browser gets pre-dither RGBA with continuous
  gray, shared red overlays and no JavaScript redraw of dashboard elements.
- Prove cross-runtime parity with full 800 x 480 palette buffers. PBM previews
  remain useful for human inspection, but they discard red and cannot prove
  exact Spectra output.
- Keep provider fetching and normalization outside the renderer. Both paths
  normalize to five days with local samples at 08, 11, 14, 17 and 20 hours;
  the renderer stays deterministic and side-effect free.

## Product lesson

The earlier map and color-gradient experiments looked attractive before
dithering but lost too much precision and brightness on the physical panel. A
monochrome dashboard is easier to compare, more robust at a distance and much
less sensitive to E-ink color reproduction.
