import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_BOOTSTRAP_ROUTE_KINDS } from "~/services/apiAdapters/contracts/accountBootstrap"
import { requestyAccountBootstrap } from "~/services/apiAdapters/requesty/account/accountBootstrap"
import { requestyAccountPersistence } from "~/services/apiAdapters/requesty/account/accountPersistence"
import { requestyAccountRefresh } from "~/services/apiAdapters/requesty/account/accountRefresh"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

const { fetchIdentityMock, fetchSelfKeyMock } = vi.hoisted(() => ({
  fetchIdentityMock: vi.fn(),
  fetchSelfKeyMock: vi.fn(),
}))

vi.mock("~/services/apiService/requesty", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiService/requesty")>()),
  fetchRequestyAccountIdentity: fetchIdentityMock,
  fetchRequestySelfKeyInfo: fetchSelfKeyMock,
}))

const request = {
  baseUrl: "https://app.requesty.ai",
  accountId: "account-1",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "rqsty-manage-key" },
} as never

describe("Requesty bootstrap capability", () => {
  it("reads the existing credential instead of minting a second key", async () => {
    fetchSelfKeyMock.mockResolvedValue({
      keyId: "key-self",
      keyName: "All API Hub",
      orgName: "Engineering",
    })

    await expect(
      requestyAccountBootstrap.getOrCreateAccessToken?.(request),
    ).resolves.toEqual({
      username: "Engineering",
      access_token: "rqsty-manage-key",
    })
    // Only the calling key is read; nothing is created.
    expect(fetchSelfKeyMock).toHaveBeenCalledExactlyOnceWith(request)
  })

  it("declares no check-in support and a static console route", async () => {
    await expect(
      requestyAccountBootstrap.fetchCheckInSupport?.(
        request,
        await requestyAccountBootstrap.loadBootstrapFacts(request),
      ),
    ).resolves.toBe(false)
    await expect(
      requestyAccountBootstrap.resolveRoutePath?.(
        { baseUrl: "https://app.requesty.ai" } as never,
        ACCOUNT_BOOTSTRAP_ROUTE_KINDS.AdminCredentials,
      ),
    ).resolves.toBe("/api-keys")
  })

  it("exposes the provider display name and exchange rate without a network read", async () => {
    await expect(
      requestyAccountBootstrap.loadBootstrapFacts?.(request),
    ).resolves.toMatchObject({
      checkInSupported: false,
      defaultExchangeRate: expect.any(Number),
    })
  })
})

describe("Requesty persistence capability", () => {
  it("reuses a stored identity when the credential is unchanged", async () => {
    await expect(
      requestyAccountPersistence.prepareIdentity({
        accessToken: " rqsty-manage-key ",
        userId: "",
        existingAccount: {
          site_type: SITE_TYPES.REQUESTY,
          account_info: {
            id: "requesty:org-1",
            access_token: "rqsty-manage-key",
          },
        },
      } as never),
    ).resolves.toBe("requesty:org-1")
    expect(fetchIdentityMock).not.toHaveBeenCalled()
  })

  it("re-reads identity after the credential changed", async () => {
    fetchIdentityMock.mockResolvedValue({
      orgName: "Engineering",
      orgId: "org-2",
    })

    await expect(
      requestyAccountPersistence.prepareIdentity({
        accessToken: "rqsty-new-key",
        userId: "requesty:stale-form-value",
        existingAccount: {
          site_type: SITE_TYPES.REQUESTY,
          account_info: {
            id: "requesty:org-1",
            access_token: "rqsty-manage-key",
          },
        },
      } as never),
    ).resolves.toBe("org-2")
    expect(fetchIdentityMock).toHaveBeenCalledTimes(1)
  })

  it("keeps a user-facing message for validation failures and trims the credential key", () => {
    const error = new ApiError("invalid token", 401, "/v1/manage/org")

    expect(
      requestyAccountPersistence.getValidationFailureMessage?.(error),
    ).toContain("invalid token")
    expect(
      requestyAccountPersistence.getHealthFailureReason?.(error),
    ).toContain("invalid token")
    expect(
      requestyAccountPersistence.getOperationLogDetails?.({ a: 1 }, {}),
    ).toEqual({ a: 1 })
    expect(requestyAccountPersistence.getCredentialKey?.("  key  ")).toBe("key")
    expect(requestyAccountPersistence.getCredentialKey?.("   ")).toBeUndefined()
  })
})

describe("Requesty refresh capability", () => {
  it("declares no check-in support", async () => {
    await expect(
      requestyAccountRefresh.fetchCheckInSupport?.(request),
    ).resolves.toBe(false)
  })
})
