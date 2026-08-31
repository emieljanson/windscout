# 007 — Gate hover feedback to real hover pointers

- **Status**: TODO
- **Commit**: 85c6128
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 3 files, small CSS change

## Problem

Hover states apply on every pointer type:

```css
/* web/src/styles/settings-controls.css:76,282,348 — current */
.setting-control:hover:not(:disabled) { ... }
.setting-switch:not(:disabled):not([aria-disabled='true']) .setting-switch__segment:hover { ... }
.setting-switch-shell:hover .setting-switch-tooltip { ... }

/* web/src/styles/spot-dialog.css:73,140,206 — current */
.spot-dialog__close:hover { ... }
.spot-dialog__result:hover { ... }
.spot-dialog__confirm:hover:not(:disabled) { ... }
```

Touch browsers can leave false hover states after a tap.

## Target

Wrap hover-only selectors in:

```css
@media (hover: hover) and (pointer: fine) {
  /* existing hover selectors */
}
```

Keyboard focus, active states, `is-active`, `aria-selected`, and tooltip `:focus-within` must remain outside the hover query.

## Repo conventions to follow

Keep each rule in its current stylesheet. Split combined selectors where one branch is hover and another is focus or selected state.

## Steps

1. In `settings-controls.css`, move setting-control hover, segmented-label hover, and tooltip hover into one fine-pointer media query. Leave `.setting-switch-shell:focus-within .setting-switch-tooltip` as an unconditional rule.
2. In `spot-dialog.css`, gate close-button, result, and confirm hover selectors. Keep `.spot-dialog__result.is-active` and `[aria-selected='true']` unconditional.
3. In `configurator.css`, gate `.install-button:hover` without changing its color.
4. Add an e2e test using Playwright media emulation or CSS inspection to confirm touch does not receive hover-only rules while keyboard focus remains visible.

## Boundaries

- Do NOT remove hover feedback on mouse/trackpad.
- Do NOT gate focus-visible, active, selected, or disabled states.
- Do NOT change colors or durations.
- If the cited code has drifted since commit `85c6128`, STOP and report it.

## Verification

- **Mechanical**: run `npm test`, `npm run build`, and `npx playwright test tests/e2e/configurator.spec.js`.
- **Feel check**: on mouse/trackpad, all existing hovers remain. In touch emulation, tap controls and confirm no hover color or tooltip sticks around. Tab through controls and confirm keyboard feedback remains complete.
- **Done when**: hover feedback only runs for fine hover pointers and all non-hover states behave exactly as before.

