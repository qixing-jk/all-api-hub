import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  buildAccountRuntimeKeyEntryIdentityKey,
  buildAccountTokenKeyManagementEntry,
  buildServiceCredentialKeyManagementEntry,
  buildTokenIdentityKey,
  formatKey,
  formatQuota,
  isManagedSiteStatusIdentityForAccount,
} from "~/features/KeyManagement/utils"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  ACCOUNT_RUNTIME_KEY_STATUSES,
} from "~/services/accounts/accountRuntimeKeys"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"

const { tMock } = vi.hoisted(() => ({
  tMock: vi.fn((key: string) => key),
}))

vi.mock("~/utils/i18n/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/i18n/core")>()

  return {
    ...actual,
    t: tMock,
  }
})

describe("KeyManagement utils", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("buildTokenIdentityKey", () => {
    it("combines account and token identifiers into a collision-safe key", () => {
      expect(buildTokenIdentityKey("account-a", 7)).toBe("account-a:7")
    })
  })

  describe("runtime key entry identity", () => {
    it("uses runtime-key ids for entry identity", () => {
      expect(
        buildAccountRuntimeKeyEntryIdentityKey(
          "service_credential:account-1:codex",
        ),
      ).toBe("runtime_key:service_credential:account-1:codex")
    })

    it("builds account-token entries with the shared runtime-key shape", () => {
      const account = buildDisplaySiteData({
        id: "account-1",
        name: "Example Account",
      })
      const token = buildApiToken({
        id: 42,
        name: "Primary token",
        key: "sk-token-secret",
      })

      const entry = buildAccountTokenKeyManagementEntry(account, {
        ...token,
        accountId: account.id,
        accountName: account.name,
      })

      expect(entry).toMatchObject({
        id: "runtime_key:account_token:account-1:42",
        runtimeKey: {
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
          accountId: "account-1",
          label: "Primary token",
          secret: "sk-token-secret",
        },
        uiState: {},
      })
    })

    it("builds loaded service-credential entries and skips unavailable states", () => {
      const account = buildDisplaySiteData({
        id: "account-1",
        name: "Example Account",
      })

      expect(
        buildServiceCredentialKeyManagementEntry({
          account,
          serviceCredential: { status: "loading" },
          canRotate: true,
        }),
      ).toBeNull()

      const entry = buildServiceCredentialKeyManagementEntry({
        account,
        serviceCredential: {
          status: "loaded",
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

    it("matches legacy token and runtime-key status identities by account", () => {
      expect(
        isManagedSiteStatusIdentityForAccount("account-1:42", "account-1"),
      ).toBe(true)
      expect(
        isManagedSiteStatusIdentityForAccount(
          "runtime_key:account_token:account-1:42",
          "account-1",
        ),
      ).toBe(true)
      expect(
        isManagedSiteStatusIdentityForAccount(
          "runtime_key:service_credential:account-1:codex",
          "account-1",
        ),
      ).toBe(true)
      expect(
        isManagedSiteStatusIdentityForAccount(
          "runtime_key:service_credential:account-2:codex",
          "account-1",
        ),
      ).toBe(false)
    })
  })

  describe("formatKey", () => {
    it("returns the full key when the token is marked as visible", () => {
      const key = "sk-visible-1234567890"
      const tokenIdentityKey = buildTokenIdentityKey("account-a", 1)

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

  describe("formatQuota", () => {
    it("uses the unlimited label when the token has unlimited quota", () => {
      expect(formatQuota(1000, true)).toBe(
        "keyManagement:dialog.unlimitedQuota",
      )
    })

    it("uses the unlimited label when the remaining quota is negative", () => {
      expect(formatQuota(-1, false)).toBe("keyManagement:dialog.unlimitedQuota")
    })

    it("formats finite quota values as USD with two decimals", () => {
      const quota = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR * 1.25

      expect(formatQuota(quota, false)).toBe("$1.25")
    })
  })
})
