# 002 — Make dropdown motion respect input and origin

- **Status**: TODO
- **Commit**: 85c6128
- **Severity**: HIGH
- **Category**: Purpose, frequency & physicality
- **Estimated scope**: 2 files, medium change

## Problem

Every settings popup receives the same pure fade:

```css
/* web/src/styles/settings-controls.css:374 — current */
@media (prefers-reduced-motion: no-preference) {
  .setting-popup[data-state='open'] {
    animation: settings-popup-in 120ms ease-out;
  }

  @keyframes settings-popup-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
}
```

This also runs when opened from the keyboard. It also treats two distinct components as identical: `SettingSelect` is item-aligned over its trigger, while `SettingCombobox` is a trigger-anchored popper. The combobox exposes `--reka-combobox-content-transform-origin` but does not use it.

## Target

- `SettingSelect`: open instantly for both pointer and keyboard, preserving exact selected-item alignment.
- `SettingCombobox`: keyboard/focus opening remains instant.
- `SettingCombobox`: pointer opening may use `opacity: 0` plus `transform: scale(0.97)` for `150ms` with `cubic-bezier(0.23, 1, 0.32, 1)`.
- The combobox scales from `var(--reka-combobox-content-transform-origin)`.

```css
.setting-combobox__content {
  transform-origin: var(--reka-combobox-content-transform-origin);
}

@media (prefers-reduced-motion: no-preference) {
  .setting-combobox__content.is-pointer-open[data-state='open'] {
    animation: settings-combobox-in var(--motion-popover) var(--ease-out);
  }

  @keyframes settings-combobox-in {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }
}
```

## Repo conventions to follow

`web/src/components/settings/SettingCombobox.vue:51` already tracks pointer versus keyboard focus using `pointerFocus`. Extend that local input-modality state; do not create a global modality service.

## Steps

1. In `SettingCombobox.vue`, add `const animatePopup = ref(false)` beside `pointerFocus`.
2. Add functions `notePointerOpen()` and `noteKeyboardOpen()` which set `pointerFocus` and `animatePopup` together. Pointer sets both true; keyboard sets both false.
3. Replace the input's inline `@pointerdown` and `@keydown` assignments with those functions. Programmatic focus must leave `animatePopup` false.
4. Add `'is-pointer-open': animatePopup` to the `ComboboxContent` class binding at line 175.
5. Reset `animatePopup` to false after closing so a later programmatic open cannot inherit stale pointer state.
6. In `settings-controls.css`, delete the shared `.setting-popup[data-state='open']` fade and its keyframes.
7. Add the target combobox origin and pointer-only animation. Do not animate `.setting-select__content`.
8. Extend `web/tests/settings-controls.test.js` to assert that pointerdown produces `is-pointer-open`, keydown removes it, and a select never receives the class.

## Boundaries

- Do NOT change popup dimensions, positioning, collision behavior, shadows, or option layout.
- Do NOT animate keyboard-initiated opening.
- Do NOT animate the item-aligned select.
- Do NOT add a motion library.
- Requires plan 001.
- If the cited code has drifted since commit `85c6128`, STOP and report it.

## Verification

- **Mechanical**: from `web/`, run `npm test -- settings-controls.test.js`, `npm test`, and `npm run build`.
- **Feel check**: open Model with mouse and keyboard; both should appear instantly with the selected row optically fixed. Open Spot search with mouse; it should grow subtly from the search field. Open it with Tab/Enter; it should be instant. At 10% DevTools playback, confirm scale origin is adjacent to the trigger, never the viewport center.
- Toggle reduced motion and confirm the combobox has no scale movement.
- **Done when**: keyboard dropdowns never animate, selects remain perfectly aligned, and pointer-opened comboboxes use only transform and opacity.

