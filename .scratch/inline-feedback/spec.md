# Contextual feedback presentation

Status: ready-for-human

User-approved scope: audit shared feedback primitives and their consumers; replace unnecessarily prominent contextual messages with an icon and ordinary muted text. Work belongs to temp2. Preserve execution, storage, permissions, telemetry, translations, and recovery contracts.

Investigated baseline: `934032b862`, 2026-11-16. The branch is ahead of origin/main and has no missing base commits. The initial tracked worktree and index were clean.

## Presentation decision

- `InlineMessage`: short guidance, local status or outcome; tone appears in the icon, body uses ordinary muted text; use `NoticeActionButton` for an inline action.
- Keep `Alert` and `Notice` for substantive warnings, setup/recovery instructions, grouped details or multiple actions. A warning tone alone does not determine the container.
- Keep `FormField` descriptions/errors and their field associations, badges/loading indicators, and floating `ContentNotice` semantics.
- A separate small primitive fits the short-message contract. Adding another Notice mode would expose titles, action groups, container layout and icon-backplate controls to callers that need none of them. Do not build a generalized messaging framework.
- Preserve existing copy and callbacks. Do not infer the user's actual #1880 failure from unavailable collection diagnostics.

## Audit and validation

The complete AST census and per-location disposition ledger are retained locally at `diagnostics-results/inline-feedback-audit/`. The census includes 127 Alert usages, 25 Notice usages, 8 ContentNotice usages and 107 explicit status/alert elements; it is a census of these patterns, not all possible explanatory text.

Public test boundaries: shared component rendering/keyboard accessibility; existing feature component tests; maintained Playwright UI-primitive fixture and feedback extension workflows. Fixture images establish presentation/layout, while extension workflows establish collection/retry/sharing behavior.

Acceptance results and reproducible commands: `diagnostics-results/inline-feedback-audit/README.md`. Local implementation and validation are complete: 38 original presentation locations adjusted; substantive warnings and field/floating feedback retained. Retain all baseline, failed and final evidence for developer review. No cleanup or external publication is authorized.

The six Scout dimensions were checked within this surface: runtime tone ownership, duplicated icon/text layout, component boundaries, prop/ARIA contracts, removed stale imports/comments, and reuse of native inline actions. Other business constants and feature logic are outside this presentation pass.
