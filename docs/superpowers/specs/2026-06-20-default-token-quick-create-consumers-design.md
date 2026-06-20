# Default Token Quick-Create Consumers Design

Date: 2026-06-20

## Purpose

Make the next account site type faster to add by finishing the consumer-side
migration from Sub2API-specific default-token quick-create logic to the generic
`tokenProvisioning` policy seam.

Recent slices added `SiteAdapter.tokenProvisioning` and
`resolveDefaultTokenQuickCreateResolution(...)`. That seam can already express
whether default-token creation is ready, blocked, or requires user group
selection. The remaining friction is that several product entry points still
call the Sub2API compatibility wrapper or keep Sub2API-named dialog state:

- Copy Key dialog default-key creation.
- Channel Dialog account-to-managed-site import when no token exists.
- Kilo Code export default-token creation.

Those flows are exactly the surfaces a new site type must work through after it
implements `keyManagement` and `tokenProvisioning`. This spec moves the
quick-create consumers to the generic Interface and treats the remaining
Sub2API wrapper as a compatibility shim only.

## Current Context

`src/services/apiAdapters/contracts/siteAdapter.ts` already exposes:

```ts
tokenProvisioning?: TokenProvisioningCapability
```

`src/services/apiAdapters/contracts/tokenProvisioning.ts` defines generic
workflow and decision types:

- `TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection`
- `DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create`
- `DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired`
- `DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked`
- `DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups`

`src/services/accounts/accountOperations.ts` already exports the generic
resolver:

```ts
export async function resolveDefaultTokenQuickCreateResolution(
  account: DisplaySiteData,
  options: { explicitGroup?: string } = {},
): Promise<DefaultTokenQuickCreateResolution>
```

It also keeps the Sub2API wrapper:

```ts
export async function resolveSub2ApiQuickCreateResolution(account)
```

The wrapper currently exists for compatibility, but product consumers still use
it directly. That keeps the site-specific rule at the caller instead of behind
the Adapter.

## Problem

The Adapter seam is deeper than the consumer code that calls it.

Current friction:

1. Copy Key, Channel Dialog, and Kilo export still branch on Sub2API before
   asking whether default-token creation is ready, blocked, or needs group
   selection.
2. The `ready` decision from `resolveDefaultTokenQuickCreateResolution(...)`
   returns full `tokenData`, but wrapper consumers reduce it to a Sub2API
   `group`. A future site type could need policy-adjusted token data beyond a
   group.
3. Shared dialog state names such as `sub2apiTokenDialog` and
   `openSub2ApiTokenDialog` make a generic group-selection UX look
   Sub2API-only even though `AddTokenDialog` can already accept generic
   `allowedGroups`.
4. `ensureAccountApiToken(...)` still names its explicit group option
   `sub2apiGroup`, so generic consumers must either keep a site-specific option
   name or add a compatibility bridge.
5. Tests assert wrapper usage in multiple places, so future implementation can
   appear behavior-correct while still keeping the wrong seam.

Deletion test: if `resolveSub2ApiQuickCreateResolution(...)` were deleted from
consumer code, the complexity should not reappear as raw `siteType ===
SITE_TYPES.SUB2API` checks. It should concentrate in
`resolveDefaultTokenQuickCreateResolution(...)`,
`TokenProvisioningCapability`, and a generic quick-create group-selection
dialog bridge.

## Goals

- Route all default-token quick-create consumers through
  `resolveDefaultTokenQuickCreateResolution(...)`.
- Preserve current behavior for Sub2API:
  - auto-create when exactly one valid current group is available;
  - open the constrained Add Token dialog when multiple groups are available;
  - show the existing blocked/no-group messages;
  - recover a newly created token by created response or inventory refetch as
    each consumer currently does.
- Preserve current behavior for New API-family sites:
  - zero-click default token creation still calls `ensureAccountApiToken(...)`
    when no token exists;
  - no group-selection dialog is shown unless policy asks for it.
- Preserve current behavior for AIHubMix:
  - blocked one-time-secret policy continues to surface through existing
    messages and one-time-key flows;
  - this slice does not make background or export flows silently create
    AIHubMix keys.
- Rename consumer state and dialog bridge concepts from Sub2API-specific names
  to default-token quick-create names where they are no longer Sub2API-only.
- Keep compatibility wrappers only where they protect old callers/tests during
  the migration, and prevent new production consumers from importing them.
- Add focused tests that prove the consumers use the generic Interface and that
  Sub2API behavior is unchanged.
