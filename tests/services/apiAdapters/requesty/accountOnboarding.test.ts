import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  isCanonicalRequestyUrl,
  onboardRequestyAccount,
} from "~/services/apiAdapters/requesty/account/accountOnboarding"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { server } from "~~/tests/msw/server"

const { pageAction, getAllAccounts } = vi.hoisted(() => ({
  pageAction: vi.fn(),
  getAllAccounts: vi.fn(),
}))
vi.mock(
  "~/services/apiAdapters/requesty/keys/managementKeyActionClient",
  () => ({
    tempWindowRequestyManagementKeyAction: pageAction,
  }),
)
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts },
}))

const execution = {
  version: 2,
  kind: "user_command",
  command: "detect_account",
  surface: "options",
} satisfies ProtectionBypassExecution
const created = {
  state: "created",
  accessToken: "rqsty-test-key",
  keyId: "key-123",
  name: "All API Hub",
}
const selfUrl = "https://api-v2.requesty.ai/v1/manage/apikey/self"

describe("Requesty automatic onboarding", () => {
  beforeEach(() => {
    pageAction.mockReset()
    getAllAccounts.mockReset().mockResolvedValue([])
    server.use(
      http.get(selfUrl, ({ request }) => {
        expect(request.headers.get("Authorization")).toMatch(/^Bearer rqsty-/)
        return HttpResponse.json({ id: "key-123", name: "Hub key" })
      }),
      http.get("https://api-v2.requesty.ai/v1/manage/org", () =>
        HttpResponse.json({ name: "My org", balance: "7.25" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
        HttpResponse.json({ groups: [{ organization_id: "org-123" }] }),
      ),
    )
  })

  it("creates once and returns a verified account ready to save", async () => {
    pageAction.mockResolvedValue(created)
    const onCredentialCreated = vi.fn()
    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated,
    })
    expect(result).toMatchObject({
      success: true,
      data: {
        siteType: "requesty",
        username: "My org",
        userId: "org-123",
        accessToken: "rqsty-test-key",
        authType: "access_token",
      },
    })
    expect(onCredentialCreated).toHaveBeenCalledExactlyOnceWith(
      "rqsty-test-key",
    )
    expect(pageAction).toHaveBeenCalledOnce()
  })

  it("reuses a supplied key without creating another", async () => {
    const result = await onboardRequestyAccount({
      accessToken: "rqsty-test-key",
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })
    expect(result.success).toBe(true)
    expect(pageAction).not.toHaveBeenCalled()
  })

  it("reuses the manage key an existing account already stores", async () => {
    getAllAccounts.mockResolvedValue([
      {
        id: "acct-1",
        site_url: "https://app.requesty.ai",
        site_type: "requesty",
        site_name: "Requesty",
        account_info: {
          access_token: "rqsty-stored-key",
          id: "org-123",
          username: "My org",
        },
      },
    ])
    const onCredentialCreated = vi.fn()
    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated,
    })
    expect(pageAction).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      message: "accountDialog:form.requestyReusedManageKey",
      data: { accessToken: "rqsty-stored-key", siteType: "requesty" },
    })
    expect(onCredentialCreated).toHaveBeenCalledExactlyOnceWith(
      "rqsty-stored-key",
    )
  })

  it("ignores a stored key that no longer verifies", async () => {
    getAllAccounts.mockResolvedValue([
      {
        id: "acct-1",
        site_url: "https://app.requesty.ai",
        site_type: "requesty",
        site_name: "Requesty",
        account_info: { access_token: "rqsty-revoked", id: "org-123" },
      },
    ])
    server.use(
      http.get(selfUrl, ({ request }) => {
        if (request.headers.get("Authorization") === "Bearer rqsty-revoked") {
          return HttpResponse.json({}, { status: 401 })
        }
        return HttpResponse.json({ id: "key-123", name: "Hub key" })
      }),
    )
    pageAction.mockResolvedValue(created)
    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })
    expect(pageAction).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      success: true,
      data: { accessToken: "rqsty-test-key" },
    })
  })

  it("falls back to the Requesty form when signed out", async () => {
    pageAction.mockResolvedValue({
      state: "not_dispatched",
      reason: "session_unavailable",
      name: "All API Hub",
    })
    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })
    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:form.requestySignInRequired",
      recoveryData: { siteType: "requesty", authType: "access_token" },
    })
    expect(pageAction).toHaveBeenCalledOnce()
  })

  it("preserves one-time plaintext if validation fails, without retrying create", async () => {
    pageAction.mockResolvedValue(created)
    server.use(http.get(selfUrl, () => new HttpResponse(null, { status: 401 })))
    const onCredentialCreated = vi.fn()
    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated,
    })
    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:form.requestyManageKeyValidationFailed",
      recoveryData: { accessToken: "rqsty-test-key", siteType: "requesty" },
    })
    expect(onCredentialCreated).toHaveBeenCalledExactlyOnceWith(
      "rqsty-test-key",
    )
    expect(pageAction).toHaveBeenCalledOnce()
  })

  it("does not replay an uncertain mutation", async () => {
    pageAction.mockRejectedValue(new Error("connection closed after dispatch"))
    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })
    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:form.autoCreateAccessTokenUnconfirmed",
    })
    expect(pageAction).toHaveBeenCalledOnce()
  })

  it("skips a stored Requesty account that carries no credential", async () => {
    getAllAccounts.mockResolvedValue([
      {
        id: "acct-no-credential",
        site_url: "https://app.requesty.ai",
        site_type: "requesty",
        site_name: "Requesty",
        account_info: { id: "org-123" },
      },
    ])
    pageAction.mockResolvedValue(created)

    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })

    expect(pageAction).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      success: true,
      data: { accessToken: "rqsty-test-key" },
    })
  })

  it("reports a generic create failure that is not a sign-out", async () => {
    pageAction.mockResolvedValue({
      state: "not_dispatched",
      reason: "organization_unavailable",
      name: "All API Hub",
    })

    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })

    expect(result).toMatchObject({
      success: false,
      message: "accountDialog:form.autoCreateAccessTokenFailed",
    })
  })

  it("fails the detection instead of throwing when completion breaks", async () => {
    pageAction.mockResolvedValue(created)
    server.use(
      http.get("https://api-v2.requesty.ai/v1/manage/org", () =>
        HttpResponse.json({ name: 42, balance: "not-a-number" }),
      ),
    )

    const result = await onboardRequestyAccount({
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })

    expect(result).toMatchObject({ success: false })
  })

  it.each([
    "https://requesty.ai",
    "http://app.requesty.ai",
    "https://app.requesty.ai.evil.invalid",
    "https://app.requesty.ai:444",
    "invalid",
  ])("does not create for %s", (url) => {
    expect(isCanonicalRequestyUrl(url)).toBe(false)
  })
  it("preserves the supplied credential when account completion fails", async () => {
    server.use(
      http.get("https://api-v2.requesty.ai/v1/manage/org", () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    )
    const result = await onboardRequestyAccount({
      accessToken: "rqsty-existing",
      protectionBypassExecution: execution,
      onCredentialCreated: vi.fn(),
    })
    expect(result).toMatchObject({
      success: false,
      recoveryData: { accessToken: "rqsty-existing" },
    })
    expect(pageAction).not.toHaveBeenCalled()
  })
})
