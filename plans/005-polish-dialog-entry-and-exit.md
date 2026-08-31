# 005 — Give the spot dialog a coordinated entry and exit

- **Status**: TODO
- **Commit**: 85c6128
- **Severity**: MEDIUM
- **Category**: Easing, duration & cohesion
- **Estimated scope**: 2 files, medium CSS/test change

## Problem

The spot dialog enters abruptly with a weak curve and has no matching close animation:

```css
/* web/src/styles/spot-dialog.css:236 — current */
.spot-dialog__overlay[data-state='open'] { animation: spot-overlay-in 140ms ease-out; }
.spot-dialog[data-state='open'] { animation: spot-dialog-in 160ms ease-out; }
@keyframes spot-overlay-in { from { opacity: 0; } }
@keyframes spot-dialog-in {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 6px)); }
}
```

Roughly 160ms is short for an occasional modal, while instant removal makes open and close feel unrelated.

## Target

- Desktop enter: 200ms, opacity 0 and translateY(6px) to rest.
- Desktop exit: 140ms, rest to opacity 0 and translateY(4px).
- Overlay enter and exit: 140ms opacity only.
- Mobile uses the same timings with its existing `translateX(-50%)` positioning.
- Use `var(--ease-out)` for all four animations.
- Motion remains inside `prefers-reduced-motion: no-preference`.

## Repo conventions to follow

Reka UI supplies `data-state='open'` and `data-state='closed'`. Its presence layer keeps content mounted while a closed-state CSS animation is detected; use those attributes rather than Vue timers.

## Steps

1. Replace the current open-only block in `spot-dialog.css` with open and closed animation declarations for overlay and content.
2. Add `spot-overlay-out` and `spot-dialog-out` keyframes with the exact target values.
3. Add mobile enter and mobile exit keyframes; always preserve the base `translateX(-50%)` transform.
4. Use `var(--motion-modal-enter)` for content entry and `var(--motion-modal-exit)` for all exits and overlay transitions.
5. Extend `web/tests/spot-creation-dialog.test.js` or the e2e spec to verify open/closed states remain operable and focus restoration still occurs after close.

## Boundaries

- Do NOT scale the modal; centered dialogs are exempt from trigger-origin scaling.
- Do NOT animate width, height, padding, top, or left.
- Do NOT delay focus or interaction until the entry completes.
- Do NOT change map lifecycle, dialog dimensions, or visual styling.
- Requires plans 001 and 003.
- If Reka does not retain the closed node after detecting the CSS animation, STOP and report instead of adding arbitrary JavaScript timeouts.

## Verification

- **Mechanical**: run `npm test -- spot-creation-dialog.test.js`, `npm test`, `npm run build`, and the spot-dialog e2e path.
- **Feel check**: at normal speed the dialog should feel immediate but land softly. Close must be quicker than open. At 10% DevTools playback, content and overlay should begin together, transforms must preserve centering, and no frame may jump. Reduced motion must remove translation while retaining clear state change.
- **Done when**: entry is 200ms, exit is 140ms, focus behavior is intact, and only transform/opacity animate.