- Add cleanup search checks so this slice does not leave another round of
  Sub2API-specific quick-create consumers behind.

## Non-Goals

- Do not add a new account site type.
- Do not redesign `TokenProvisioningCapability`.
- Do not change `KeyManagementCapability` or raw token CRUD.
- Do not move `generateDefaultTokenRequest()` or change its default payload.
- Do not change user-facing copy or locale keys in this slice; existing
  Sub2API-named messages may remain if they are the current user-facing
  contract.
- Do not migrate Account Dialog site policy into backend adapters.
- Do not redesign Account Dialog post-save auto-configuration. Rename or reuse
  generic dialog helpers only if needed to avoid duplicate quick-create dialog
  plumbing.
- Do not migrate Repair Missing Keys manual Sub2API recovery. It is a repair
  workflow, not a default-token quick-create consumer.
- Do not migrate Model Key dialog default creation. It requires an explicit
  model/group input and is not a quick-create resolver consumer.
- Do not migrate Verify API or Verify CLI dialogs. They only load or resolve
  existing tokens.
- Do not migrate managed-site providers. They already call
  `ensureAccountApiToken(...)`, which uses the shared policy path.
- Do not add telemetry, settings search entries, or Playwright E2E coverage
  unless implementation changes user-visible browser-level behavior beyond this
  routing refactor.

## Approaches Considered

### Approach A: Replace Only The Wrapper Calls

This would update Copy Key, Channel Dialog, and Kilo export to call
`resolveDefaultTokenQuickCreateResolution(...)`, while leaving
`sub2apiGroup`, `sub2apiTokenDialog`, and similar names in place.

This is too shallow. It improves behavior for new site types but preserves
Sub2API terminology in the Interface that future callers will copy.

### Approach B: Move Full Token Creation Into Adapters

Adapters could own "create default key and recover it" workflows directly.

This would put product orchestration, toasts, Add Token dialogs, inventory
refresh, channel opening, and export state behind backend Adapters. That would
make the Adapter Interface broad and harder to test.

### Approach C: Generalize Consumer Routing And Dialog Bridge

Consumers ask `resolveDefaultTokenQuickCreateResolution(...)` for a decision,
then keep their local orchestration. Shared group-selection dialog state is
renamed to default-token quick-create language. `ensureAccountApiToken(...)`
accepts a generic explicit group option while keeping the old option as a
temporary compatibility alias.

This is the recommended path. It keeps backend-specific policy behind the
Adapter seam and product behavior in product Modules, while removing the
remaining Sub2API-only consumer Interface.

## Design

### 1. Keep The Generic Resolver As The Consumer Interface

Do not create a second resolver. The consumer Interface for default-token
quick-create decisions is:

```ts
resolveDefaultTokenQuickCreateResolution(account, {
  explicitGroup,
})
```

Consumers must handle all three result kinds:

- `ready`: use the returned `tokenData` as the default token payload.
- `selection_required`: open a constrained Add Token dialog with
  `allowedGroups`.
- `blocked`: show or store the returned `message`.

Important: consumers must not reduce `ready.tokenData` to only `group`. The
whole payload is policy output and must be preserved.

`resolveSub2ApiQuickCreateResolution(...)` may remain in
`accountOperations.ts` during this slice for service-level compatibility tests,
but product consumers must stop importing it.

### 2. Add A Generic Token Payload Option To Shared Ensure

Modify `ensureAccountApiToken(...)` so the option shape accepts a generic
policy-resolved token payload:

```ts
import type { CreateTokenRequest } from "~/services/apiService/common/type"

toastIdOrOptions?:
  | string
  | {
      toastId?: string
      defaultTokenData?: CreateTokenRequest
      explicitGroup?: string
      sub2apiGroup?: string
    }
```

Resolution order when no existing token is found:

```ts
const defaultTokenData =
  options.defaultTokenData ??
  generateDefaultTokenRequest()
const explicitGroup = options.explicitGroup ?? options.sub2apiGroup
```

Then pass both `defaultTokenData` and `explicitGroup` into
`requiredTokenProvisioning.resolveDefaultTokenCreation(...)`. This preserves the
full policy-resolved token payload instead of narrowing future policy output to
only `group`.

This keeps old call sites working while new consumers use the generic option.
The implementation should add a short comment marking `sub2apiGroup` as a
temporary compatibility alias. New code should prefer `defaultTokenData`; use
`explicitGroup` only when the caller truly has a user-selected group but no full
policy decision. Do not remove compatibility aliases in this slice unless all
current callers and tests are safely migrated and the removal is verified by
TypeScript.

