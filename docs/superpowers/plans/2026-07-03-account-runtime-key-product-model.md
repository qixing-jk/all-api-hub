# Account Runtime Key Product Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate mixed account key runtime, verification, model probing, and export flows from transient token-shaped service credentials to `AccountRuntimeKey`.

**Architecture:** Add `AccountRuntimeKey` as the product model for account-scoped runtime keys and keep `AccountToken` reserved for real token CRUD resources. Runtime consumers receive source-aware runtime keys with stable string ids, while unavoidable legacy token-shaped conversions are centralized in one account module and kept out of selection or identity logic.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library, WXT extension services, existing account adapter and Key Management modules.

**Spec:** `docs/superpowers/specs/2026-07-03-account-runtime-key-product-model-design.md`

---

## File Structure

Create:

- `src/services/accounts/accountRuntimeKeys.ts`
  - Owns runtime-key source constants, types, id builders, source builders, type guards, legacy edge conversion helpers, and secret collection.
- `tests/services/accounts/accountRuntimeKeys.test.ts`
  - Covers runtime-key construction, source guards, stable ids, legacy conversion, and secret collection.

Modify:

- `src/services/accounts/utils/apiServiceRequest.ts`
  - Changes `fetchDisplayAccountRuntimeKeys` to return `AccountRuntimeKey[]`.
  - Adds `fetchDisplayAccountRuntimeKeyTokens` as the clearly named compatibility helper for old token-shaped consumers while they are being migrated.
  - Adds `resolveDisplayAccountRuntimeKeySecret`.
- `tests/services/accounts/apiServiceRequest.test.ts`
  - Replaces service-credential fake-token assertions with runtime-key assertions.
- `src/features/ModelList/modelManagementSources.ts`
  - Adds runtime-key source identity support for model-list rows.
- `src/services/modelList/accountSources/tokenScopedFallback.ts`
  - Renames the token-scoped fallback entry point to runtime-key fallback and consumes `AccountRuntimeKey`.
- `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`
  - Verifies account-token and service-credential runtime-key fallback behavior.
- `src/features/ModelList/hooks/useModelData.ts`
  - Renames account fallback token state to runtime-key state and uses runtime-key ids for selection.
- `src/features/ModelList/components/StatusIndicator.tsx`
  - Renders runtime-key fallback controls while preserving existing layout and copy until copy cleanup.
- `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
  - Updates fallback expectations from numeric token ids to runtime-key ids.
- `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`
  - Updates fallback control mocks to runtime-key fields.
- `src/components/dialogs/VerifyApiDialog/index.tsx`
  - Uses runtime keys for selectable account keys and resolves secrets through `resolveDisplayAccountRuntimeKeySecret`.
- `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
  - Uses runtime keys for CLI verification.
- `src/features/ModelList/components/BatchVerifyModelsDialog.tsx`
  - Uses runtime keys for account-backed batch verification.
- `tests/components/VerifyApiDialog.test.tsx`
  - Adds service-credential runtime-key verification coverage if no current test covers it.
- `tests/components/VerifyCliSupportDialog.test.tsx`
  - Updates mocked account key fetching and resolution to runtime keys.
- `tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx`
  - Updates mocked account key fetching and resolution to runtime keys.
- `src/features/KeyManagement/types.ts`
  - Makes `KeyManagementEntry` wrap `AccountRuntimeKey` plus feature-local UI state.
- `src/features/KeyManagement/utils.ts`
  - Removes feature-local service-credential transient token construction and uses runtime-key helpers for entry ids.
- `tests/features/KeyManagement/utils.test.ts`
  - Removes transient token tests and covers entry id helpers that remain.
- `src/features/KeyManagement/hooks/useKeyManagement.ts`
  - Builds entries from runtime keys and uses source guards for token CRUD and service-credential rotation.
- `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
  - Updates service-credential entry and managed-site status assertions.
- `src/features/KeyManagement/components/TokenList.tsx`
  - Consumes runtime-key entries for selection, grouping, API profile save, CLIProxy export, and managed-site export inputs.
- `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
  - Updates selected entry expectations to runtime-key inputs.
- `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx`
  - Accepts runtime-key export entries and uses legacy conversion only at the CLIProxy token-shaped edge.
- `tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx`
  - Verifies service-credential export no longer depends on fake token ids.
- `src/features/KeyManagement/components/ServiceCredentialCard.tsx`
  - Builds selected/exportable service credentials through runtime-key entries.
- `src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx`
  - Renames mixed save action to runtime-key save and resolves secrets through runtime-key helpers.
- `tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts`
  - Verifies service credentials save from runtime-key fields without token-secret resolution.
- `src/types/managedSiteTokenBatchExport.ts`
  - Changes mixed export inputs and preview items from token fields to runtime-key fields.
- `src/services/managedSites/tokenBatchExport.ts`
  - Accepts runtime-key inputs, resolves account-token secrets only for account-token runtime keys, and uses service-credential base URL directly.
- `tests/services/managedSites/tokenBatchExport.test.ts`
  - Verifies service credentials do not flow through token-secret resolution or local fake token builders.
- `src/services/managedSites/tokenChannelStatus.ts`
  - Keep real token status checks token-shaped; only convert runtime keys at the exact status-check edge when a managed-site API still requires an `AccountToken`.
- `tests/services/managedSites/tokenChannelStatus.test.ts`
  - Update only if implementation changes the public status-check input.

Do not modify:

- backend adapter protocols;
- account persistence schemas;
- telemetry payloads, unless execution changes a visible user action or funnel semantic;
- docs translations, unless visible copy changes under `src/locales/**`.

## Cross-Cutting Target Interface

Use this target module shape in Task 1 and import from it in all following tasks:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"

export const ACCOUNT_RUNTIME_KEY_SOURCES = {
  AccountToken: "account_token",
  ServiceCredential: "service_credential",
} as const

export type AccountRuntimeKeySource =
  (typeof ACCOUNT_RUNTIME_KEY_SOURCES)[keyof typeof ACCOUNT_RUNTIME_KEY_SOURCES]

export const ACCOUNT_RUNTIME_KEY_STATUSES = {
  Active: "active",
  Inactive: "inactive",
  Unknown: "unknown",
} as const

export type AccountRuntimeKeyStatus =
  (typeof ACCOUNT_RUNTIME_KEY_STATUSES)[keyof typeof ACCOUNT_RUNTIME_KEY_STATUSES]

export type AccountRuntimeKeyAccount = Pick<
  DisplaySiteData,
  | "authType"
  | "baseUrl"
  | "cookieAuthSessionCookie"
  | "id"
  | "name"
  | "siteType"
  | "tagIds"
  | "token"
  | "userId"
>

export type AccountRuntimeKeyCapabilities = {
  copy: boolean
  export: boolean
  verify: boolean
  fetchRuntimeModels: boolean
  rotate: boolean
  updateToken: boolean
  deleteToken: boolean
}

type AccountRuntimeKeyBase = {
  id: string
  source: AccountRuntimeKeySource
  account: AccountRuntimeKeyAccount
  accountId: string
  accountName: string
  siteType: AccountSiteType
  label: string
  secret: string
  baseUrl: string
  status: AccountRuntimeKeyStatus
  capabilities: AccountRuntimeKeyCapabilities
}

export type AccountTokenRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken
  tokenId: number
  token: AccountToken
}

export type ServiceCredentialRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential
  service: AccountServiceCredential["service"]
  credential: AccountServiceCredential
}

export type AccountRuntimeKey =
  | AccountTokenRuntimeKey
  | ServiceCredentialRuntimeKey

export const ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID = -1

export const buildAccountTokenRuntimeKeyId = (
  accountId: string,
  tokenId: number,
) => `account_token:${accountId}:${tokenId}`

