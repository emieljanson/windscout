# 001 — Add one motion vocabulary

- **Status**: TODO
- **Commit**: 85c6128
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 3 files, small mechanical change

## Problem

Motion values are written independently, so related controls do not share an explicit rhythm:

```css
/* web/src/styles/settings-controls.css:71 — current */
transition-duration: 120ms;
transition-timing-function: ease-out;

/* web/src/styles/spot-dialog.css:237 — current */
.spot-dialog__overlay[data-state='open'] { animation: spot-overlay-in 140ms ease-out; }
.spot-dialog[data-state='open'] { animation: spot-dialog-in 160ms ease-out; }
```

The built-in `ease-out` curve is too weak for deliberate UI movement.

## Target

Add these global tokens to `web/src/styles/base.css`:

```css
--motion-fast: 120ms;
--motion-popover: 150ms;
--motion-modal-enter: 200ms;
--motion-modal-exit: 140ms;
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

Replace hand-written deliberate-motion durations and `ease-out` values in `settings-controls.css` and `spot-dialog.css`. Keep ordinary hover color changes on CSS `ease`; the strong curve is for transform/opacity movement.

## Repo conventions to follow

Global visual tokens already live in the `:root` block at `web/src/styles/base.css:1`. Component-specific sizing and color tokens remain in `web/src/styles/settings-controls.css:1`.

## Steps

1. Add the five target tokens to `web/src/styles/base.css:8`, after the existing color tokens.
2. In `web/src/styles/settings-controls.css`, replace deliberate `120ms ease-out` transform/opacity timing with `var(--motion-fast) var(--ease-out)`. Use `var(--motion-popover)` for popup entry work introduced by plan 002.
3. In `web/src/styles/spot-dialog.css`, use `var(--motion-fast)` for button press feedback and the modal tokens for dialog keyframes introduced by plan 005.
4. Do not add a dependency or JavaScript constants for CSS motion.

## Boundaries

- Do NOT change animation behavior or add new animations in this plan.
- Do NOT change colors, spacing, shadows, or typography.
- Do NOT add tokens that remain unused after plans 002–008 are complete.
- If the cited code has drifted since commit `85c6128`, STOP and report it.

## Verification

- **Mechanical**: from `web/`, run `npm test` and `npm run build`; both must pass.
- **Feel check**: no interaction should visibly change from this plan alone.
- **Done when**: all deliberate motion uses the shared tokens and `rg -n "[0-9]+ms ease-out" web/src/styles` only returns intentional exceptions.