### 3. Generalize Copy Key Dialog Quick-Create State

Modify:

```text
src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts
src/features/AccountManagement/components/CopyKeyDialog/index.tsx
```

Target behavior:

- Import `resolveDefaultTokenQuickCreateResolution(...)`.
- Remove the `account.siteType === "sub2api"` gate before quick-create
  resolution.
- Call the resolver for the default-key create action when no explicit group is
  already provided by the Add Token dialog.
- On `blocked`, set the existing create error to `resolution.message`.
- On `selection_required`, store generic allowed groups state and open
  `AddTokenDialog` with a constrained `createPrefill`.
- On `ready`, call `keyManagement.createToken(request, resolution.tokenData)`.
- Preserve one-time-key handling through `refreshTokensAfterCreate(...)`.

Rename hook and component state from Sub2API language to generic quick-create
language:

- `sub2apiCreateAllowedGroups` -> `defaultTokenCreateAllowedGroups`
- `setSub2apiCreateAllowedGroups` -> `setDefaultTokenCreateAllowedGroups`
- `clearSub2ApiCreateAllowedGroups` -> `clearDefaultTokenCreateAllowedGroups`
- `sub2apiQuickCreatePrefill` -> `defaultTokenQuickCreatePrefill`

The rendered Add Token dialog may keep existing Sub2API message keys for the
notice if the current only selection-required site is Sub2API. Do not introduce
new locale keys in this slice.

### 4. Generalize Kilo Export Quick-Create State

Modify:

```text
src/components/KiloCodeExportDialog.tsx
```

Target behavior:

- Import `resolveDefaultTokenQuickCreateResolution(...)`.
- Replace `sub2apiCreateContext` with a generic default-token create context:

```ts
type DefaultTokenCreateContext = {
  siteId: string
  allowedGroups: string[]
}
```

- When a selected account has no tokens, ask the generic resolver.
- On `blocked`, preserve the existing toast and token-inventory error state.
- On `selection_required`, store the generic create context and open the
  constrained `AddTokenDialog`.
- On `ready`, call `ensureAccountApiToken(account, site, {
  toastId,
  defaultTokenData: resolution.tokenData,
})`.
- Preserve the current newest-token selection after create.
- Preserve error/loading inventory state transitions.

Do not pass only `resolution.tokenData.group`; doing so would recreate the
Sub2API-shaped Interface at the call site and lose future policy-owned token
fields.

### 5. Generalize Channel Dialog Token Creation Bridge

Modify:

```text
src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts
src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx
src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx
```

Target behavior:

- Import `resolveDefaultTokenQuickCreateResolution(...)`.
- Replace the no-token Sub2API branch in `openWithAccount(...)` with a generic
  decision branch.
- On `blocked`, show `resolution.message` and do not open the channel dialog.
- On `selection_required`, open the constrained Add Token dialog and keep the
  deferred channel-open behavior.
- On `ready`, call `ensureAccountApiToken(..., {
  toastId,
  defaultTokenData: resolution.tokenData,
})`.
- Preserve existing `shouldContinue()` cancellation checks before and after
  async work.
- Preserve token recovery after Add Token success:
  - use the created token when `AddTokenDialog` returns it;
  - otherwise refetch inventory and select a single new token by ID diff;
  - fail closed on missing, ambiguous, or non-array refetch results.

Rename shared dialog context concepts from Sub2API-specific language to
default-token quick-create language:

- `Sub2ApiTokenDialogState` -> `DefaultTokenQuickCreateDialogState`
- `sub2apiTokenDialog` -> `defaultTokenQuickCreateDialog`
- `openSub2ApiTokenDialog` -> `openDefaultTokenQuickCreateDialog`
- `closeSub2ApiTokenDialog` -> `closeDefaultTokenQuickCreateDialog`
- `handleSub2ApiTokenSuccess` -> `handleDefaultTokenQuickCreateSuccess`
- `sub2apiTokenDialogPrefill` -> `defaultTokenQuickCreatePrefill`

Keep compatibility aliases only if they materially reduce patch risk in
existing Account Dialog or Repair flows. If aliases are kept, mark them as
temporary and ensure new code uses the generic names.

### 6. Account Dialog Post-Save Boundary

Account Dialog post-save Sub2API key creation is related but has its own site
policy seam:

```text
src/features/AccountManagement/components/AccountDialog/sitePolicy.ts
src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts
src/features/AccountManagement/components/AccountDialog/index.tsx
```

This slice should not move Account Dialog post-save behavior into
`tokenProvisioning` or redesign auto-configuration. However, if the Channel
Dialog quick-create context is renamed generically, Account Dialog may need
mechanical updates to call the renamed helper. That is in scope only as a
consumer of the shared generic dialog bridge.

Do not change Account Dialog policy decisions:

- `openSub2ApiTokenDialogPostSave` may remain in `sitePolicy.ts` for this
  slice.
- `shouldOpenSub2ApiTokenDialogForAccountDialogSite(...)` may remain.
- `postSaveSub2ApiAllowedGroups` and post-save session names may remain unless
  implementation is already touching them solely because of the shared dialog
  helper rename.

This prevents the slice from becoming a broader Account Dialog policy rewrite.

### 7. Explicit Out-Of-Scope Related Entrypoints

During implementation, inspect but do not migrate these unless a compile error
forces a mechanical rename:

- `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
  - It opens a manual recovery flow for repair results. It is not a
    quick-create resolver consumer.
- `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`
  - It creates a model key from an explicit user-selected group and does not
    use quick-create policy.
- `src/components/dialogs/VerifyApiDialog/**`
  - Existing-token load/resolve only.
- `src/components/dialogs/VerifyCliSupportDialog/**`
  - Existing-token load/resolve only.
- `src/services/accounts/accountKeyAutoProvisioning/**`
  - Background and repair policies already use `tokenProvisioning`.
- `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Post-save token provisioning already uses `tokenProvisioning`.
- `src/services/managedSites/providers/**`
  - Providers call `ensureAccountApiToken(...)`; they should not own
    quick-create decision logic.

## Error Handling

Keep policy reason mapping in `accountOperations.ts`.

Consumer behavior:

- `blocked`
  - Show/store `resolution.message`.
  - Do not call `keyManagement.createToken(...)`.
  - Do not call `ensureAccountApiToken(...)`.
- `selection_required`
  - Open a constrained `AddTokenDialog`.
  - Do not create a token until the user confirms the dialog.
- `ready`
  - Use policy-provided `tokenData`.
  - Preserve current create/refetch/selection behavior in the consumer.
- resolver throws
  - Existing consumer error handling should catch and surface the local
    fallback message.

Do not add new user-facing copy. Existing Sub2API-named message keys can remain
as the current translation contract until a separate copy cleanup is planned.

## Telemetry Decision

Telemetry decision: reuse existing.

This slice changes routing and naming behind existing user actions. It does not
add a new action, setting, async workflow, or product analytics field. Existing
Copy Key, Channel Dialog, Kilo export, and Add Token telemetry should continue
to emit from their current owners.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The main risk is service/component routing and state preservation, not browser
runtime behavior. Focused Vitest and Testing Library coverage can exercise the
resolver decisions, constrained Add Token dialog path, and token recovery
behavior directly.

## Testing Strategy

Update service tests:

- `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - `resolveDefaultTokenQuickCreateResolution(...)` remains the primary
    service-level decision Interface.
  - `ensureAccountApiToken(...)` accepts `defaultTokenData`.
  - `explicitGroup` and `sub2apiGroup` remain compatibility aliases only if
    kept.
  - `resolveSub2ApiQuickCreateResolution(...)` tests can remain as wrapper
    compatibility tests, but product tests must not depend on it.

Update Copy Key tests:

- `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
- `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`

Required assertions:

- Copy Key default create calls the generic resolver path through adapter
  policy.
- A single Sub2API group still creates with that group.
- Multiple groups still open the constrained Add Token dialog.
- No groups still shows the existing blocked message.
- One-time key behavior for AIHubMix custom token creation remains unchanged.
- Generic state names are used in hook/component tests when exposed.

Update Kilo export tests:

- `tests/components/KiloCodeExportDialog.test.tsx`

Required assertions:

- Kilo default create mocks `resolveDefaultTokenQuickCreateResolution(...)`, not
  the Sub2API wrapper.
- A `ready` decision passes full `tokenData` into the shared ensure path.
- A `selection_required` decision opens the constrained Add Token dialog and
  refreshes/selects the newest token after success.
- A `blocked` decision preserves token inventory error state.

Update Channel Dialog tests:

- `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`

Required assertions:

- Channel Dialog mocks the generic resolver.
- No-token `selection_required` opens the generic quick-create dialog state.
- Dialog success with a returned token continues opening the channel.
- Dialog success without a returned token refetches and selects one new token.
- Missing, ambiguous, or non-array refetch still fails closed.
- Existing-token paths do not call the quick-create resolver.

Update Add Token dialog bridge tests if names change:

- `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
- `tests/entrypoints/options/pages/KeyManagement/useTokenData.test.ts`

These should cover only prefill/allowed-group behavior needed by the generic
quick-create dialog. Do not broaden into token CRUD behavior already covered by
Key Management tests.

Do not add Account Dialog tests unless the implementation mechanically renames
shared quick-create dialog APIs used by Account Dialog post-save:

- `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`
- `tests/features/AccountManagement/components/AccountDialog.test.tsx`
- `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`

## Migration Completeness Checks

Run these cleanup searches during implementation:

```powershell
rg "resolveSub2ApiQuickCreateResolution" src tests
rg "sub2apiGroup|explicitGroup|defaultTokenData" src tests
rg "sub2apiCreateAllowedGroups|sub2apiCreateContext|sub2apiQuickCreate" src tests
rg "sub2apiTokenDialog|openSub2ApiTokenDialog|closeSub2ApiTokenDialog|handleSub2ApiTokenSuccess" src tests
rg "siteType === [\"']sub2api[\"']|siteType === SITE_TYPES.SUB2API" src/features src/components src/services/accounts
```

Expected after implementation:

- No product consumer imports `resolveSub2ApiQuickCreateResolution(...)`.
- `resolveSub2ApiQuickCreateResolution(...)` appears only in
  `src/services/accounts/accountOperations.ts` and its compatibility tests, if
  the wrapper is retained.
- consumer quick-create paths pass `defaultTokenData` rather than only
  `explicitGroup` or `sub2apiGroup`.
- `sub2apiGroup` appears only as a documented compatibility alias in
  `ensureAccountApiToken(...)` and compatibility tests, if retained.
- Copy Key, Channel Dialog, and Kilo export use generic quick-create state
  names.
- Sub2API-specific names may remain in:
  - Account Dialog post-save site policy;
  - Repair Missing Keys manual recovery flow;
  - translation keys;
  - compatibility tests for the wrapper.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/accountOperations.ensureAccountApiToken.test.ts tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

If shared Add Token dialog names or props are touched:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/entrypoints/options/pages/KeyManagement/useTokenData.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/accounts/accountOperations.ts src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts src/features/AccountManagement/components/CopyKeyDialog/index.tsx src/components/KiloCodeExportDialog.tsx src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts src/components/dialogs/ChannelDialog/context/ChannelDialogContext.tsx src/components/dialogs/ChannelDialog/components/ChannelDialogContainer.tsx
```

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before PR or remote handoff:

```powershell
pnpm run validate:push
```

Run `validate:push` before publishing because this slice touches shared
account operations and cross-feature dialog wiring.

## Rollout

1. Update service-level tests for generic `defaultTokenData` and wrapper
   compatibility.
2. Add or adjust Copy Key tests to assert generic resolver behavior.
3. Migrate Copy Key hook/component state and resolver calls.
4. Add or adjust Kilo export tests to assert generic resolver behavior.
5. Migrate Kilo export state and resolver calls.
6. Add or adjust Channel Dialog tests to assert generic resolver behavior and
   generic quick-create dialog state.
7. Migrate Channel Dialog context, container, and hook names.
8. Apply mechanical updates to Account Dialog or Repair only if shared dialog
   API renames require them; do not change their workflow semantics.
9. Run cleanup searches and remove unexpected Sub2API quick-create consumer
   references.
10. Run focused tests, related validation, `validate:staged`, and
    `validate:push`.

## Follow-Up, Not In Scope For This Spec

Later slices may:

- remove `resolveSub2ApiQuickCreateResolution(...)` after all compatibility
  tests and external callers are gone;
- remove `explicitGroup` or `sub2apiGroup` from `ensureAccountApiToken(...)`
  after full `defaultTokenData` propagation proves no callers need the aliases;
- rename Sub2API-specific translation keys to generic group-selection copy;
- generalize Account Dialog post-save naming once the dialog site-policy seam
  is ready for that cleanup;
- generalize Repair Missing Keys manual Sub2API recovery naming;
- consolidate account-site registration metadata across onboarding,
  `apiAdapters/registry.ts`, and site-type constants.