export const buildServiceCredentialRuntimeKeyId = (
  accountId: string,
  service: AccountServiceCredential["service"],
) => `service_credential:${accountId}:${service}`

export const isAccountTokenRuntimeKey = (
  runtimeKey: AccountRuntimeKey,
): runtimeKey is AccountTokenRuntimeKey =>
  runtimeKey.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken

export const isServiceCredentialRuntimeKey = (
  runtimeKey: AccountRuntimeKey,
): runtimeKey is ServiceCredentialRuntimeKey =>
  runtimeKey.source === ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential

const getAccountRuntimeKeyBase = (
  account: AccountRuntimeKeyAccount,
  fields: Pick<AccountRuntimeKeyBase, "id" | "source" | "label" | "secret"> & {
    baseUrl?: string
    status: AccountRuntimeKeyStatus
    capabilities: AccountRuntimeKeyCapabilities
  },
): AccountRuntimeKeyBase => ({
  ...fields,
  account,
  accountId: account.id,
  accountName: account.name,
  siteType: account.siteType,
  baseUrl: fields.baseUrl || account.baseUrl,
})

export const buildAccountTokenRuntimeKey = (
  account: AccountRuntimeKeyAccount,
  token: AccountToken,
): AccountTokenRuntimeKey => ({
  ...getAccountRuntimeKeyBase(account, {
    id: buildAccountTokenRuntimeKeyId(account.id, token.id),
    source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
    label: token.name,
    secret: token.key,
    status:
      token.status === 1
        ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
        : token.status === 2
          ? ACCOUNT_RUNTIME_KEY_STATUSES.Inactive
          : ACCOUNT_RUNTIME_KEY_STATUSES.Unknown,
    capabilities: {
      copy: true,
      export: true,
      verify: true,
      fetchRuntimeModels: true,
      rotate: false,
      updateToken: true,
      deleteToken: true,
    },
  }),
  tokenId: token.id,
  token,
})

export const buildServiceCredentialRuntimeKey = (
  account: AccountRuntimeKeyAccount,
  credential: AccountServiceCredential,
  options: { canRotate?: boolean } = {},
): ServiceCredentialRuntimeKey => ({
  ...getAccountRuntimeKeyBase(account, {
    id: buildServiceCredentialRuntimeKeyId(account.id, credential.service),
    source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
    label: credential.label,
    secret: credential.key,
    baseUrl: credential.baseUrl || account.baseUrl,
    status: credential.isAuthenticated
      ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
      : ACCOUNT_RUNTIME_KEY_STATUSES.Inactive,
    capabilities: {
      copy: true,
      export: true,
      verify: true,
      fetchRuntimeModels: true,
      rotate: options.canRotate === true,
      updateToken: false,
      deleteToken: false,
    },
  }),
  service: credential.service,
  credential,
})

export const accountRuntimeKeyToLegacyApiToken = (
  runtimeKey: AccountRuntimeKey,
): ApiToken => {
  if (isAccountTokenRuntimeKey(runtimeKey)) {
    return runtimeKey.token
  }

  return {
    id: ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
    user_id: 0,
    key: runtimeKey.secret,
    status: runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active ? 1 : 2,
    name: runtimeKey.label,
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
    models: "",
  }
}

export const accountRuntimeKeyToLegacyAccountToken = (
  runtimeKey: AccountRuntimeKey,
): AccountToken =>
  isAccountTokenRuntimeKey(runtimeKey)
    ? runtimeKey.token
    : {
        ...accountRuntimeKeyToLegacyApiToken(runtimeKey),
        accountId: runtimeKey.accountId,
        accountName: runtimeKey.accountName,
      }

export const formatAccountRuntimeKeySecretForSite = <
  TRuntimeKey extends AccountRuntimeKey,
>(
  runtimeKey: TRuntimeKey,
): TRuntimeKey => ({
  ...runtimeKey,
  secret: formatOptionalSkPrefixSiteToken(
    accountRuntimeKeyToLegacyApiToken(runtimeKey),
    runtimeKey.siteType,
  ).key,
})

export const collectAccountRuntimeKeySecrets = (
  runtimeKeys: AccountRuntimeKey[],
) =>
  runtimeKeys
    .flatMap((runtimeKey) => [
      runtimeKey.secret,
      runtimeKey.account.token,
      runtimeKey.account.cookieAuthSessionCookie,
    ])
    .filter(Boolean) as string[]
```

## Task 1: Core Runtime Key Model

**Files:**

- Create: `src/services/accounts/accountRuntimeKeys.ts`
- Create: `tests/services/accounts/accountRuntimeKeys.test.ts`

- [ ] **Step 1: Write the failing model tests**

Add `tests/services/accounts/accountRuntimeKeys.test.ts`:

```ts
import {
  ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
  ACCOUNT_RUNTIME_KEY_SOURCES,
  ACCOUNT_RUNTIME_KEY_STATUSES,
  accountRuntimeKeyToLegacyAccountToken,
  accountRuntimeKeyToLegacyApiToken,
  buildAccountTokenRuntimeKey,
  buildAccountTokenRuntimeKeyId,
  buildServiceCredentialRuntimeKey,
  buildServiceCredentialRuntimeKeyId,
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { AuthTypeEnum, type AccountToken, type DisplaySiteData } from "~/types"

const account = {
  id: "account-1",
  name: "Example Account",
  siteType: "new-api",
  baseUrl: "https://example.invalid",
  authType: AuthTypeEnum.AccessToken,
  token: "account-access-token",
  userId: "user-1",
  cookieAuthSessionCookie: "session=redacted",
  tagIds: ["tag-1"],
} satisfies Pick<
  DisplaySiteData,
  | "authType"
  | "baseUrl"
  | "cookieAuthSessionCookie"
  | "id"
  | "name"
  | "siteType"
  | "tagIds"
  | "token"
  | "userId"
>

const token = {
  id: 42,
  user_id: 7,
  key: "sk-token-secret",
  status: 1,
  name: "Primary token",
  created_time: 1,
  accessed_time: 2,
  expired_time: -1,
  remain_quota: 1000,
  unlimited_quota: false,
  used_quota: 10,
  accountId: account.id,
  accountName: account.name,
} satisfies AccountToken

describe("accountRuntimeKeys", () => {
  it("builds stable account-token runtime keys", () => {
    const runtimeKey = buildAccountTokenRuntimeKey(account, token)

    expect(runtimeKey).toMatchObject({
      id: "account_token:account-1:42",
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
      accountId: account.id,
      accountName: account.name,
      siteType: account.siteType,
      label: "Primary token",
      secret: "sk-token-secret",
      baseUrl: "https://example.invalid",
      status: ACCOUNT_RUNTIME_KEY_STATUSES.Active,
      tokenId: 42,
      token,
      capabilities: {
        copy: true,
        export: true,
        verify: true,
        fetchRuntimeModels: true,
        rotate: false,
        updateToken: true,
        deleteToken: true,
      },
    })
    expect(isAccountTokenRuntimeKey(runtimeKey)).toBe(true)
    expect(isServiceCredentialRuntimeKey(runtimeKey)).toBe(false)
  })

  it("builds stable service-credential runtime keys", () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "service-secret",
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      },
      { canRotate: true },
    )

    expect(runtimeKey).toMatchObject({
      id: "service_credential:account-1:codex",
      source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
      accountId: account.id,
      accountName: account.name,
      siteType: account.siteType,
      label: "Codex",
      secret: "service-secret",
      baseUrl: "https://runtime.example.invalid",
      status: ACCOUNT_RUNTIME_KEY_STATUSES.Active,
      service: "codex",
      capabilities: {
        copy: true,
        export: true,
        verify: true,
        fetchRuntimeModels: true,
        rotate: true,
        updateToken: false,
        deleteToken: false,
      },
    })
    expect(isAccountTokenRuntimeKey(runtimeKey)).toBe(false)
    expect(isServiceCredentialRuntimeKey(runtimeKey)).toBe(true)
  })

  it("normalizes inactive service credentials without creating numeric identity", () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "",
      isAuthenticated: false,
    })

    expect(runtimeKey.id).toBe("service_credential:account-1:codex")
    expect(runtimeKey.status).toBe(ACCOUNT_RUNTIME_KEY_STATUSES.Inactive)
    expect(runtimeKey.secret).toBe("")
  })

  it("builds ids from source identity", () => {
    expect(buildAccountTokenRuntimeKeyId("account-1", 42)).toBe(
      "account_token:account-1:42",
    )
    expect(buildServiceCredentialRuntimeKeyId("account-1", "codex")).toBe(
      "service_credential:account-1:codex",
    )
  })

  it("keeps legacy token conversion behind an explicit helper", () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-secret",
      isAuthenticated: true,
    })

    expect(accountRuntimeKeyToLegacyApiToken(runtimeKey)).toMatchObject({
      id: ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
      name: "Codex",
      key: "service-secret",
      unlimited_quota: true,
    })
    expect(accountRuntimeKeyToLegacyAccountToken(runtimeKey)).toMatchObject({
      id: ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
      accountId: "account-1",
      accountName: "Example Account",
      name: "Codex",
      key: "service-secret",
    })
  })

  it("collects runtime-key and account secrets for sanitized errors", () => {
    const runtimeKeys = [
      buildAccountTokenRuntimeKey(account, token),
      buildServiceCredentialRuntimeKey(account, {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "service-secret",
        isAuthenticated: true,
      }),
    ]

    expect(collectAccountRuntimeKeySecrets(runtimeKeys)).toEqual([
      "sk-token-secret",
      "account-access-token",
      "session=redacted",
      "service-secret",
      "account-access-token",
      "session=redacted",
    ])
  })
})
```

- [ ] **Step 2: Run the failing model tests**

Run:

```bash
pnpm vitest run tests/services/accounts/accountRuntimeKeys.test.ts
```

Expected result: fail because `src/services/accounts/accountRuntimeKeys.ts` does not exist.

- [ ] **Step 3: Add the model implementation**

Create `src/services/accounts/accountRuntimeKeys.ts` using the code from the "Cross-Cutting Target Interface" section.

- [ ] **Step 4: Run the model tests**

Run:

```bash
pnpm vitest run tests/services/accounts/accountRuntimeKeys.test.ts
```

Expected result: pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git status --porcelain=v1
git add src/services/accounts/accountRuntimeKeys.ts tests/services/accounts/accountRuntimeKeys.test.ts
git commit -m "feat(accounts): add account runtime key model"
```

