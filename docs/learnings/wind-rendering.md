# Monochrome E-ink dashboard rendering

## Settled approach

- Compose the entire 800 x 480 dashboard in one grayscale buffer, then apply
  Floyd-Steinberg exactly once.
- Send only palette index `0` for black and `1` for white to the E1002 display.
- Keep borders, grid lines, bar edges and gust markers on integer coordinates so
  they remain solid instead of becoming dithered gray.
- Use a fixed 0-40 kt vertical scale. Values above the scale get an overflow
  indicator rather than silently changing the scale.
- Use length, position, numbers and arrow direction as the primary information
  channels. Color is not dependable enough on Spectra 6 for precise wind speed.
- Cache forecast state separately from the hash of the last confirmed panel.
  Commit valid forecast data before rendering, and confirm the panel hash only
  after a successful physical refresh.

## Product lesson

The earlier map and color-gradient experiments looked attractive before
dithering but lost too much precision and brightness on the physical panel. A
monochrome dashboard is easier to compare, more robust at a distance and much
less sensitive to E-ink color reproduction.
