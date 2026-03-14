## 1. Shared Capability Guardrails

- [x] 1.1 Add a shared managed-site capability helper that reports whether the active provider supports reliable base-url channel lookup for review/navigation flows.
- [x] 1.2 Update managed-site token status resolution to keep the Veloera unsupported short-circuit as a defensive fallback and cover the helper/service behavior with targeted tests.

## 2. Account Menu UX

- [x] 2.1 Extend the shared account action menu item rendering so a disabled entry can show visible explanatory text without becoming actionable.
- [x] 2.2 Update `AccountActionButtons` to use the shared capability helper and render the Veloera "Locate channel" entry as disabled with an inline unsupported hint, while keeping supported providers actionable.
- [x] 2.3 Add or update `account` locale strings and targeted UI tests for supported-provider vs Veloera locate-channel menu states.

## 3. Key Management Gating

- [x] 3.1 Update `useKeyManagement` to derive managed-site status support from the active provider, skip automatic/manual status checks when unsupported, and clear stale per-token status state when switching to Veloera.
- [x] 3.2 Update `KeyManagement`, `Header`, and `TokenHeader` to hide managed-site refresh/per-token review UI for Veloera and show a localized page-level unsupported hint instead.
- [x] 3.3 Add or update `keyManagement` locale strings plus hook/component tests covering the Veloera unsupported state, suppressed refresh action, and absence of per-token managed-site status/review links.

## 4. Validation

- [x] 4.1 Run targeted Vitest coverage for the account action menu, Key Management gating, and managed-site token status service, then fix any regressions revealed by those tests.