## Task 2: Account API Runtime Key Fetching And Secret Resolution

**Files:**

- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Update account API tests for runtime-key results**

In `tests/services/accounts/apiServiceRequest.test.ts`, update the service-credential runtime-key test that currently expects a transient `ApiToken` shape. The assertion should use this shape:

```ts
await expect(
  fetchDisplayAccountRuntimeKeys(serviceCredentialAccount as any),
).resolves.toEqual([
  expect.objectContaining({
    id: "service_credential:account-1:codex",
    source: "service_credential",
    accountId: "account-1",
    accountName: serviceCredentialAccount.name,
    label: "Codex",
    secret: "service-credential-secret",
    baseUrl: "https://runtime.example.invalid",
    service: "codex",
    capabilities: expect.objectContaining({
      rotate: true,
      updateToken: false,
      deleteToken: false,
    }),
  }),
])
```

Add a token-shaped compatibility test next to it:

```ts
it("exposes a clearly named compatibility helper for legacy token-shaped consumers", async () => {
  const result = await fetchDisplayAccountRuntimeKeyTokens(
    serviceCredentialAccount as any,
  )

  expect(result).toEqual([
    expect.objectContaining({
      id: ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
      name: "Codex",
      key: "service-credential-secret",
    }),
  ])
})
```

Add resolver coverage:

```ts
it("resolves service credential runtime key secrets through serviceCredential fetch", async () => {
  const [runtimeKey] = await fetchDisplayAccountRuntimeKeys(
    serviceCredentialAccount as any,
  )

  serviceCredentialFetchMock.mockResolvedValueOnce({
    kind: "singleton_service_key",
    service: "codex",
    label: "Codex",
    key: "fresh-service-secret",
    isAuthenticated: true,
  })

  await expect(
    resolveDisplayAccountRuntimeKeySecret(
      serviceCredentialAccount as any,
      runtimeKey,
    ),
  ).resolves.toMatchObject({
    ...runtimeKey,
    secret: "fresh-service-secret",
  })
})
```

- [ ] **Step 2: Run the account API tests to see the type contract fail**

Run:

```bash
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected result: fail because `fetchDisplayAccountRuntimeKeys` still returns `ApiToken[]` and the compatibility/runtime-key resolver functions are missing.

- [ ] **Step 3: Replace local transient token construction**

In `src/services/accounts/utils/apiServiceRequest.ts`, remove `SERVICE_CREDENTIAL_RUNTIME_TOKEN_ID` and `toServiceCredentialRuntimeToken`. Add imports:

```ts
import {
  accountRuntimeKeyToLegacyApiToken,
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
  formatAccountRuntimeKeySecretForSite,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
```

Replace the runtime-key fetcher with:

```ts
export async function fetchDisplayAccountRuntimeKeys(
  account: DisplayAccountApiSnapshot,
): Promise<AccountRuntimeKey[]> {
  const { keyManagement, serviceCredential, request } =
    createDisplayAccountApiContext(account)

  if (keyManagement || !serviceCredential) {
    const tokens = await fetchDisplayAccountTokens(account)
    return tokens.map((token) =>
      buildAccountTokenRuntimeKey(account, {
        ...token,
        accountId: account.id,
        accountName: account.name,
      }),
    )
  }

  const credential = await serviceCredential.fetch(request)
  if (!credential.key.trim()) return []

  return [
    buildServiceCredentialRuntimeKey(account, credential, {
      canRotate: typeof serviceCredential.rotate === "function",
    }),
  ]
}

export async function fetchDisplayAccountRuntimeKeyTokens(
  account: DisplayAccountApiSnapshot,
): Promise<ApiToken[]> {
  const runtimeKeys = await fetchDisplayAccountRuntimeKeys(account)
  return runtimeKeys.map(accountRuntimeKeyToLegacyApiToken)
}
```

Add the runtime-key resolver after `resolveDisplayAccountTokenForSecret`:

```ts
export async function resolveDisplayAccountRuntimeKeySecret<
  TRuntimeKey extends AccountRuntimeKey,
>(
  account: DisplayAccountApiSnapshot,
  runtimeKey: TRuntimeKey,
  options: ResolveDisplayAccountTokenForSecretOptions = {},
): Promise<TRuntimeKey> {
  if (isAccountTokenRuntimeKey(runtimeKey)) {
    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      account,
      runtimeKey.token,
      options,
    )
    return formatAccountRuntimeKeySecretForSite({
      ...runtimeKey,
      token: resolvedToken,
      secret: resolvedToken.key,
    })
  }

  if (isServiceCredentialRuntimeKey(runtimeKey)) {
    const { serviceCredential, request } = createDisplayAccountApiContext(account)
    const resolutionRequest = options.abortSignal
      ? { ...request, abortSignal: options.abortSignal }
      : request
    if (!serviceCredential) {
      throw new Error(
        `serviceCredential is not implemented for ${account.siteType}`,
      )
    }

    const credential = await serviceCredential.fetch(resolutionRequest)

    return formatAccountRuntimeKeySecretForSite({
      ...runtimeKey,
      credential,
      secret: credential.key,
      baseUrl: credential.baseUrl || account.baseUrl,
      status: credential.isAuthenticated ? "active" : "inactive",
    })
  }

  return runtimeKey
}
```

Keep `resolveDisplayAccountTokenForSecret` unchanged in this task so token-shaped callers compile until Task 7 removes obsolete compatibility paths.

- [ ] **Step 4: Run account API and model tests**

Run:

```bash
pnpm vitest run tests/services/accounts/accountRuntimeKeys.test.ts tests/services/accounts/apiServiceRequest.test.ts
```

Expected result: pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git status --porcelain=v1
git add src/services/accounts/utils/apiServiceRequest.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "feat(accounts): return account runtime keys"
```

