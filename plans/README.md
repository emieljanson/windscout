# Animation improvement plans

All plans were audited against commit `85c6128`. They are specifications only; source code has not been changed by the audit.

| Plan | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Add one motion vocabulary | MEDIUM | TODO |
| 002 | Make dropdown motion respect input and origin | HIGH | TODO |
| 003 | Preserve useful feedback in reduced-motion mode | MEDIUM | TODO |
| 004 | Remove camera inertia for reduced motion | MEDIUM | TODO |
| 005 | Give the spot dialog a coordinated entry and exit | MEDIUM | TODO |
| 006 | Keep the segmented switch on the compositor | LOW | TODO |
| 007 | Gate hover feedback to real hover pointers | LOW | TODO |
| 008 | Connect Minimum wind to its toggle | LOW | TODO |

## Recommended execution order

1. `001-add-motion-tokens.md`
2. `002-fix-dropdown-motion.md`
3. `006-stop-animating-switch-shadow.md`
4. `005-polish-dialog-entry-and-exit.md`
5. `003-preserve-reduced-motion-feedback.md`
6. `004-respect-reduced-motion-in-orbit-controls.md`
7. `007-gate-hover-feedback.md`
8. `008-animate-minimum-wind-entry.md`

## Dependencies

- Plan 001 is the shared foundation for plans 002, 003, 005, 006, and 008.
- Plan 003 should be reconciled after 002 and 005 so its reduced-motion rules cover their final selectors.
- Plan 008 depends on the tokens from 001 and the reduced-motion policy from 003.
- Plan 004 is independent JavaScript work.
- Plan 007 is independent CSS work and can be executed at any point after 001.

Execute one plan at a time. After each implementation, run the plan's mechanical checks and its human feel check before marking it DONE.
