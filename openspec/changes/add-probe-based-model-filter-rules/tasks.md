## 1. Recon and Reuse

- [ ] 1.1 Reconfirm existing filter, sync, key-resolution, and verification surfaces before implementation: `src/types/channelModelFilters.ts`, `src/components/ChannelFiltersEditor.tsx`, `src/features/ManagedSiteChannels/components/ChannelFilterDialog.tsx`, `src/features/BasicSettings/components/tabs/ManagedSite/managedSiteModelSyncSettings.tsx`, `src/services/managedSites/channelConfigStorage.ts`, `src/services/models/modelSync/modelSyncService.ts`, `src/services/managedSites/managedSiteService.ts`, `src/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification.ts`, and `src/services/verification/aiApiVerification/apiVerificationService.ts`.
- [ ] 1.2 Identify the existing provider/channel type data needed to derive supported `ApiVerificationApiType` values from channel type, and document any intentionally unsupported channel types in implementation comments or localized guidance.
- [ ] 1.3 Decide whether the first implementation supports only all-selected-probes-pass or also an explicit any/all operator; if any/all is deferred, keep the stored rule shape forward-compatible without exposing unused UI.

## 2. Rule Types and Storage

- [ ] 2.1 Extend `ChannelModelFilterRule` into a backward-compatible discriminated rule model with `kind: "pattern"` and `kind: "probe"` while preserving existing pattern rule fields and behavior.
- [ ] 2.2 Add probe-rule metadata fields for selected probe IDs and include/exclude action without adding any rule-level `baseUrl`, `apiKey`, cached credential, or manual API type override.
- [ ] 2.3 Update channel filter normalization and sanitization in `channelConfigStorage` so legacy rules without `kind` load as pattern rules, probe rules validate their probe metadata, and imported credential fields are dropped.
- [ ] 2.4 Update user preference and backup/import paths that store `globalChannelModelFilters` so probe rules round-trip while legacy pattern rules remain compatible.

## 3. Probe Filter Execution

- [ ] 3.1 Extract or refactor filter evaluation so `ModelSyncService` can evaluate synchronous pattern rules and asynchronous probe rules through one composition path instead of duplicating include/exclude logic.
- [ ] 3.2 Add channel-type-to-`ApiVerificationApiType` mapping for supported channel types and return an explicit unsupported result for unmapped channel types.
- [ ] 3.3 Resolve probe credentials from the current channel only: use a usable `channel.key` when present, otherwise use the active managed-site provider's existing `fetchChannelSecretKey` capability.
- [ ] 3.4 Reuse `runApiVerificationProbe` for selected probe IDs, passing `channel.base_url`, the resolved channel key, mapped API type, and the candidate model ID.
- [ ] 3.5 Cache probe results within a single sync run by channel/model/probe/API-type context so duplicate global and channel rules do not rerun the same probe unnecessarily.
- [ ] 3.6 Preserve existing model lists when probe filtering cannot run because the channel key is unavailable, verification is required, or the provider/channel type is unsupported.
- [ ] 3.7 Ensure probe-related diagnostics, execution messages, and logs use existing secret-redaction utilities and never emit raw channel keys or managed-site credentials.

## 4. UI and User Feedback

- [ ] 4.1 Extend `ChannelFiltersEditor` to create and edit probe-backed rules in visual mode while preserving JSON mode and existing pattern-rule controls.
- [ ] 4.2 Update channel-level and global filter dialogs to validate probe rules, sanitize imported JSON, and avoid exposing manual credential or API-type override fields.
- [ ] 4.3 Add localized copy for probe rule labels, probe selection, unsupported channel type guidance, key-unavailable recovery guidance, and expensive-probe warnings.
- [ ] 4.4 In interactive surfaces that can retry/test probe filtering, reuse the existing New API managed-site verification flow for hidden channel key recovery instead of adding a new credential prompt.

## 5. Tests

- [ ] 5.1 Add unit tests for filter rule normalization and sanitization, including legacy pattern rules, valid probe rules, invalid probe metadata, and removal of imported credential fields.
- [ ] 5.2 Add unit tests for probe filter composition, including include probe rules, exclude probe rules, disabled probe rules, mixed pattern/probe rules, and unchanged pattern-only behavior.
- [ ] 5.3 Add service tests for channel-key-based probe execution, verifying that probes receive `channel.base_url`, resolved channel key, mapped API type, and model ID.
- [ ] 5.4 Add service tests for key-unavailable, verification-required, unsupported provider, and unsupported channel-type paths to ensure existing channel models are not overwritten.
- [ ] 5.5 Add secret-safety tests proving probe failures and key-resolution failures omit raw channel keys, admin tokens, passwords, TOTP secrets, and generated verification codes from user-facing and logged diagnostics.
- [ ] 5.6 Add component tests for the filter editor covering probe rule creation/editing, JSON mode compatibility, validation feedback, and absence of manual credential fields.

## 6. Validation

- [ ] 6.1 Run the smallest related automated tests for touched behavior, expected to include `pnpm -s vitest --run tests/services/modelSync/modelSyncService.test.ts tests/features/ManagedSiteChannels/components/ChannelFilterDialog.test.tsx tests/components/ChannelFiltersEditor.test.tsx` plus any new test files added for probe filtering.
- [ ] 6.2 Run `pnpm -s lint`.
- [ ] 6.3 Run `pnpm run validate:staged` after staging only the task-scoped files, or document why staged validation cannot run.
- [ ] 6.4 If shared exports, preference migration, backup/import, or runtime message contracts are touched beyond the planned files, broaden validation to `pnpm -s compile` and the relevant storage/preference migration tests.