## Task 3: Model List Runtime-Key Fallback

**Files:**

- Modify: `src/features/ModelList/modelManagementSources.ts`
- Modify: `src/services/modelList/accountSources/tokenScopedFallback.ts`
- Modify: `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`
- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Modify: `src/features/ModelList/components/StatusIndicator.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`

- [ ] **Step 1: Write failing runtime-key fallback source tests**

In `tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts`, add coverage for runtime-key source labels:

```ts
import {
  createAccountRuntimeKeyModelListSourceIdentity,
  MODEL_LIST_SOURCE_IDENTITY_KINDS,
} from "~/features/ModelList/modelManagementSources"

it("creates account runtime-key source identity", () => {
  expect(
    createAccountRuntimeKeyModelListSourceIdentity({
      accountId: "account-1",
      runtimeKeyId: "service_credential:account-1:codex",
      runtimeKeyName: "Codex",
    }),
  ).toEqual({
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
    id: "account-1:runtime-key:service_credential:account-1:codex",
    runtimeKeyId: "service_credential:account-1:codex",
    runtimeKeyName: "Codex",
  })
})
```

In `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`, add a service-credential runtime-key test that calls the new function name:

```ts
it("loads runtime catalog from a service-credential runtime key without token secret resolution", async () => {
  const runtimeKey = buildServiceCredentialRuntimeKey(account, {
    kind: "singleton_service_key",
    service: "codex",
    label: "Codex",
    key: "service-secret",
    isAuthenticated: true,
    baseUrl: "https://runtime.example.invalid",
  })

  modelCatalogFetchModelsMock.mockResolvedValueOnce(["claude-sonnet-4"])

  const result = await loadAccountRuntimeKeyFallbackPricingResponse({
    account,
    runtimeKey,
  })

  expect(resolveDisplayAccountRuntimeKeySecretMock).not.toHaveBeenCalled()
  expect(modelCatalogFetchModelsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: "https://runtime.example.invalid",
      auth: { authType: AuthTypeEnum.AccessToken, apiKey: "service-secret" },
    }),
  )
  expect(result.models.map((model) => model.id)).toEqual(["claude-sonnet-4"])
})
```

- [ ] **Step 2: Run failing Model List service tests**

Run:

```bash
pnpm vitest run tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts
```

Expected result: fail because runtime-key source identity and fallback function are missing.

- [ ] **Step 3: Add runtime-key model-list identity**

In `src/features/ModelList/modelManagementSources.ts`, extend source identity kinds:

```ts
export const MODEL_LIST_SOURCE_IDENTITY_KINDS = {
  ACCOUNT: "account",
  ACCOUNT_TOKEN: "account-token",
  ACCOUNT_RUNTIME_KEY: "account-runtime-key",
} as const
```

Extend `ModelListSourceIdentity`:

```ts
  | {
      kind: typeof MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY
      id: string
      runtimeKeyId: string
      runtimeKeyName?: string
    }
```

Add the creator:

```ts
/** Creates a runtime-key-scoped account source identity for model-list rows. */
export function createAccountRuntimeKeyModelListSourceIdentity(params: {
  accountId: string
  runtimeKeyId: string
  runtimeKeyName?: string
}): ModelListSourceIdentity {
  const runtimeKeyName = params.runtimeKeyName?.trim()

  return {
    kind: MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY,
    id: `${params.accountId}:runtime-key:${params.runtimeKeyId}`,
    runtimeKeyId: params.runtimeKeyId,
    ...(runtimeKeyName ? { runtimeKeyName } : {}),
  }
}
```

Update `src/features/ModelList/sourceLabels.ts` to handle the new kind:

```ts
if (
  sourceIdentity.kind ===
  MODEL_LIST_SOURCE_IDENTITY_KINDS.ACCOUNT_RUNTIME_KEY
) {
  return sourceIdentity.runtimeKeyName || sourceIdentity.runtimeKeyId
}
```

- [ ] **Step 4: Rename fallback params and consume runtime keys**

In `src/services/modelList/accountSources/tokenScopedFallback.ts`, change imports:

```ts
import {
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
```

Rename the params interface:

```ts
interface LoadAccountRuntimeKeyFallbackPricingParams {
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >
  runtimeKey: AccountRuntimeKey
  abortSignal?: AbortSignal
}
```

Update runtime catalog request to accept a base URL:

```ts
const createRuntimeCatalogRequest = (
  account: LoadAccountRuntimeKeyFallbackPricingParams["account"],
  runtimeKey: AccountRuntimeKey,
  apiKey: string,
  abortSignal?: AbortSignal,
): ModelCatalogRequest => ({
  baseUrl: runtimeKey.baseUrl || account.baseUrl,
  accountId: account.id,
  abortSignal,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey,
  },
})
```

Replace `resolveFallbackTokenSecret` with:

```ts
const resolveFallbackRuntimeKeySecret = async (
  params: LoadAccountRuntimeKeyFallbackPricingParams,
  readiness: ReturnType<typeof resolveModelListAccountSourceReadiness>,
) => {
  if (
    readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog &&
    !readiness.requiresTokenKeyResolution &&
    params.runtimeKey.secret.trim()
  ) {
    return params.runtimeKey
  }

  return params.abortSignal
    ? resolveDisplayAccountRuntimeKeySecret(
        params.account,
        params.runtimeKey,
        { abortSignal: params.abortSignal },
      )
    : resolveDisplayAccountRuntimeKeySecret(params.account, params.runtimeKey)
}
```

Rename the exported function and token references:

```ts
export async function loadAccountRuntimeKeyFallbackPricingResponse(
  params: LoadAccountRuntimeKeyFallbackPricingParams,
): Promise<PricingResponse> {
  const declaredModelIds = isAccountTokenRuntimeKey(params.runtimeKey)
    ? parseDelimitedList(params.runtimeKey.token.models)
    : []
  const readiness = resolveModelListAccountSourceReadiness(params.account)
  let resolvedRuntimeKeySecret = ""

  try {
    const resolvedRuntimeKey = await resolveFallbackRuntimeKeySecret(
      params,
      readiness,
    )
    resolvedRuntimeKeySecret = resolvedRuntimeKey.secret

    if (
      readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
    ) {
      const runtimeModelIds = await readiness.modelCatalog.fetchModels(
        createRuntimeCatalogRequest(
          params.account,
          resolvedRuntimeKey,
          resolvedRuntimeKey.secret,
          params.abortSignal,
        ),
      )

      return buildRuntimeModelCatalogPricingResponse(
        params.account,
        runtimeModelIds,
      )
    }

    return buildRuntimeModelCatalogPricingResponse(
      params.account,
      declaredModelIds,
    )
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new Error(ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED, {
      cause: toSanitizedErrorSummary(error, [resolvedRuntimeKeySecret]),
    })
  }
}
```

Keep this compatibility export until Task 7 removes the last caller:

```ts
export const loadAccountTokenFallbackPricingResponse =
  loadAccountRuntimeKeyFallbackPricingResponse
```

- [ ] **Step 5: Migrate `useModelData` account fallback state**

In `src/features/ModelList/hooks/useModelData.ts`, replace the fallback control type fields:

