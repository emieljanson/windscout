# WindScout design assets

## E1002 product model

The configurator's local product model is derived from Seeed Studio's official shared E1001/E1002 STEP assembly:

- Source: <https://files.seeedstudio.com/wiki/reterminal_e10xx/res/reTerminal_E1001_E1002_3D.stp>
- Product documentation: <https://wiki.seeedstudio.com/getting_started_with_reterminal_e1002/>
- Documented enclosure: 176 × 120 × 17 mm; 53 mm deep with stand

Run `npm run model:prepare` from `web/` to download the source into a temporary directory and create the local `public/devices/e1002/e1002.glb` plus `provenance.json`. The converter removes selected internal assembly parts, preserves exterior roles, and adds a measured 800:480 screen plane.

The generated files are deliberately ignored by Git. Seeed's public download does not currently include explicit CAD redistribution terms. Keep the derived GLB local until written redistribution permission or an applicable licence is recorded here. The app must retain a model-failure fallback so that the source code remains useful without distributing that asset.
