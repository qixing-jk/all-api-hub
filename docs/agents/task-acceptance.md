# Automated task acceptance

Use this workflow before handing off implemented changes. The agent owns execution and evidence collection within the task's existing authorization. Reuse the project's Vitest, Playwright and live-extension runners; keep checks proportional to the affected behavior. Documentation-only and instruction-only changes need a diff, reference and consistency review rather than application tests or screenshots.

## Account for the behavior changes

Build a task-local acceptance table from the requested outcomes and the final task-owned diff. Include intentional behavior changes discovered during implementation, including defaults, compatibility and recovery behavior. For behavior-preserving refactors, identify the observable contracts being preserved. Reconcile the table after the last implementation change so that every outcome has a result or an explicit gap.

| Outcome / scenario | Before | Expected after | Automated assertion / command | Result and evidence |
| --- | --- | --- | --- | --- |
| Concrete user action and preconditions | Previous observable result | Intended observable result | Test name or reproducible runner command | Passed, failed, blocked, not run, or not applicable; artifact link and reason for any gap |

Select applicable success, empty, failure, partial-success and retry/cancel scenarios from the changed flow. Test shared behavior at its public boundary and use representative callers for integration risk. Follow the existing TDD requirement for features and bug fixes. Screenshots alone do not verify persistence, request semantics, authentication, or resource cleanup; assert those outcomes through the appropriate public interface and readback.

Run the selected checks automatically when prerequisites are available. If a promised path lacks reusable automation, extend the closest maintained test or runner within the authorized scope. Record any path that could not run and its missing prerequisite, then continue independent checks. A command listed in a report without being executed is not passing evidence.

## Compare changed UI

For visually affected flows, capture the same meaningful checkpoints before and after the change. Use the known pre-change revision or an existing reviewed baseline, with matching fixtures, browser/platform, viewport, device scale, language, theme and interaction state. Record both revision/build identities and any relevant uncommitted changes. Use a separate worktree/build when necessary to retain a reproducible before state without disturbing unrelated work.

Wait for the intended UI state, data and fonts to settle; disable animations for capture. Cover the changed layout and its relevant responsive, theme or recovery variants rather than taking arbitrary landing-page images. Prefer focused panels when they retain enough layout context. Keep synthetic or mocked screenshots clearly labelled.

Reuse existing visual assertions where available. For repeatable visual regression checks, use Playwright screenshot assertions and retain expected, actual and diff images for mismatches. Distinguish an intentional visual change from an unexpected regression by inspecting the images; do not update baselines, widen tolerances or mask changed content merely to make the check pass. Explain any normalization of volatile content.

For a first-time comparison, establish the before image from the pre-change build before running against the changed build. When comparable images exist, retain a side-by-side preview and a generated difference image using available comparison tooling. Inspect the actual images with the client's image viewer, describe the meaningful differences and show representative previews in the handoff. Label a manual visual review as manual; saving two screenshots does not establish an automated comparison.

If a baseline or compatible comparison environment is unavailable, retain the current screenshot and report the precise limitation. A newly captured baseline establishes future coverage; it does not prove this change passed a before/after comparison. An intended screenshot mismatch can coexist with passing behavior assertions; resolve and report both separately.

## Keep evidence reproducible

Keep the task-local report and review-only images outside Git, using an existing ignored output directory or a verified task-local exclusion. Retain separate run directories so later runs do not overwrite before images or useful failures. Only deliberately maintained fixtures and visual-test baselines belong in version control.

Record the tested revision/build, target, environment prerequisites by name, commands, actual results and artifact paths. Link each table row to the relevant assertion and evidence. Preserve failure artifacts even if a retry passes, and report the retry rather than treating it as proof that a flaky failure was fixed. Evidence from an older tree can be reused only when the affected behavior and relevant build inputs remain unchanged.

For live extension work, follow the project's `live-extension-ui-automation` skill. Site integration evidence and previews follow [evidence storage](../../.agents/skills/add-site-integration/references/evidence-and-validation.md) and [visual previews](../../.agents/skills/add-site-integration/references/visual-previews.md). Preserve existing authenticated automatic-capture policies. Local raw evidence stays local; prepare and inspect a separate shareable copy before any authorized publication.

## Handoff

Provide the complete behavior-change table inline for a small change, or link the task-local report and summarize it for a larger change. Include the executed checks and their results, representative visual previews and before/after/diff links when applicable, and the commands needed to reproduce them. Make unverified paths, missing baselines and environmental blockers visible. Keep local validation and requested remote PR reconciliation separate; pending required evidence leaves acceptance incomplete.
