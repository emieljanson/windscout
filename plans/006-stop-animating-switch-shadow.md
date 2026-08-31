# 006 — Keep the segmented switch on the compositor

- **Status**: TODO
- **Commit**: 85c6128
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 2 files, tiny change

## Problem

The moving thumb includes `box-shadow` in its transition list:

```css
/* web/src/styles/settings-controls.css:289 — current */
.setting-switch__thumb {
  transform: translateX(calc(100% + 0.1875rem));
  transition-property: transform, box-shadow;
  transition-duration: 120ms;
  transition-timing-function: ease-out;
}
```

The shadow does not need interpolation during normal toggles and can cause paint work.

## Target

```css
.setting-switch__thumb {
  transition: transform var(--motion-fast) var(--ease-out);
}
```

Disabled-state shadows still change, but immediately.

## Repo conventions to follow

The thumb already moves using a full CSS `transform`, which is the correct compositor-friendly mechanism. Preserve it exactly.

## Steps

1. Replace the three transition declarations on `.setting-switch__thumb` with the target shorthand.
2. Leave all shadow values and checked/unchecked transforms unchanged.
3. Add a computed-style assertion in `web/tests/settings-controls.test.js` if CSS is available in that harness; otherwise cover it with an e2e computed-style assertion.

## Boundaries

- Do NOT remove the visual shadow.
- Do NOT change thumb geometry or translation distance.
- Do NOT replace `transform` with left/right positioning.
- Requires plan 001.
- If the cited code has drifted since commit `85c6128`, STOP and report it.

## Verification

- **Mechanical**: run `npm test -- settings-controls.test.js`, `npm test`, and `npm run build`.
- **Feel check**: spam the toggle rapidly. The thumb must retarget smoothly from its current position, never restart, and its shadow must remain visually stable.
- **Done when**: the thumb transition property is exactly `transform` and behavior is unchanged.

