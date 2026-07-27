# Key Management Service Credential Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account-level service credentials appear as first-class Key Management product entries without pretending they are backend token CRUD resources.

**Architecture:** Add a feature-local `KeyManagementEntry` discriminated union with `account_token` and `service_credential` variants. `useKeyManagement` keeps backend capability state separate, while `TokenList` consumes unified product entries for filtering, grouping, selection, API Profile save, and CLIProxy export; managed-site batch export remains limited to real `AccountToken` rows.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library, existing Key Management components and token provisioning utilities.

---

### Task 1: Product Entry Model

**Files:**
- Create: `src/features/KeyManagement/types.ts`
- Modify: `src/features/KeyManagement/hooks/useKeyManagement.ts`
- Test: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`

- [ ] Add a feature-local `KeyManagementEntry` union with `kind: "account_token"` and `kind: "service_credential"`.
- [ ] Derive `entries` and `filteredEntries` in `useKeyManagement` from existing token inventories and loaded service credential state.
- [ ] Preserve existing `tokens` and `filteredTokens` return values for token-only consumers.
- [ ] Update account summary counts to include loaded service credentials.

### Task 2: TokenList Unified Rendering

**Files:**
- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/TokenList.grouping.test.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/TokenList.emptyStates.test.tsx`

- [ ] Pass `entries` and `filteredEntries` into `TokenList`.
- [ ] Render service credentials in all-accounts groups together with token rows.
- [ ] Keep single-account service credential rendering working when there are no token rows.
- [ ] Keep empty states based on unified entries, not only token rows.

### Task 3: Selection And Export Boundaries

**Files:**
- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Modify: `src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx`
- Modify: `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
- Test: `tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts`

- [ ] Select visible product entries, not only visible tokens.
- [ ] Save both `account_token` and `service_credential` entries to API credential profiles.
- [ ] Allow CLIProxy batch export for entries that have account, name, key, and baseUrl.
- [ ] Keep managed-site batch export actions enabled only for selected `account_token` entries.

### Task 4: Validation And Commit

**Files:**
- Inspect final diff across task-scoped files.

- [ ] Run focused Vitest suites for Key Management list/grouping/batch export and API profile save.
- [ ] Run `pnpm run validate:staged`.
- [ ] Run `pnpm run validate:push` because this changes shared TypeScript UI/service contracts.
- [ ] Commit only task-scoped files with a Conventional Commit message.
