## Context

The API Credential Profiles page already has a complete page-local workflow for CRUD, API verification, exports, and delete confirmation through `useApiCredentialProfilesController`, `ApiCredentialProfilesListView`, `ApiCredentialProfileListItem`, and `ApiCredentialProfilesDialogs`. Separately, Model Management already exposes CLI support verification for profile-backed model rows by opening the shared `VerifyCliSupportDialog` with a `profile` source.

Nearest existing abstractions and how this change should use them:
- `src/features/ApiCredentialProfiles/hooks/useApiCredentialProfilesController.ts`: extend to track the currently CLI-verifying profile; do not add a parallel controller.
- `src/features/ApiCredentialProfiles/components/ApiCredentialProfilesDialogs.tsx`: extend to mount the shared CLI verification dialog alongside the existing API verification dialog.
- `src/features/ApiCredentialProfiles/components/ApiCredentialProfileListItem.tsx`: extend the existing profile action cluster with a CLI verification action; do not create a second action surface.
- `src/components/dialogs/VerifyCliSupportDialog`: reuse directly for profile sources because it already supports `profile` props and profile-backed execution.
- `src/services/apiCredentialProfiles/modelCatalog.ts`: reuse for profile-backed CLI model fetching so the dialog can surface fetched model choices instead of relying on manual model-id entry only.
- `src/features/ModelList/components/ModelItem/ModelItemHeader.tsx`: treat as the visual reference for the command-line verification affordance and match its icon choice instead of inventing a new one.

## Goals / Non-Goals

**Goals:**
- Allow stored API credential profiles to launch CLI support verification directly from the API Credential Profiles page.
- Reuse the existing shared CLI verification dialog and profile-backed execution path.
- Let profile-backed CLI verification fetch models and present them in a chooser, while still allowing manual model-id entry when the fetched list is incomplete.
- Keep the CLI verification affordance visually consistent with Model Management.
- Add focused tests for the new profile-page action and dialog wiring.

**Non-Goals:**
- Changing how CLI support verification executes once the dialog is open.
- Adding model discovery or automatic model prefill to the API Credential Profiles page itself.
- Refactoring Model Management verification flows beyond any shared icon or test helper reuse needed for consistency.

## Decisions

### Decision: Reuse the existing shared dialog instead of introducing a profile-page-specific CLI dialog
`VerifyCliSupportDialog` already supports a `profile` prop, uses the stored profile `baseUrl` and `apiKey`, and bypasses token loading for profile sources. Reusing it keeps CLI verification behavior identical between the API Credential Profiles page and Model Management.

Alternatives considered:
- Create a new `VerifyCliCredentialProfileDialog` just for the profile page. Rejected because it would duplicate state handling, tool execution, and redaction behavior that already exists in the shared dialog.

### Decision: Reuse the profile model-catalog helper inside the shared CLI dialog
Profile-backed CLI verification still needs a model id, but forcing manual entry is avoidable because the repo already has profile credential model fetching in `src/services/apiCredentialProfiles/modelCatalog.ts`. Reusing that helper inside `VerifyCliSupportDialog` lets the profile flow present fetched model choices in the same shared dialog while preserving manual entry as a fallback.

Alternatives considered:
- Keep the CLI dialog manual-entry only for profiles. Rejected because it adds friction compared with the existing profile API verification flow and makes the new profile-page entrypoint less useful.
- Add model fetching directly to the page before opening the dialog. Rejected because model selection belongs to dialog-local verification state and would unnecessarily spread verification concerns into the page controller.

### Decision: Extend the existing profile controller/dialog composition
The API Credential Profiles page already centralizes modal state in `useApiCredentialProfilesController` and renders dialogs through `ApiCredentialProfilesDialogs`. The CLI verification entrypoint should follow that same pattern by adding a `cliVerifyingProfile` state slot and a matching dialog branch.

Alternatives considered:
- Keep CLI dialog state local inside each row component. Rejected because it would diverge from the page’s established modal ownership and complicate future coordination between dialogs.

### Decision: Match the existing command-line iconography from Model Management
The API Credential Profiles action should use the same `CommandLineIcon` glyph that Model Management already uses for CLI verification. This preserves recognizability for users who move between the two surfaces. A separate shared icon component is not required unless implementation friction appears, because the change only needs consistent icon selection, not a new abstraction boundary.

Alternatives considered:
- Keep the current generic check-circle verification icon for CLI tests. Rejected because it fails the consistency goal and makes CLI verification indistinguishable from API verification.
- Extract a new shared verification-action button abstraction first. Rejected for now because the scope is small and the existing surfaces do not yet have broader shared button behavior beyond icon choice.

### Decision: Cover the new behavior with page-level tests plus existing shared-dialog tests
The repository already has Model Management coverage proving profile-backed rows can invoke CLI verification, and shared dialog tests cover the dialog’s internal behavior. This change should add API Credential Profiles page tests that verify the new action is rendered, uses the expected affordance, and opens the shared dialog for a stored profile, while shared dialog tests cover fetched model choices for profile sources.

Alternatives considered:
- Rely only on existing Model Management and shared dialog tests. Rejected because the missing behavior is specifically the profile-page wiring.

## Risks / Trade-offs

- [Action density in profile rows increases] → Mitigation: keep the new button inside the existing compact action cluster and reuse the established icon-only pattern.
- [Two verification buttons may be confused] → Mitigation: differentiate API and CLI verification with the existing wrench versus command-line iconography and separate localized labels.
- [Profile model discovery may fail or return incomplete lists] → Mitigation: keep manual model-id entry available alongside fetched choices and surface a sanitized fetch error in the dialog.
- [Future icon drift between surfaces] → Mitigation: use the same icon choice documented here and cover it in component/page tests where practical.
- [Controller state grows] → Mitigation: keep the added state limited to one nullable profile reference and continue routing all dialogs through the existing composition component.
