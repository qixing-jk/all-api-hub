import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_LOAD_STATUSES } from "~/features/KeyManagement/types"
import {
  buildServiceCredentialKeyManagementEntry,
  formatKey,
  isAccountKeyResourceLocatorMatch,
  isAccountRuntimeKeyLocatorMatch,
} from "~/features/KeyManagement/utils"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  ACCOUNT_RUNTIME_KEY_STATUSES,
  buildAccountKeyResourceRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/utils/i18n/core", async (original) => ({
  ...(await original<typeof import("~/utils/i18n/core")>()),
  t: (key: string) => key,
}))

describe("KeyManagement utils", () => {
  it("builds loaded service-credential entries and skips unavailable states", () => {
    const account = buildDisplaySiteData({
      id: "account-1",
      name: "Example Account",
    })

    expect(
      buildServiceCredentialKeyManagementEntry({
        account,
        serviceCredential: {
          status: KEY_MANAGEMENT_LOAD_STATUSES.Loading,
        },
        canRotate: true,
      }),
    ).toBeNull()

    const entry = buildServiceCredentialKeyManagementEntry({
      account,
      serviceCredential: {
        status: KEY_MANAGEMENT_LOAD_STATUSES.Loaded,
        isRotating: true,
        credential: {
          kind: "singleton_service_key",
          service: "codex",
          label: "Codex",
          key: "service-secret",
          isAuthenticated: true,
        },
      },
      canRotate: true,
    })

    expect(entry).toMatchObject({
      id: "runtime_key:service_credential:account-1:codex",
      runtimeKey: {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
        status: ACCOUNT_RUNTIME_KEY_STATUSES.Active,
        capabilities: {
          rotate: true,
        },
      },
      uiState: {
        isRotating: true,
      },
    })
  })

  describe("credential association locator matching", () => {
    it("matches historical numeric locators to account-scoped native resources", () => {
      const account = buildDisplaySiteData({
        id: "account-1",
        siteType: SITE_TYPES.NEW_API,
      })
      const runtimeKey = buildAccountKeyResourceRuntimeKey(account, {
        ref: {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: "account",
          resourceId: "42",
        },
        label: "Primary key",
        secret: "sk-example",
      })

      expect(
        isAccountRuntimeKeyLocatorMatch(runtimeKey, {
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
          accountId: "account-1",
          siteType: SITE_TYPES.NEW_API,
          tokenId: 42,
        }),
      ).toBe(true)
      expect(
        isAccountRuntimeKeyLocatorMatch(runtimeKey, {
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
          accountId: "another-account",
          siteType: SITE_TYPES.NEW_API,
          tokenId: 42,
        }),
      ).toBe(false)
    })

    it("matches native resources by their complete opaque ref", () => {
      const ref = {
        accountId: "account-1",
        siteType: SITE_TYPES.OPENROUTER,
        scopeKey: "workspace-example",
        resourceId: "hash-example",
      }

      expect(
        isAccountKeyResourceLocatorMatch(ref, {
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
          ref,
        }),
      ).toBe(true)
      expect(
        isAccountKeyResourceLocatorMatch(
          { ...ref, scopeKey: "another-workspace" },
          { source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource, ref },
        ),
      ).toBe(false)
    })
  })

  describe("formatKey", () => {
    it("returns the full key when the token is marked as visible", () => {
      const key = "sk-visible-1234567890"
      const tokenIdentityKey = "account-a:1"

      expect(
        formatKey(key, tokenIdentityKey, new Set([tokenIdentityKey])),
      ).toBe(key)
    })

    it("fully masks short hidden keys", () => {
      expect(formatKey("short-key", "account-a:2", new Set())).toBe("******")
    })

    it("preserves the start and end of long hidden keys", () => {
      const key = "sk-1234567890abcdefghijklmnop"

      expect(formatKey(key, "account-a:3", new Set())).toBe(
        `${key.substring(0, 8)}${"*".repeat(16)}${key.substring(
          key.length - 4,
        )}`,
      )
    })
  })
})