```ts
type AccountFallbackControls = {
  isAvailable: boolean
  statusScope: "account" | "runtime-key"
  runtimeKeys: AccountRuntimeKey[]
  selectedRuntimeKeyId: string | null
  setSelectedRuntimeKeyId: (runtimeKeyId: string | null) => void
  isLoadingRuntimeKeys: boolean
  hasLoadedRuntimeKeys: boolean
  runtimeKeyLoadErrorMessage: string | null
  catalogLoadErrorMessage: string | null
  isLoadingCatalog: boolean
  isActive: boolean
  activeRuntimeKeyName: string | null
  loadRuntimeKeys: () => Promise<void>
  loadCatalog: () => Promise<void>
}
```

Update runtime-key loading:

```ts
const loadAccountFallbackRuntimeKeys = useCallback(async () => {
  if (!currentAccount) return

  setAccountFallbackRuntimeKeyState((state) => ({
    ...state,
    isLoading: true,
    errorMessage: null,
  }))

  try {
    const runtimeKeys = (await fetchDisplayAccountRuntimeKeys(currentAccount))
      .filter((runtimeKey) => runtimeKey.secret.trim())

    setAccountFallbackRuntimeKeyState({
      hasLoaded: true,
      isLoading: false,
      runtimeKeys,
      selectedRuntimeKeyId:
        runtimeKeys.length === 1 ? runtimeKeys[0].id : null,
      errorMessage: null,
    })
  } catch (error) {
    setAccountFallbackRuntimeKeyState({
      hasLoaded: true,
      isLoading: false,
      runtimeKeys: [],
      selectedRuntimeKeyId: null,
      errorMessage: toSanitizedErrorSummary(error),
    })
  }
}, [currentAccount])
```

Update catalog loading:

```ts
const selectedRuntimeKey = accountFallbackRuntimeKeyState.runtimeKeys.find(
  (runtimeKey) =>
    runtimeKey.id === accountFallbackRuntimeKeyState.selectedRuntimeKeyId,
)

if (!selectedRuntimeKey) {
  return
}

const response = await loadAccountRuntimeKeyFallbackPricingResponse({
  account: currentAccount,
  runtimeKey: selectedRuntimeKey,
  abortSignal,
})
```

Use `createAccountRuntimeKeyModelListSourceIdentity` when adding fallback model rows:

```ts
sourceIdentity: createAccountRuntimeKeyModelListSourceIdentity({
  accountId: currentAccount.id,
  runtimeKeyId: selectedRuntimeKey.id,
  runtimeKeyName: selectedRuntimeKey.label,
}),
```

- [ ] **Step 6: Update `StatusIndicator` fallback props**

In `src/features/ModelList/components/StatusIndicator.tsx`, replace token field reads:

```ts
const requiresExplicitSelection = accountFallback.runtimeKeys.length > 1

value={
  accountFallback.selectedRuntimeKeyId === null
    ? ""
    : accountFallback.selectedRuntimeKeyId
}
onValueChange={(value) =>
  accountFallback.setSelectedRuntimeKeyId(value || null)
}
```

Render options from runtime keys:

```tsx
{accountFallback.runtimeKeys.map((runtimeKey) => (
  <SelectItem key={runtimeKey.id} value={runtimeKey.id}>
    {runtimeKey.label}
  </SelectItem>
))}
```

Keep current translation keys in this task. Rename visible copy in Task 7 only if product wording changes are accepted in the same implementation branch.

- [ ] **Step 7: Run Model List focused tests**

Run:

```bash
pnpm vitest run tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
```

Expected result: pass after updating test mocks from `tokens` and `selectedTokenId` to `runtimeKeys` and `selectedRuntimeKeyId`.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git status --porcelain=v1
git add src/features/ModelList/modelManagementSources.ts src/features/ModelList/sourceLabels.ts src/services/modelList/accountSources/tokenScopedFallback.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/components/StatusIndicator.tsx tests/entrypoints/options/pages/ModelList/sourceLabels.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
git commit -m "feat(model-list): use account runtime keys for fallback catalogs"
```

## Task 4: Verification Dialog Runtime Keys

**Files:**

- Modify: `src/components/dialogs/VerifyApiDialog/index.tsx`
- Modify: `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
- Modify: `src/features/ModelList/components/BatchVerifyModelsDialog.tsx`
- Modify: `tests/components/VerifyApiDialog.test.tsx`
- Modify: `tests/components/VerifyCliSupportDialog.test.tsx`
- Modify: `tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx`

- [ ] **Step 1: Update verification tests to use runtime-key mocks**

In each affected test mock for `~/services/accounts/utils/apiServiceRequest`, expose:

```ts
fetchDisplayAccountRuntimeKeys: (...args: unknown[]) =>
  fetchDisplayAccountRuntimeKeysMock(...args),
resolveDisplayAccountRuntimeKeySecret: (...args: unknown[]) =>
  resolveDisplayAccountRuntimeKeySecretMock(...args),
```

For the service-credential case, mock a runtime key:

```ts
const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(account, {
  kind: "singleton_service_key",
  service: "codex",
  label: "Codex",
  key: "service-secret",
  isAuthenticated: true,
})

fetchDisplayAccountRuntimeKeysMock.mockResolvedValueOnce([
  serviceCredentialRuntimeKey,
])
resolveDisplayAccountRuntimeKeySecretMock.mockResolvedValueOnce(
  serviceCredentialRuntimeKey,
)
```

Assert the resolver receives the runtime key:

```ts
expect(resolveDisplayAccountRuntimeKeySecretMock).toHaveBeenCalledWith(
  account,
  serviceCredentialRuntimeKey,
  expect.any(Object),
)
```

- [ ] **Step 2: Run verification dialog tests to see missing resolver usage**

Run:

```bash
pnpm vitest run tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx
```

Expected result: fail because components still import `resolveDisplayAccountTokenForSecret`.

- [ ] **Step 3: Update verification components**

Replace imports in all three components:

```ts
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
```

Replace local token state with runtime-key state:

```ts
const [accountRuntimeKeys, setAccountRuntimeKeys] = useState<
  AccountRuntimeKey[]
>([])
const [selectedRuntimeKeyId, setSelectedRuntimeKeyId] = useState<string | null>(
  null,
)
```

When loading keys:

```ts
const runtimeKeys = await fetchDisplayAccountRuntimeKeys(account)
setAccountRuntimeKeys(runtimeKeys)
setSelectedRuntimeKeyId(runtimeKeys.length === 1 ? runtimeKeys[0].id : null)
```

When resolving a selected key:

```ts
const runtimeKey = accountRuntimeKeys.find(
  (item) => item.id === selectedRuntimeKeyId,
)
if (!runtimeKey) return

const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
  account,
  runtimeKey,
  { abortSignal },
)
```

Pass `resolvedRuntimeKey.secret` and `resolvedRuntimeKey.baseUrl` into verification requests. Do not convert to `ApiToken` inside these verification components.

- [ ] **Step 4: Run verification dialog tests**

Run:

```bash
pnpm vitest run tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx
```

Expected result: pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git status --porcelain=v1
git add src/components/dialogs/VerifyApiDialog/index.tsx src/components/dialogs/VerifyCliSupportDialog/index.tsx src/features/ModelList/components/BatchVerifyModelsDialog.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx
git commit -m "feat(verification): verify account runtime keys directly"
```

## Task 5: Key Management Runtime-Key Entries

**Files:**

- Modify: `src/features/KeyManagement/types.ts`
- Modify: `src/features/KeyManagement/utils.ts`
- Modify: `tests/features/KeyManagement/utils.test.ts`
- Modify: `src/features/KeyManagement/hooks/useKeyManagement.ts`
- Modify: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
- Modify: `src/features/KeyManagement/components/TokenList.tsx`
- Modify: `tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx`
- Modify: `src/features/KeyManagement/components/ServiceCredentialCard.tsx`

- [ ] **Step 1: Update Key Management type tests and utility tests**

In `tests/features/KeyManagement/utils.test.ts`, remove `buildServiceCredentialTransientToken` expectations. Add identity tests:

```ts
import {
  buildAccountRuntimeKeyEntryIdentityKey,
  buildRuntimeKeyIdentityKey,
} from "~/features/KeyManagement/utils"

