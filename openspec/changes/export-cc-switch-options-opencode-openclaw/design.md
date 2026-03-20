## Context

The current CC Switch export flow is already centralized and reused across multiple surfaces:

- `src/services/integrations/ccSwitch.ts`: reuse and extend as the single source of truth for supported CC Switch app ids, deeplink validation, and URL generation.
- `src/components/CCSwitchExportDialog.tsx`: reuse and extend for the app selector, default endpoint behavior, and shared submit flow.
- `src/features/KeyManagement/components/TokenList.tsx`, `src/features/ApiCredentialProfiles/components/ApiCredentialProfilesDialogs.tsx`, and `src/features/AccountManagement/components/CopyKeyDialog/index.tsx`: reuse unchanged because they already mount the shared dialog.
- `src/features/ApiCredentialProfiles/utils/exportShims.ts`: reuse unchanged because it already adapts profile data into the `(account, token)` shape required by the shared dialog.
- `tests/utils/ccSwitch.test.ts` and `tests/components/CCSwitchExportDialog.test.tsx`: extend existing focused coverage instead of introducing a new test harness.

The gap is narrow but cross-cutting: `CCSWITCH_APPS` currently hard-codes only `claude`, `codex`, and `gemini`, and the dialog label switch only renders those values. Issue #632 asks for `opencode` and `openclaw`, and upstream CC Switch now advertises and handles those app identifiers in its deeplink import path.

## Goals / Non-Goals

**Goals:**

- Add `opencode` and `openclaw` to the shared CC Switch export app list.
- Keep all existing CC Switch export entry points aligned by extending shared abstractions rather than branching per surface.
- Preserve deeplink payload structure and secret-handling guarantees while making the new targets selectable.
- Define predictable default endpoint behavior for the new app ids so users can export with minimal manual editing.

**Non-Goals:**

- Creating a separate export dialog for specific entry points or app families.
- Changing the broader quick-export menu structure or adding new export targets beyond CC Switch.
- Reworking model fetching, token resolution, or unrelated CC Switch payload fields.
- Introducing remote protocol negotiation with CC Switch; this change assumes the current upstream app ids remain valid.

## Decisions

### Decision: Extend the shared `CCSWITCH_APPS` union instead of adding per-surface option lists

`src/services/integrations/ccSwitch.ts` already gates valid app identifiers via `CCSWITCH_APPS` and `CCSwitchApp`, while `CCSwitchExportDialog` renders the selector from that list. Extending this shared union keeps runtime validation, TypeScript exhaustiveness, and UI options synchronized.

Alternative considered:

- Keep local option arrays in the dialog and widen validation separately. Rejected because it duplicates the protocol contract and makes future app additions error-prone.

### Decision: Keep using the existing shared export dialog for Key Management, Account Management, and API credential profiles

All current CC Switch entry points eventually render `CCSwitchExportDialog`, and profile exports already adapt into the dialog's existing `(account, token)` contract through `exportShims.ts`. Reusing that dialog ensures the new options appear consistently everywhere with one implementation change.

Alternative considered:

- Fork dialog variants for token exports versus profile exports. Rejected because the data shape is already normalized and a split would create unnecessary drift in app labels, endpoint logic, and validation.

### Decision: Treat endpoint defaults as app-aware, with `codex` retaining `/v1` coercion and `opencode`/`openclaw` defaulting to the stored base URL

The current dialog already special-cases `codex` by coercing the base URL to `/v1`. Upstream CC Switch's additive-mode provider handling for `opencode` and `openclaw` accepts a direct `baseUrl`/endpoint mapping rather than requiring a Codex-style TOML provider block, so the safest default is to preserve the stored account base URL for those new targets and continue allowing manual override.

Alternative considered:

- Force `/v1` for every OpenAI-compatible-looking target. Rejected because that can over-normalize deployments that intentionally expose a different path and would diverge from the upstream `opencode` / `openclaw` import handling.

### Decision: Expand the existing focused tests and locale keys instead of relying on manual verification

The repo already has dedicated utility tests for `openInCCSwitch` and component tests for `CCSwitchExportDialog`. Extending those tests to cover new app ids and endpoint defaults is the smallest reliable validation surface. The dialog also reads app labels from i18n keys, so the locale namespace must be extended in place rather than hard-coding new strings.

Alternative considered:

- Rely only on manual dialog verification because the change looks small. Rejected because the change affects both runtime validation and UI rendering, and the existing test seams are already in place.

## Risks / Trade-offs

- [Upstream CC Switch changes app ids or adds app-specific required fields later] -> Keep app ids centralized in `ccSwitch.ts` and cover the deeplink app parameter explicitly in tests so later protocol updates stay localized.
- [The chosen default endpoint for `opencode` or `openclaw` is not ideal for every deployment] -> Preserve manual endpoint editing in the dialog and avoid locking users into an irreversible transformation.
- [UI labels and validation drift apart] -> Drive the selector from the shared app union and extend locale-backed tests so missing labels or invalid ids fail early.

## Migration Plan

No storage or backup migration is required. This is an additive UI/service change:

1. Extend the shared CC Switch app union and label mapping.
2. Apply any app-specific default-endpoint rule in the existing dialog.
3. Update locale resources and focused tests.

Rollback is straightforward: remove the new app ids from the shared union and label mapping if interoperability issues are found.

## Open Questions

- No blocker is outstanding for artifact creation. If implementation testing later shows CC Switch requires extra optional payload fields for `opencode` or `openclaw`, that can be handled as a follow-up refinement without changing the core artifact plan.
