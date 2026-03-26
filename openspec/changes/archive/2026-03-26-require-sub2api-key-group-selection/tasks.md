## 1. Shared Helper Hardening

- [x] Keep `generateDefaultTokenRequest()` as the default-token template for supported sites and constrained Sub2API dialog prefills.
- [x] Block implicit Sub2API default-token creation in `ensureDefaultApiTokenForAccount()` and `ensureAccountApiToken()` unless a resolved valid group is supplied.
- [x] Add shared `resolveSub2ApiQuickCreateResolution()` logic that classifies the current upstream group set as ready, selection required, or blocked.
- [x] Add localized user-facing copy for unavailable-group and explicit-selection-required Sub2API create failures.

## 2. User-Triggered Entry Points

- [x] Update Copy Key empty-state quick-create to auto-use a single valid current group, open a constrained Add Token dialog for multi-group Sub2API accounts, and fail safely when no valid groups exist.
- [x] Update KiloCode export no-token creation to use the same Sub2API resolution logic, constrained dialog flow, and post-create refresh/reselect behavior.
- [x] Route managed-site channel import through the shared Sub2API token-dialog orchestration so multi-group accounts can create a token and then resume the original import flow.
- [x] Prompt the same group-aware Sub2API token creation flow after saving a Sub2API account when the saved account still has no key, while allowing downstream flows to suppress that prompt when needed.
- [x] Keep automatic Sub2API repair skipped, but expose an explicit create-key follow-up action for skipped Sub2API accounts in the repair results UI.
- [x] Preserve non-Sub2API quick-create behavior and the existing explicit-group Sub2API create/update path.

## 3. Verification

- [x] Add or update focused tests for shared helper gating and quick-create resolution behavior.
- [x] Add or update focused UI tests for Copy Key, KiloCode export, managed-site channel import, Sub2API account save, and repair follow-up flows.