it("uses runtime-key ids for entry identity", () => {
  expect(buildRuntimeKeyIdentityKey("service_credential:account-1:codex")).toBe(
    "service_credential:account-1:codex",
  )
  expect(
    buildAccountRuntimeKeyEntryIdentityKey(
      "service_credential:account-1:codex",
    ),
  ).toBe("runtime_key:service_credential:account-1:codex")
})
```

In `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`, update service-credential entry assertions:

```ts
expect(result.current.entries).toContainEqual(
  expect.objectContaining({
    id: "runtime_key:service_credential:account-1:codex",
    runtimeKey: expect.objectContaining({
      id: "service_credential:account-1:codex",
      source: "service_credential",
      label: "Codex",
      capabilities: expect.objectContaining({
        updateToken: false,
        deleteToken: false,
        rotate: true,
      }),
    }),
    uiState: expect.objectContaining({
      isRotating: false,
    }),
  }),
)
```

- [ ] **Step 2: Run Key Management focused tests to see old union failures**

Run:

```bash
pnpm vitest run tests/features/KeyManagement/utils.test.ts tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
```

Expected result: fail because `KeyManagementEntry` still uses `kind` and separate token/service credential fields.

- [ ] **Step 3: Replace Key Management entry types**

In `src/features/KeyManagement/types.ts`, replace `AccountTokenKeyManagementEntry`, `ServiceCredentialKeyManagementEntry`, and mixed save/export entry unions with:

```ts
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"

export type ServiceCredentialState = {
  status: "idle" | "loading" | "loaded" | "error"
  credential?: AccountServiceCredential
  errorMessage?: string
  isRotating?: boolean
}

export type KeyManagementEntry = {
  id: string
  runtimeKey: AccountRuntimeKey
  uiState: {
    isRotating?: boolean
  }
}

export type ApiCredentialProfileSaveEntry = KeyManagementEntry

export type CliProxyExportEntry = KeyManagementEntry
```

- [ ] **Step 4: Replace Key Management utility helpers**

In `src/features/KeyManagement/utils.ts`, remove imports of `AccountServiceCredential`, `AccountToken`, and `DisplaySiteData` if only used for transient token construction. Replace entry id helpers with:

```ts
export const buildRuntimeKeyIdentityKey = (runtimeKeyId: string) =>
  runtimeKeyId

