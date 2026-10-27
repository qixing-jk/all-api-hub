import { beforeEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_USD_TO_CNY_RATE } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import { AuthTypeEnum } from "~/types"

const { browserDetect, fetchPreparedJsonResponse } = vi.hoisted(() => ({
  browserDetect: vi.fn(),
  fetchPreparedJsonResponse: vi.fn(),
}))
vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: browserDetect,
}))
vi.mock("~/services/apiTransport/requestExecution", () => ({
  fetchPreparedJsonResponse,
}))

describe("Novita account detection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserDetect.mockResolvedValue({ success: false })
  })

  it("prefills known account facts and guides key acquisition without a browser identity", async () => {
    const result = await autoDetectAccount(
      "https://novita.ai/settings/key-management",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(false)
    expect(result.recoveryData).toMatchObject({
      siteType: SITE_TYPES.NOVITA,
      siteName: "Novita AI",
      exchangeRate: DEFAULT_USD_TO_CNY_RATE,
      authType: AuthTypeEnum.AccessToken,
    })
    expect(result.detailedError).toMatchObject({
      type: "access_token_verification_required",
      canUseApiCredentialFallback: false,
    })
    expect(browserDetect).toHaveBeenCalledOnce()
    expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("completes fresh onboarding with a verified console bearer without requiring an inference key", async () => {
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "browser-account-uuid",
        user: { id: "browser-account-uuid", username: "user@example.com" },
        rawUser: {},
        accessToken: "novita-console:verified-console-bearer",
      },
    })
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        uuid: "browser-account-uuid",
        email: "user@example.com",
      },
    })
    const result = await autoDetectAccount(
      "https://novita.ai/console",
      AuthTypeEnum.AccessToken,
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        userId: "browser-account-uuid",
        accessToken: "novita-console:verified-console-bearer",
      },
    })
    expect(fetchPreparedJsonResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: "https://api-server.novita.ai/v1/user/info",
      }),
    )
  })

  it("recovers an expired console bearer only from the same signed-in account", async () => {
    fetchPreparedJsonResponse
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        body: { code: 401, reason: "UNAUTHORIZED" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { uuid: "expected-user", email: "user@example.com" },
      })
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "expected-user",
        user: { id: "expected-user", username: "user@example.com" },
        rawUser: {},
        accessToken: "novita-console:new-session",
      },
    })
    const result = await autoDetectAccount(
      "https://novita.ai",
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      {
        existingAccount: {
          url: "https://novita.ai",
          siteType: SITE_TYPES.NOVITA,
          userId: "expected-user",
          accessToken: "novita-console:expired-session",
        },
      },
    )
    expect(result).toMatchObject({
      success: true,
      data: {
        userId: "expected-user",
        accessToken: "novita-console:new-session",
      },
    })
  })

  it("retains identity and guidance when no typed console credential is available", async () => {
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "browser-account-uuid",
        user: { id: "browser-account-uuid", username: "user@example.com" },
        rawUser: {},
        accessToken: "console-session-must-not-become-an-api-key",
      },
    })
    const result = await autoDetectAccount(
      "https://novita.ai/console",
      AuthTypeEnum.AccessToken,
    )

    expect(result).toMatchObject({
      success: false,
      recoveryData: {
        siteType: SITE_TYPES.NOVITA,
        siteName: "Novita AI",
        exchangeRate: DEFAULT_USD_TO_CNY_RATE,
        userId: "browser-account-uuid",
        username: "user@example.com",
      },
    })
    expect(result.recoveryData?.accessToken).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain(
      "console-session-must-not-become-an-api-key",
    )
    expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("does not adopt another browser account when repairing a known identity", async () => {
    browserDetect.mockResolvedValueOnce({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        userId: "other-user",
        user: { id: "other-user", username: "other@example.com" },
        rawUser: {},
      },
    })
    const result = await autoDetectAccount(
      "https://novita.ai",
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      {
        existingAccount: {
          url: "https://novita.ai",
          siteType: SITE_TYPES.NOVITA,
          userId: "expected-user",
          accessToken: "",
        },
      },
    )
    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: "account_identity_mismatch",
    })
    expect(result.recoveryData?.userId).toBeUndefined()
    expect(result.recoveryData?.username).toBeUndefined()
  })

  it("verifies a pasted API key and completes identity without requiring website login", async () => {
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { uuid: "novita-user", email: "user@example.com" },
    })
    const result = await autoDetectAccount(
      "https://novita.ai/console",
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      {
        existingAccount: {
          url: "https://novita.ai/settings/key-management",
          siteType: SITE_TYPES.NOVITA,
          userId: "",
          accessToken: "sk_pasted-key",
        },
      },
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        siteType: SITE_TYPES.NOVITA,
        siteName: "Novita AI",
        userId: "novita-user",
        username: "user@example.com",
        accessToken: "sk_pasted-key",
        exchangeRate: DEFAULT_USD_TO_CNY_RATE,
      },
    })
    expect(browserDetect).not.toHaveBeenCalled()
    expect(fetchPreparedJsonResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "sk_pasted-key",
        },
      }),
      expect.objectContaining({
        url: "https://api.novita.ai/openapi/v1/user/info",
      }),
    )
  })

  it("rejects a key belonging to a different account during recovery", async () => {
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { uuid: "different-user", email: "other@example.com" },
    })
    const result = await autoDetectAccount(
      "https://novita.ai",
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      {
        existingAccount: {
          url: "https://novita.ai",
          siteType: SITE_TYPES.NOVITA,
          userId: "expected-user",
          accessToken: "sk_key",
        },
      },
    )
    expect(result).toMatchObject({
      success: false,
      autoDetectFailureReason: "account_identity_mismatch",
    })
    expect(result.data).toBeUndefined()
    expect(result.recoveryData?.userId).toBeUndefined()
  })

  it.each([
    ["https://other.example", SITE_TYPES.NOVITA],
    ["https://novita.ai", SITE_TYPES.OPENROUTER],
    ["http://novita.ai", SITE_TYPES.NOVITA],
  ])("does not reuse credentials owned by %s (%s)", async (url, siteType) => {
    const result = await autoDetectAccount(
      "https://novita.ai",
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      {
        existingAccount: {
          url,
          siteType,
          userId: "",
          accessToken: "foreign-key",
        },
      },
    )
    expect(result.success).toBe(false)
    expect(fetchPreparedJsonResponse).not.toHaveBeenCalled()
  })

  it("reports invalid keys locally without suggesting website login or another account flow", async () => {
    fetchPreparedJsonResponse.mockResolvedValueOnce({
      ok: false,
      status: 401,
      body: { reason: "UNAUTHORIZED", message: "key not found" },
    })
    const result = await autoDetectAccount(
      "https://novita.ai",
      AuthTypeEnum.AccessToken,
      undefined,
      undefined,
      {
        existingAccount: {
          url: "https://novita.ai",
          siteType: SITE_TYPES.NOVITA,
          userId: "",
          accessToken: "sk_invalid",
        },
      },
    )
    expect(result.success).toBe(false)
    expect(result.message).toBe("messages:novita.credentialInvalid")
    expect(result.detailedError?.canUseApiCredentialFallback).toBe(false)
    expect(JSON.stringify(result)).not.toContain("sk_invalid")
  })
})
