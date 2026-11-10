# PR #1855 feedback repair

Status: in-progress

Target: `chore/dependency-ui-refresh`, initially `e9b4c1886409262193f7ea05e50ce8efbdcd38e9`, base `1c17f28f9cc19292ef1cba1a86f0e0e8d13db542` (2026-11-10).

## Worklist

| Source | Finding | Outcome / evidence |
| --- | --- | --- |
| CI jobs 129695051492 and 129695051603 | Migration preview row remains closed after clicking | Pointer diagnostics reproduce warning popup intercepting the initial click. Use fixed positioning for the row warning tooltip; the direct badge-click regression exercises this timing. Original CI traces and screenshots retained in `artifacts/shard3/`. |
| CodeRabbit PRRT_kwDOPsDiRM61mcXh | Two Tailwind configuration references point at a removed file | Both links now target the recorded audit baseline; `git cat-file -e` verifies the historical path. Review-body item duplicates this same requirement. Remote acceptance pending. |
| Codecov FormField.tsx:69,85,87,102,140 | Success descriptions, orientation, explicit composite labeling, error/success precedence | Tests added; all reported branch arms hit in focused coverage. |
| Codecov Alert.tsx:92,96,117 | Iconless action layout and interaction | Test added; all reported branch arms hit. |
| Codecov tabs.tsx:20,46,69 | Vertical and styled tab variants | Keyboard navigation tested for default, line and unstyled variants; all reported branch arms hit. |
| Codecov badge.tsx:59 | Default badge variant fallback | Static badge and composed link tested; reported branch arms hit. |
| Codecov dialog.tsx:151 | Default translated footer close label | Dismissal through fallback label tested; reported branch arms hit. |

## Validation and retained evidence

- Focused component/migration suite: 24 tests passed. Focused coverage: 18 tests passed; every original provider-reported partial branch has nonzero hits. Its global line/function thresholds fail because only selected tests ran; this is diagnostic evidence, not the remote coverage result.
- `artifacts/e2e-red-tooltip.log`: direct warning click fails repeatedly before the positioning repair. `artifacts/pointer-diagnostic.log`: pointer events hit popup list items rather than the badge.
- `artifacts/e2e-green.log`: the same direct click passes three times after the repair.
- `artifacts/e2e-final.log`: repeat validation of AxonHub and grouped/split multi-key migration. One earlier attempt was rejected by the stale-build guard after formatting; the final run rebuilds first.
- `artifacts/intake.json`, `artifacts/review-complete.json`, and `artifacts/coverage-intake.json`: remote source-head evidence. Keep local through final review; artifacts are ignored and no unrelated scratch material was removed.
- Final pushed-head CI, coverage, review acceptance and mergeability remain pending.