export const buildAccountRuntimeKeyEntryIdentityKey = (
  runtimeKeyId: string,
) => ["runtime_key", buildRuntimeKeyIdentityKey(runtimeKeyId)].join(":")
```

Keep `buildTokenIdentityKey`, `formatKey`, and `formatQuota` until token-only row components are migrated or confirmed unused.

- [ ] **Step 5: Build entries from runtime keys in `useKeyManagement`**

In `src/features/KeyManagement/hooks/useKeyManagement.ts`, import:

```ts
import {
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
```

Replace token entry construction:

```ts
const tokenEntries: KeyManagementEntry[] = tokens
  .map((token): KeyManagementEntry | null => {
    const account = accountMap.get(token.accountId)
    if (!account) return null
    const runtimeKey = buildAccountTokenRuntimeKey(account, token)

    return {
      id: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
      runtimeKey,
      uiState: {},
    }
  })
  .filter((entry): entry is KeyManagementEntry => entry !== null)
```

Replace service credential entry construction:

```ts
const serviceCredentialEntries: KeyManagementEntry[] = accounts
  .map((account): KeyManagementEntry | null => {
    const credentialState = serviceCredentialStates[account.id]
    const credential = credentialState?.credential
    if (!credential) return null

    const runtimeKey = buildServiceCredentialRuntimeKey(account, credential, {
      canRotate: canRotateAccountServiceCredential(account),
    })

    return {
      id: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
      runtimeKey,
      uiState: {
        isRotating: credentialState.isRotating === true,
      },
    }
  })
  .filter((entry): entry is KeyManagementEntry => entry !== null)
```

Replace token CRUD checks:

```ts
if (!isAccountTokenRuntimeKey(entry.runtimeKey)) {
  return
}

const token = entry.runtimeKey.token
```

Replace service credential rotate checks:

```ts
if (!isServiceCredentialRuntimeKey(entry.runtimeKey)) {
  return
}

const credential = entry.runtimeKey.credential
```

- [ ] **Step 6: Update `TokenList` selected entry projections**

In `src/features/KeyManagement/components/TokenList.tsx`, import guards:

```ts
import {
  accountRuntimeKeyToLegacyAccountToken,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
```

Replace selected managed-site export items:

```ts
const selectedManagedSiteItems = useMemo(
  (): ManagedSiteTokenBatchExportItemInput[] =>
    selectedEntries
      .filter((entry) => isAccountTokenRuntimeKey(entry.runtimeKey))
      .map((entry) => ({
        account: entry.runtimeKey.account,
        runtimeKey: entry.runtimeKey,
      })),
  [selectedEntries],
)
```

Replace selected API profile and CLIProxy items:

```ts
const selectedApiProfileItems = useMemo(
  (): ApiCredentialProfileSaveEntry[] => selectedEntries,
  [selectedEntries],
)

const selectedCliProxyExportItems = useMemo(
  (): CliProxyExportEntry[] => selectedEntries,
  [selectedEntries],
)
```

Where a token-only row component still needs `AccountToken`, use:

```ts
const token = isAccountTokenRuntimeKey(entry.runtimeKey)
  ? entry.runtimeKey.token
  : accountRuntimeKeyToLegacyAccountToken(entry.runtimeKey)
```

Do not use `token.id` for React keys, selection ids, or product identity.

- [ ] **Step 7: Run Key Management tests**

Run:

```bash
pnpm vitest run tests/features/KeyManagement/utils.test.ts tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
```

Expected result: pass after updating test fixture entries from `kind/account/token/credential` to `id/runtimeKey/uiState`.

- [ ] **Step 8: Commit Task 5**

Run:

```bash
git status --porcelain=v1
git add src/features/KeyManagement/types.ts src/features/KeyManagement/utils.ts src/features/KeyManagement/hooks/useKeyManagement.ts src/features/KeyManagement/components/TokenList.tsx src/features/KeyManagement/components/ServiceCredentialCard.tsx tests/features/KeyManagement/utils.test.ts tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
git commit -m "feat(key-management): use runtime-key entries"
```

## Task 6: API Profile And CLIProxy Runtime-Key Exports

**Files:**

- Modify: `src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx`
- Modify: `tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts`
- Modify: `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx`
- Modify: `tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx`

- [ ] **Step 1: Update API profile save tests**

In `tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts`, import runtime-key builders:

```ts
import {
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
```

Replace service-credential item fixture:

```ts
const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(account, {
  kind: "singleton_service_key",
  service: "codex",
  label: "Codex",
  key: "service-secret",
  isAuthenticated: true,
  baseUrl: "https://runtime.example.invalid",
})

const items = [
  {
    id: "runtime_key:service_credential:account-1:codex",
    runtimeKey: serviceCredentialRuntimeKey,
    uiState: {},
  },
]
```

Assert token-secret resolution is not called:

```ts
expect(resolveRuntimeKeySecretMock).not.toHaveBeenCalled()
expect(createProfileFromAccountTokenMock).toHaveBeenCalledWith(
  expect.objectContaining({
    baseUrl: "https://runtime.example.invalid",
    token: {
      name: "Codex",
      key: "service-secret",
    },
  }),
)
```

- [ ] **Step 2: Update CLIProxy export tests**

In `tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx`, replace mixed `kind` fixtures with runtime-key entry fixtures:

```ts
const serviceCredentialEntry = {
  id: "runtime_key:service_credential:account-1:codex",
  runtimeKey: buildServiceCredentialRuntimeKey(account, {
    kind: "singleton_service_key",
    service: "codex",
    label: "Codex",
    key: "service-secret",
    isAuthenticated: true,
    baseUrl: "https://runtime.example.invalid",
  }),
  uiState: {},
}
```

Assert exported provider metadata:

```ts
expect(saveCliProxyConfigMock).toHaveBeenCalledWith(
  expect.objectContaining({
    providers: expect.arrayContaining([
      expect.objectContaining({
        name: "Example Account / Codex",
        baseUrl: "https://runtime.example.invalid",
        apiKey: "service-secret",
      }),
    ]),
  }),
)
```

- [ ] **Step 3: Run failing export tests**

Run:

```bash
pnpm vitest run tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx
```

Expected result: fail because save/export utilities still branch on Key Management entry kinds.

- [ ] **Step 4: Rename and implement runtime-key API profile save**

In `src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx`, replace mixed item types with:

```ts
import {
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"

type ApiCredentialProfileBatchSaveItem = {
  runtimeKey: AccountRuntimeKey
}

type ResolveRuntimeKeySecret = NonNullable<
  SaveAccountRuntimeKeysToApiCredentialProfilesParams["resolveRuntimeKeySecret"]
>

interface SaveAccountRuntimeKeysToApiCredentialProfilesParams {
  items: ApiCredentialProfileBatchSaveItem[]
  t: TFunction
  logger: OneTimeKeySaveLogger
  source: string
  resolveRuntimeKeySecret?: (
    account: AccountRuntimeKey["account"],
    runtimeKey: AccountRuntimeKey,
  ) => Promise<AccountRuntimeKey>
}
```

Replace normalization:

```ts
const normalizeBatchSaveItem = async (
  item: ApiCredentialProfileBatchSaveItem,
  resolveRuntimeKeySecret: ResolveRuntimeKeySecret,
) => {
  const { runtimeKey } = item
  const resolvedRuntimeKey = isAccountTokenRuntimeKey(runtimeKey)
    ? await resolveRuntimeKeySecret(runtimeKey.account, runtimeKey)
    : runtimeKey

  return {
    account: runtimeKey.account,
    fallbackAccountName: runtimeKey.accountName,
    baseUrl: resolvedRuntimeKey.baseUrl,
    token: {
      name: resolvedRuntimeKey.label,
      key: resolvedRuntimeKey.secret,
    },
  }
}
```

Rename the exported function:

```ts
export async function saveAccountRuntimeKeysToApiCredentialProfiles({
  items,
  t,
  logger,
  source,
  resolveRuntimeKeySecret = resolveDisplayAccountRuntimeKeySecret,
}: SaveAccountRuntimeKeysToApiCredentialProfilesParams): Promise<{
  savedCount: number
}> {
  let savedCount = 0

  try {
    for (const item of items) {
      const { account, fallbackAccountName, baseUrl, token } =
        await normalizeBatchSaveItem(item, resolveRuntimeKeySecret)
      await createApiCredentialProfileFromToken({
        accountName: account.name,
        fallbackAccountName,
        baseUrl,
        siteType: account.siteType,
        tagIds: account.tagIds ?? [],
        token,
      })
      savedCount += 1
    }

    toast.success(/* keep existing toast JSX */)
    return { savedCount: items.length }
  } catch (error) {
    const secretValues = collectAccountRuntimeKeySecrets(
      items.map((item) => item.runtimeKey),
    )
    logger.error(`Failed to save selected runtime keys from ${source}`, {
      message: toSanitizedErrorSummary(error, secretValues),
    })
    toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
    throw error
  }
}
```

Update callers from `saveApiTokensToApiCredentialProfiles` to `saveAccountRuntimeKeysToApiCredentialProfiles`.

- [ ] **Step 5: Update CLIProxy export dialog**

In `src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx`, replace kind helpers:

```ts
import {
  accountRuntimeKeyToLegacyApiToken,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
```

Use runtime-key fields:

```ts
function buildProviderName(item: CliProxyExportEntry) {
  return `${item.runtimeKey.accountName} / ${item.runtimeKey.label}`
}

function getEntryTokenName(item: CliProxyExportEntry) {
  return item.runtimeKey.label
}

function getEntryBaseUrl(item: CliProxyExportEntry) {
  return item.runtimeKey.baseUrl
}

async function resolveCliProxyExportToken(
  item: CliProxyExportEntry,
): Promise<ApiToken> {
  return accountRuntimeKeyToLegacyApiToken(item.runtimeKey)
}
```

Keep legacy conversion in this dialog only because CLIProxy export generation still expects `ApiToken`-shaped input.

- [ ] **Step 6: Run export tests**

Run:

```bash
pnpm vitest run tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx
```

Expected result: pass.

- [ ] **Step 7: Commit Task 6**

Run:

```bash
git status --porcelain=v1
git add src/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.tsx src/features/KeyManagement/components/BatchCliProxyExportDialog.tsx tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx
git commit -m "feat(exports): save and export account runtime keys"
```

## Task 7: Managed-Site Batch Export Runtime Keys And Cleanup

**Files:**

- Modify: `src/types/managedSiteTokenBatchExport.ts`
- Modify: `src/services/managedSites/tokenBatchExport.ts`
- Modify: `tests/services/managedSites/tokenBatchExport.test.ts`
- Modify: `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`
- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Modify: any tests found by the grep commands in this task.

- [ ] **Step 1: Update managed-site export tests**

In `tests/services/managedSites/tokenBatchExport.test.ts`, replace service-credential input with:

```ts
const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(account, {
  kind: "singleton_service_key",
  service: "codex",
  label: "Codex",
  key: "service-secret",
  isAuthenticated: true,
  baseUrl: "https://runtime.example.invalid",
})

const input = {
  account,
  runtimeKey: serviceCredentialRuntimeKey,
}
```

Update preview assertions:

```ts
expect(preview.items[0]).toMatchObject({
  id: "service_credential:account-1:codex",
  accountId: "account-1",
  accountName: "Example Account",
  runtimeKeyId: "service_credential:account-1:codex",
  runtimeKeyName: "Codex",
})
expect(mockResolveDisplayAccountTokenForSecret).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run failing managed-site export tests**

Run:

```bash
pnpm vitest run tests/services/managedSites/tokenBatchExport.test.ts
```

Expected result: fail because managed-site export types still use token/service credential input unions.

- [ ] **Step 3: Replace managed-site export input and preview types**

In `src/types/managedSiteTokenBatchExport.ts`, replace `MANAGED_SITE_TOKEN_BATCH_EXPORT_ITEM_KINDS` and `ManagedSiteTokenBatchExportItemInput` with:

```ts
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"

export type ManagedSiteTokenBatchExportItemInput = {
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
}
```

Replace preview token fields:

```ts
export interface ManagedSiteTokenBatchExportPreviewItem {
  id: string
  accountId: string
  accountName: string
  runtimeKeyId: string
  runtimeKeyName: string
  draft: ChannelFormData | null
  status: ManagedSiteTokenBatchExportPreviewStatus
  warningCodes: ManagedSiteTokenBatchExportWarningCode[]
  blockingReasonCode?: ManagedSiteTokenBatchExportBlockedReasonCode
  blockingMessage?: string
  matchedChannel?: ManagedSiteTokenBatchExportMatchedChannel
}
```

Update `ManagedSiteTokenBatchExportExecutionItem`:

```ts
export interface ManagedSiteTokenBatchExportExecutionItem {
  id: string
  accountName: string
  runtimeKeyName: string
  success: boolean
  skipped: boolean
  error?: string
}
```

- [ ] **Step 4: Update managed-site export implementation**

In `src/services/managedSites/tokenBatchExport.ts`, import guards and conversion:

```ts
import {
  accountRuntimeKeyToLegacyAccountToken,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
```

Remove `buildTransientTokenFromServiceCredential`.

Replace preview id and token name helpers:

```ts
const getInputRuntimeKeyId = (input: ManagedSiteTokenBatchExportItemInput) =>
  input.runtimeKey.id

const getInputRuntimeKeyName = (input: ManagedSiteTokenBatchExportItemInput) =>
  input.runtimeKey.label
```

Replace account/token resolution:

```ts
const resolveInputRuntimeKeyForManagedSiteExport = async (
  input: ManagedSiteTokenBatchExportItemInput,
): Promise<AccountRuntimeKey> => {
  if (!isAccountTokenRuntimeKey(input.runtimeKey)) {
    return input.runtimeKey
  }

  return resolveDisplayAccountRuntimeKeySecret(
    input.account,
    input.runtimeKey,
  )
}

const resolveInputTokenForManagedSiteExport = async (
  input: ManagedSiteTokenBatchExportItemInput,
): Promise<AccountToken> =>
  accountRuntimeKeyToLegacyAccountToken(
    await resolveInputRuntimeKeyForManagedSiteExport(input),
  )
```

When building draft account data, use the runtime key base URL:

```ts
const resolveInputAccountForManagedSiteExport = (
  input: ManagedSiteTokenBatchExportItemInput,
): DisplaySiteData => ({
  ...input.account,
  baseUrl: input.runtimeKey.baseUrl || input.account.baseUrl,
})
```

When building preview items:

```ts
const buildPreviewItem = (
  input: ManagedSiteTokenBatchExportItemInput,
  fields: Omit<
    ManagedSiteTokenBatchExportPreviewItem,
    "id" | "accountId" | "accountName" | "runtimeKeyId" | "runtimeKeyName"
  >,
): ManagedSiteTokenBatchExportPreviewItem => ({
  id: getInputRuntimeKeyId(input),
  accountId: input.account.id,
  accountName: input.account.name,
  runtimeKeyId: input.runtimeKey.id,
  runtimeKeyName: input.runtimeKey.label,
  ...fields,
})
```

- [ ] **Step 5: Update managed-site export dialog field names**

In `src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx`, replace display references:

```tsx
{item.runtimeKeyName}
```

Replace execution-result references:

```tsx
{item.runtimeKeyName}
```

Keep translation keys unchanged in this task if current copy still says "key" generically. If visible copy says "token" for a mixed service-credential row, change the Chinese locale key in `src/locales/zh-CN/keyManagement.json`, then run `pnpm run i18n:extract:ci`.

- [ ] **Step 6: Remove remaining compatibility helpers that have no callers**

Run:

```bash
rg -n "fetchDisplayAccountRuntimeKeyTokens|loadAccountTokenFallbackPricingResponse|buildServiceCredentialTransientToken|buildTransientTokenFromServiceCredential|toServiceCredentialRuntimeToken|SERVICE_CREDENTIAL_RUNTIME_TOKEN_ID|SERVICE_CREDENTIAL_TRANSIENT_TOKEN_ID" src tests
```

For each hit:

- remove `fetchDisplayAccountRuntimeKeyTokens` if no source file imports it;
- remove `loadAccountTokenFallbackPricingResponse` compatibility export if no source file imports it;
- remove all local transient service-credential token builders;
- keep only `ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID` and `accountRuntimeKeyToLegacyApiToken` in `src/services/accounts/accountRuntimeKeys.ts`.

Run:

```bash
rg -n "resolveDisplayAccountTokenForSecret\\(.*runtime|resolveDisplayAccountTokenForSecret\\(.*credential|selectedTokenId|setSelectedTokenId|accountFallback\\.tokens" src tests
```

For each hit in a mixed runtime-key flow, replace it with runtime-key state or `resolveDisplayAccountRuntimeKeySecret`. Keep hits in real token CRUD flows.

- [ ] **Step 7: Run managed-site and cleanup tests**

Run:

```bash
pnpm vitest run tests/services/managedSites/tokenBatchExport.test.ts tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
```

Expected result: pass.

- [ ] **Step 8: Commit Task 7**

Run:

```bash
git status --porcelain=v1
git add src/types/managedSiteTokenBatchExport.ts src/services/managedSites/tokenBatchExport.ts src/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog.tsx tests/services/managedSites/tokenBatchExport.test.ts tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx
git commit -m "feat(managed-sites): export account runtime keys"
```

## Task 8: Final Contract Validation

**Files:**

- Inspect final diff across all task-scoped files.
- Modify: `src/locales/**` only if Task 7 changed visible copy.

- [ ] **Step 1: Run contract greps**

Run:

```bash
rg -n "toServiceCredentialRuntimeToken|buildServiceCredentialTransientToken|buildTransientTokenFromServiceCredential|SERVICE_CREDENTIAL_RUNTIME_TOKEN_ID|SERVICE_CREDENTIAL_TRANSIENT_TOKEN_ID" src tests
```

Expected result: no matches.

Run:

```bash
rg -n "id:\\s*-1|id:\\s*0" src/services src/features tests | rg -n "credential|runtime|service"
```

Expected result: no service-credential runtime-key selection or identity code uses numeric fake ids. A match for `ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID = -1` in `src/services/accounts/accountRuntimeKeys.ts` is allowed.

Run:

```bash
rg -n "runtime key|runtime-key|service credential|service-credential" src/services/accounts src/features/KeyManagement src/features/ModelList tests/services/accounts tests/entrypoints/options/pages/KeyManagement tests/entrypoints/options/pages/ModelList
```

Expected result: mixed-flow comments and tests use runtime-key or service-credential terms. Real token CRUD tests may still say token.

- [ ] **Step 2: Run focused suites**

Run:

```bash
pnpm vitest run tests/services/accounts/accountRuntimeKeys.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx tests/features/KeyManagement/utils.test.ts tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/TokenList.batchExport.test.tsx tests/features/TokenProvisioning/utils/apiCredentialProfileSaveAction.test.ts tests/features/KeyManagement/components/BatchCliProxyExportDialog.test.tsx tests/services/managedSites/tokenBatchExport.test.ts
```

Expected result: pass.

- [ ] **Step 3: Run TypeScript and repo gates**

Run:

```bash
pnpm compile
pnpm run validate:staged
pnpm run validate:push
```

Expected result: all commands pass. `validate:push` is required because this migration changes shared service contracts, exported types, and feature wiring where `knip` should catch stale compatibility exports.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git diff --check
git status --porcelain=v1
```

Expected result:

- task-scoped files only;
- no whitespace errors;
- unrelated untracked files remain unstaged;
- no generated artifacts are added unless they are locale extraction outputs caused by intentional visible copy changes.

- [ ] **Step 5: Commit final cleanup if needed**

If Task 8 produced cleanup edits after Task 7, commit them:

```bash
git add <task-scoped-files-from-task-8>
git commit -m "refactor(accounts): remove transient runtime key compatibility"
```

If Task 8 only ran validation and produced no diff, do not create an empty commit.

## Execution Notes

- Keep `AccountToken` for real token inventory, token CRUD, token metadata, token update, and token delete paths.
- Keep `AccountServiceCredential` for adapter-level fetch and rotate facts.
- Use `AccountRuntimeKey` for copy, verification, model probing, profile save, CLIProxy export, and managed-site export rows that can be backed by either a real token or a service credential.
- Do not use `ApiToken.id`, `AccountToken.id`, `0`, or `-1` as the product identity for service credentials.
- Only `src/services/accounts/accountRuntimeKeys.ts` may convert service credentials to token-shaped objects, and only through explicitly named legacy helpers.
- Use `example.invalid` domains and redacted placeholder secrets in new tests.
- Commit after each task so review can stop or bisect at a working slice.
