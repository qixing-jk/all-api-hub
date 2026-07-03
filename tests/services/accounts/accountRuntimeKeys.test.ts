import { describe, expect, it } from "vitest"

import {
  ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
  ACCOUNT_RUNTIME_KEY_SOURCES,
  ACCOUNT_RUNTIME_KEY_STATUSES,
  accountRuntimeKeyToLegacyAccountToken,
  accountRuntimeKeyToLegacyApiToken,
  buildAccountTokenRuntimeKey,
  buildAccountTokenRuntimeKeyId,
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
  buildServiceCredentialRuntimeKeyId,
  collectAccountRuntimeKeySecrets,
  findDefaultSelectableAccountRuntimeKey,
  formatAccountRuntimeKeySecretForSite,
  hasUsableAccountRuntimeKeySecret,
  isAccountTokenRuntimeKey,
  isActiveAccountRuntimeKey,
  isSelectableAccountRuntimeKey,
  isServiceCredentialRuntimeKey,
  sortAccountRuntimeKeysActiveFirst,
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

  it("maps account-token statuses to runtime-key statuses", () => {
    expect(
      buildAccountTokenRuntimeKey(account, { ...token, status: 2 }).status,
    ).toBe(ACCOUNT_RUNTIME_KEY_STATUSES.Inactive)
    expect(
      buildAccountTokenRuntimeKey(account, { ...token, status: 99 }).status,
    ).toBe(ACCOUNT_RUNTIME_KEY_STATUSES.Unknown)
  })

  it("builds display-account token runtime keys with normalized account fields", () => {
    const runtimeKey = buildDisplayAccountTokenRuntimeKey(
      {
        ...account,
        name: "",
        tagIds: undefined,
      },
      {
        ...token,
        accountId: undefined as unknown as string,
        accountName: undefined as unknown as string,
      },
    )

    expect(runtimeKey.account).toMatchObject({
      id: account.id,
      name: account.id,
      tagIds: [],
    })
    expect(runtimeKey.accountName).toBe(account.id)
    expect(runtimeKey.token).toMatchObject({
      accountId: account.id,
      accountName: account.id,
    })
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
      key: "stale-service-secret",
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

  it("detects active runtime keys with a usable secret", () => {
    const activeRuntimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-secret",
      isAuthenticated: true,
    })
    const inactiveRuntimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "stale-service-secret",
      isAuthenticated: false,
    })

    expect(hasUsableAccountRuntimeKeySecret(activeRuntimeKey)).toBe(true)
    expect(hasUsableAccountRuntimeKeySecret(inactiveRuntimeKey)).toBe(false)
    expect(
      hasUsableAccountRuntimeKeySecret({
        ...activeRuntimeKey,
        secret: "   ",
      }),
    ).toBe(false)
  })

  it("sorts runtime keys with active entries first without mutating input", () => {
    const inactiveRuntimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "stale-service-secret",
      isAuthenticated: false,
    })
    const activeRuntimeKey = buildAccountTokenRuntimeKey(account, token)
    const runtimeKeys = [inactiveRuntimeKey, activeRuntimeKey]

    expect(isActiveAccountRuntimeKey(activeRuntimeKey)).toBe(true)
    expect(sortAccountRuntimeKeysActiveFirst(runtimeKeys)).toEqual([
      activeRuntimeKey,
      inactiveRuntimeKey,
    ])
    expect(runtimeKeys).toEqual([inactiveRuntimeKey, activeRuntimeKey])
  })

  it("keeps account tokens selectable while requiring service credentials to expose a usable secret", () => {
    const accountTokenRuntimeKey = buildAccountTokenRuntimeKey(account, {
      ...token,
      key: "",
      status: 2,
    })
    const activeServiceRuntimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-secret",
      isAuthenticated: true,
    })
    const inactiveServiceRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "stale-service-secret",
        isAuthenticated: false,
      },
    )

    expect(isSelectableAccountRuntimeKey(accountTokenRuntimeKey)).toBe(true)
    expect(isSelectableAccountRuntimeKey(activeServiceRuntimeKey)).toBe(true)
    expect(isSelectableAccountRuntimeKey(inactiveServiceRuntimeKey)).toBe(false)
  })

  it("selects the first active selectable runtime key and falls back to account tokens", () => {
    const inactiveServiceRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "stale-service-secret",
        isAuthenticated: false,
      },
    )
    const accountTokenRuntimeKey = buildAccountTokenRuntimeKey(account, {
      ...token,
      status: 2,
    })
    const activeServiceRuntimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-secret",
      isAuthenticated: true,
    })

    expect(
      findDefaultSelectableAccountRuntimeKey([
        inactiveServiceRuntimeKey,
        accountTokenRuntimeKey,
        activeServiceRuntimeKey,
      ]),
    ).toBe(activeServiceRuntimeKey)
    expect(
      findDefaultSelectableAccountRuntimeKey([
        inactiveServiceRuntimeKey,
        accountTokenRuntimeKey,
      ]),
    ).toBe(accountTokenRuntimeKey)
    expect(
      findDefaultSelectableAccountRuntimeKey([inactiveServiceRuntimeKey]),
    ).toBeNull()
  })

  it("formats account-token runtime key secrets for compatible site auth", () => {
    const runtimeKey = buildAccountTokenRuntimeKey(account, {
      ...token,
      key: "raw-token-secret",
    })

    expect(formatAccountRuntimeKeySecretForSite(runtimeKey)).toMatchObject({
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
      secret: "sk-raw-token-secret",
      token: {
        key: "raw-token-secret",
      },
    })
  })

  it("formats service-credential runtime key secrets for compatible site auth", () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "service-secret",
      isAuthenticated: true,
    })

    expect(formatAccountRuntimeKeySecretForSite(runtimeKey)).toMatchObject({
      source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
      secret: "sk-service-secret",
      credential: {
        key: "service-secret",
      },
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
    ])
  })

  it("collects stale raw credential keys from inactive service credentials for sanitized errors", () => {
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex",
      key: "stale-service-secret",
      isAuthenticated: false,
    })

    expect(runtimeKey.secret).toBe("")
    expect(collectAccountRuntimeKeySecrets([runtimeKey])).toEqual(
      expect.arrayContaining([
        "account-access-token",
        "session=redacted",
        "stale-service-secret",
      ]),
    )
  })
})
