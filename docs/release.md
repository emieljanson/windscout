# WindScout release checklist

WindScout ships from this monorepo. The production configurator, browser
installer, E1002 firmware and shared renderer must never be released from
`windscout-site` or assembled by hand from separate builds.

The browser installer currently supports the Seeed Studio reTerminal E1002
with one configured spot.

## What the release workflow guarantees

`.github/workflows/firmware-release.yml` is the single release pipeline:

1. It verifies the renderer, spot catalog, web unit tests and browser tests.
2. It runs the firmware host tests and installer-bundle tests.
3. It builds the E1002 firmware with ESP-IDF 6.0.2.
4. It creates both the downloadable GitHub Release files and the nested,
   same-origin firmware bundle used by the website from that one build.
5. It places the website bundle in `web/public/firmware`, builds the site and
   checks that every referenced firmware part exists and has the expected size.
6. It prepares a deployable site artifact from `main`. When the repository
   variable `WINDSCOUT_PAGES_ENABLED` is `true`, it also deploys that artifact.
   A `v*` tag publishes the firmware as a GitHub Release.

The browser uses `./firmware/` by default, so the same artifact works on the
custom domain and on the repository's temporary GitHub Pages URL. Do not point
`VITE_FIRMWARE_BASE_URL` directly at GitHub Releases: those downloads are not a
same-origin browser installer host.

## One-time GitHub setup

Before enabling the Pages deployment:

- In the `windscout` repository, open **Settings → Pages** and select
  **GitHub Actions** as the publishing source.
- Confirm the account plan permits Pages for this private repository, or make
  the repository public. A Pages website is public even when its source repo is
  private.
- Add the repository variable `WINDSCOUT_PAGES_ENABLED` with value `true` only
  after Pages accepts the repository. Until then, `main` still verifies and
  packages the complete site but deliberately skips publication.
- Keep the custom domain on `windscout-site` until the new Pages deployment has
  passed at its temporary URL.

## Moving the production domain

The DNS record already targets `emieljanson.github.io`, so no DNS redesign is
needed. During the release window:

1. Deploy and smoke-test the new site from `windscout`.
2. Remove `windscout.emieljanson.com` from the old `windscout-site` Pages
   settings.
3. Add `windscout.emieljanson.com` to the `windscout` Pages settings and enable
   HTTPS after GitHub validates the domain.
4. Test the configurator and a real USB install on the production HTTPS URL.
5. Archive `windscout-site` only after the production checks pass.

GitHub requires the custom domain to be configured in repository settings; a
checked-in `CNAME` file is not a replacement when Pages is deployed by Actions.

## Automated gates

- `npm test` in `web/`
- `npm run test:e2e` in `web/`
- `npm run renderer:check` in `web/`
- `npm run spots:catalog:check` in `web/`
- `npm run build` in `web/`; verify `esptool-js` remains in a lazy chunk
- `make -C firmware test`
- `python3 firmware/scripts/test_generate_installer_manifest.py`
- E1002 ESP-IDF 6.0.2 release build
- Immutable installer bundle generated from the same build as the OTA app
- Hash, 32 MB bound, write-range and protected-storage validation

## Physical acceptance matrix

Record date, release version, OS, browser, cable, board serial label, and result
for each run.

- Clean E1002 install on current Chrome/macOS
- Clean E1002 install on current Edge/Windows
- Configuration-only update with no firmware write
- Preserving firmware update with Wi-Fi and configuration retained
- Damaged application repair
- Cancelled device chooser
- Wrong Wi-Fi followed by retry
- Disconnect during configuration; previous setup still boots
- Disconnect during flash; bootloader repair succeeds
- Known E1001 and non-S3 device; no write occurs
- Unverified compatible S3 with confirmation declined; no write occurs

## Privacy inspection

Use a unique test password, then confirm it appears nowhere in browser storage,
URLs, analytics, network requests other than the active USB exchange, console
output, firmware logs, diagnostics, screenshots, toasts, or test artifacts.
Confirm the password input clears after submission and rejection.

The E1002 has one setup path: the website over USB. Do not publish the installer
as generally available until the physical matrix has passed on one real E1002.

## Release monitoring and rollback

For the first hour after a production release, one person owns the following
checks:

- The `WindScout release` workflow and Pages deployment remain green.
- The production URL, `firmware/latest.json`, its referenced manifest and every
  firmware part return HTTP 200 over HTTPS.
- A clean browser session can open the configurator and reach the USB device
  chooser without console or network errors.
- One real E1002 completes setup and subsequently wakes, fetches a forecast,
  renders the selected spot with the correct local time and returns to sleep.

If the website is broken, redeploy the last known-good commit before changing
the custom domain. If a firmware release is broken, stop the public installer,
restore the last known-good `latest.json` plus its immutable version directory,
and use the USB recovery flow on affected test devices. Keep `windscout-site`
available—but not active on the production domain—until these checks have
passed, so the domain move itself remains reversible.
