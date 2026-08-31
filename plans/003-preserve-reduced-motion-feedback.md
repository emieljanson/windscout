# 003 — Preserve useful feedback in reduced-motion mode

- **Status**: TODO
- **Commit**: 85c6128
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 3 files, medium CSS change

## Problem

The current global override erases virtually every transition:

```css
/* web/src/styles/base.css:39 — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

This removes helpful color and opacity feedback as well as physical movement. Reduced motion should remove position/scale changes while preserving quiet state feedback.

## Target

Delete the universal transition/animation duration override. Keep scroll behavior immediate. Existing entry animations in `settings-controls.css` and `spot-dialog.css` already use `prefers-reduced-motion: no-preference` and therefore do not run in reduce mode.

Add targeted rules:

```css
@media (prefers-reduced-motion: reduce) {
  html:focus-within { scroll-behavior: auto; }
}
```

In component CSS, disable only transform/scale movement while retaining color and opacity feedback at `var(--motion-fast)`.

## Repo conventions to follow

Accessibility media queries live at the bottom of the relevant stylesheet. `spot-dialog.css:236` already gates positional modal motion behind `no-preference`.

## Steps

1. Replace the universal rule in `base.css` with the targeted scroll-behavior rule shown above.
2. In `settings-controls.css`, add a reduce query that removes tooltip translation (`transform: none`) and limits its transition to opacity. Make the switch thumb snap to its new position by setting `transition-duration: 0.01ms`; preserve segment color feedback.
3. In `spot-dialog.css`, set `.spot-dialog__close` and `.spot-dialog__confirm` to `scale: 1` in reduce mode and transition only color, background-color, and opacity.
4. Ensure plans 002, 005, and 008 keep movement inside `prefers-reduced-motion: no-preference`.
5. Add an e2e assertion or computed-style check covering the reduced-motion switch thumb and dialog press state.

## Boundaries

- Do NOT remove focus feedback.
- Do NOT disable opacity or color state changes.
- Do NOT add JavaScript media-query handling for CSS-only components.
- Requires plan 001; coordinate with plans 002, 005, and 008.
- If the cited code has drifted since commit `85c6128`, STOP and report it.

## Verification

- **Mechanical**: run `npm test`, `npm run build`, then `npx playwright test tests/e2e/configurator.spec.js` from `web/`.
- **Feel check**: emulate reduced motion in DevTools. Dropdown, modal, tooltip, button press, switch thumb, and Minimum wind must not translate or scale. Hover/focus color and disabled opacity must still communicate state.
- **Done when**: reduced-motion mode removes spatial movement without making the interface feel unresponsive.

