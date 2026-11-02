import { http, HttpResponse } from "msw"
import { beforeEach, expect, it, vi } from "vitest"

import { autoDetectAccount } from "~/services/accounts/accountAutoDetection"
import type { AccountOnboardingRequest } from "~/services/apiAdapters/contracts/accountOnboarding"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

// Exercise provider outcomes through the same dispatch seam as the account form.
const onboardAimlApiAccount = (request: AccountOnboardingRequest) =>
  autoDetectAccount(
    "https://aimlapi.com",
    AuthTypeEnum.AccessToken,
    request.protectionBypassExecution,
    undefined,
    request,
  )

vi.mock("~/services/siteDetection/autoDetectService", () => ({
  autoDetectSmart: vi.fn(async () => ({
    success: true,
    data: {
      siteType: "aimlapi",
      userId: "123",
      user: { username: "person@example.invalid" },
      transientAuth: {
        kind: "aimlapi_console",
        token: "console-session",
        origin: "https://aimlapi.com",
        userId: "123",
      },
    },
  })),
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccountsOrThrow: vi.fn(async () => []) },
}))
beforeEach(() => vi.clearAllMocks())

it("verifies a pasted management-only key without borrowing browser identity or a regular credential", async () => {
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({
        data: {
          prefix: "abcdefgh",
          name: "Management only",
          disabled: false,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
          expires_at: null,
          total_usage_usd: 0,
          monthly_usage_usd: 0,
        },
      }),
    ),
  )
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  const result = await onboardAimlApiAccount({
    existingAccount: {
      url: "https://aimlapi.com",
      siteType: "aimlapi",
      userId: "",
      accessToken: "management-only",
    },
  })
  expect(result).toMatchObject({
    success: true,
    data: { userId: "abcdefgh", accessToken: "management-only" },
  })
  expect(result.data).not.toHaveProperty("aimlApiAuth")
  expect(autoDetectSmart).not.toHaveBeenCalled()
})

it("rejects a browser result classified as another site without credential issuance", async () => {
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  vi.mocked(autoDetectSmart).mockResolvedValueOnce({
    success: true,
    data: {
      siteType: "novita",
      userId: "123",
      user: { username: "other" },
      transientAuth: {
        kind: "aimlapi_console",
        userId: "123",
        token: "session",
        origin: "https://aimlapi.com",
      },
    },
  } as never)
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.success).toBe(false)
  expect(result.recoveryData?.userId).toBeUndefined()
  expect(result.recoveryData?.accessToken).toBeUndefined()
})

it("reuses saved credentials after verifying the current console identity", async () => {
  const { accountQueries } = await import(
    "~/services/accounts/accountStorage/accountQueries"
  )
  vi.mocked(accountQueries.getAllAccountsOrThrow).mockResolvedValueOnce([
    {
      site_type: "aimlapi",
      account_info: { id: "123", access_token: "saved-management" },
      aimlApiAuth: { apiKey: "saved-regular" },
    },
  ] as never)
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "123", email: "person@example.invalid" }),
    ),
    http.get("https://api.aimlapi.com/v1/key", ({ request }) => {
      expect(request.headers.get("authorization")).toBe(
        "Bearer saved-management",
      )
      return HttpResponse.json({
        data: {
          prefix: "abcdefgh",
          name: "AAH",
          disabled: false,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
          expires_at: null,
          total_usage_usd: 0,
          monthly_usage_usd: 0,
        },
      })
    }),
    http.get("https://api.aimlapi.com/v2/billing/detail", ({ request }) => {
      expect(request.headers.get("authorization")).toBe("Bearer saved-regular")
      return HttpResponse.json({
        user_id: 123,
        email: "person@example.invalid",
        current_balance: 1,
        currency: "USD",
      })
    }),
  )
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.data).toMatchObject({
    userId: "123",
    accessToken: "saved-management",
    aimlApiAuth: { apiKey: "saved-regular" },
  })
})

it("rejects saved credentials that resolve to a different console identity", async () => {
  const { accountQueries } = await import(
    "~/services/accounts/accountStorage/accountQueries"
  )
  vi.mocked(accountQueries.getAllAccountsOrThrow).mockResolvedValueOnce([
    {
      site_type: "aimlapi",
      account_info: { id: "123", access_token: "saved-management" },
      aimlApiAuth: { apiKey: "saved-regular" },
    },
  ] as never)
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "123", email: "person@example.invalid" }),
    ),
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({
        data: {
          prefix: "abcdefgh",
          disabled: false,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
          expires_at: null,
          total_usage_usd: 0,
          monthly_usage_usd: 0,
        },
      }),
    ),
    http.get("https://api.aimlapi.com/v2/billing/detail", () =>
      HttpResponse.json({
        user_id: 456,
        email: "other@example.invalid",
        current_balance: 1,
        currency: "USD",
      }),
    ),
  )
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.success).toBe(false)
  expect(result.message).toBe(
    "accountDialog:messages.autoDetectIdentityMismatch",
  )
})

it("falls back safely when browser session discovery rejects", async () => {
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  vi.mocked(autoDetectSmart).mockRejectedValueOnce(
    new Error("browser unavailable"),
  )
  expect(
    await onboardAimlApiAccount({ allowCredentialCreation: true }),
  ).toMatchObject({ success: false })
})

it("automatically acquires durable credentials and fills the verified identity", async () => {
  let creates = 0
  server.use(
    http.get("https://app.aimlapi.com/v1/keys", () =>
      HttpResponse.json({ items: [], pagination: { hasMore: false } }),
    ),
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "123", email: "person@example.invalid" }),
    ),
    http.post("https://app.aimlapi.com/v1/keys", async ({ request }) => {
      expect(request.headers.get("authorization")).toBe(
        "Bearer console-session",
      )
      expect(request.credentials).toBe("omit")
      expect(request.headers.get("content-type")).toBe("application/json")
      const body = (await request.json()) as { isManagement: boolean }
      expect(body).toEqual({
        name: `All API Hub ${body.isManagement ? "management" : "regular"}`,
        isManagement: body.isManagement,
      })
      creates++
      return HttpResponse.json(
        {
          id: String(creates),
          userId: "123",
          isManagement: body.isManagement,
          key: body.isManagement ? "created-management" : "created-regular",
          prefix: body.isManagement ? "abcdefgh" : "ijklmnop",
        },
        { status: 201 },
      )
    }),
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({
        data: {
          prefix: "abcdefgh",
          name: "AAH",
          disabled: false,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
          expires_at: null,
          allowed_models: null,
          total_usage_usd: 0,
          monthly_usage_usd: 0,
        },
      }),
    ),
    http.get("https://api.aimlapi.com/v2/billing/detail", () =>
      HttpResponse.json({
        user_id: 123,
        email: "person@example.invalid",
        current_balance: 1,
        currency: "USD",
      }),
    ),
  )
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.success).toBe(true)
  expect(result.data).toMatchObject({
    userId: "123",
    username: "person@example.invalid",
    accessToken: "created-management",
    aimlApiAuth: { apiKey: "created-regular" },
  })
  expect(creates).toBe(2)
  const again = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(again.success).toBe(true)
  expect(creates).toBe(2)
})

it("preserves identity and does not retry uncertain key issuance", async () => {
  const { Storage } = await import("@plasmohq/storage")
  const { AIMLAPI_ONBOARDING_STORAGE_KEY } = await import(
    "~/services/core/storageKeys"
  )
  await new Storage({ area: "local" }).remove(AIMLAPI_ONBOARDING_STORAGE_KEY)
  let creates = 0
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "123", email: "person@example.invalid" }),
    ),
    http.post("https://app.aimlapi.com/v1/keys", () => {
      creates++
      return HttpResponse.error()
    }),
  )
  const first = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(first.success).toBe(false)
  expect(first.recoveryData).toMatchObject({
    userId: "123",
    username: "person@example.invalid",
  })
  await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(creates).toBe(1)
})

it("falls back without issuance when the browser session is unavailable", async () => {
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  vi.mocked(autoDetectSmart).mockResolvedValueOnce({ success: false } as never)
  let creates = 0
  server.use(
    http.post("https://app.aimlapi.com/v1/keys", () => {
      creates++
      return HttpResponse.json({})
    }),
  )
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.success).toBe(false)
  expect(result.detailedError?.type).toBe("access_token_verification_required")
  expect(creates).toBe(0)
})

it("retains a confirmed management key when regular-key issuance is uncertain and never reissues either key", async () => {
  const { Storage } = await import("@plasmohq/storage")
  const { AIMLAPI_ONBOARDING_STORAGE_KEY } = await import(
    "~/services/core/storageKeys"
  )
  await new Storage({ area: "local" }).remove(AIMLAPI_ONBOARDING_STORAGE_KEY)
  const creates: boolean[] = []
  let verifications = 0
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "123", email: "person@example.invalid" }),
    ),
    http.post("https://app.aimlapi.com/v1/keys", async ({ request }) => {
      const body = (await request.json()) as { isManagement: boolean }
      creates.push(body.isManagement)
      return body.isManagement
        ? HttpResponse.json({
            id: "partial-management",
            userId: "123",
            isManagement: true,
            key: "confirmed-management",
            prefix: "abcdefgh",
          })
        : HttpResponse.error()
    }),
    http.get("https://api.aimlapi.com/v1/key", () => {
      verifications++
      return HttpResponse.json({})
    }),
  )
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await onboardAimlApiAccount({
      allowCredentialCreation: true,
    })
    expect(result.success).toBe(false)
    expect(result.recoveryData).toMatchObject({
      userId: "123",
      accessToken: "confirmed-management",
    })
    expect(result.recoveryData?.aimlApiKey).toBeUndefined()
  }
  expect(creates).toEqual([true, false])
  expect(verifications).toBe(0)
})

it("verifies pasted credentials and returns their actual account identity", async () => {
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json({
        data: {
          prefix: "abcdefgh",
          name: "Connection",
          disabled: false,
          created_at: "2026-10-01",
          updated_at: "2026-10-01",
          expires_at: null,
          allowed_models: null,
          total_usage_usd: 0,
          monthly_usage_usd: 0,
        },
      }),
    ),
    http.get("https://api.aimlapi.com/v2/billing/detail", () =>
      HttpResponse.json({
        user_id: 456,
        email: "other@example.invalid",
        current_balance: 2,
        currency: "USD",
      }),
    ),
  )
  const result = await onboardAimlApiAccount({
    allowCredentialCreation: true,
    existingAccount: {
      url: "https://aimlapi.com",
      siteType: "aimlapi",
      userId: "",
      accessToken: "manual-management",
      aimlApiKey: "manual-regular",
    },
  })
  expect(result.data).toMatchObject({
    userId: "456",
    username: "other@example.invalid",
  })
  expect(autoDetectSmart).not.toHaveBeenCalled()
})

it("rejects invalid pasted credentials without consulting the browser or issuing replacements", async () => {
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  let creates = 0
  server.use(
    http.get("https://api.aimlapi.com/v1/key", () =>
      HttpResponse.json(
        { message: "private upstream detail" },
        { status: 401 },
      ),
    ),
    http.post("https://app.aimlapi.com/v1/keys", () => {
      creates++
      return HttpResponse.json({})
    }),
  )
  const result = await onboardAimlApiAccount({
    allowCredentialCreation: true,
    existingAccount: {
      url: "https://aimlapi.com",
      siteType: "aimlapi",
      userId: "",
      accessToken: "invalid-management",
    },
  })
  expect(result.success).toBe(false)
  expect(result.recoveryData?.accessToken).toBe("invalid-management")
  expect(result.message).not.toContain("private upstream detail")
  expect(autoDetectSmart).not.toHaveBeenCalled()
  expect(creates).toBe(0)
})

it("rejects a switched console identity before issuing any credentials", async () => {
  let creates = 0
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "456", email: "other@example.invalid" }),
    ),
    http.post("https://app.aimlapi.com/v1/keys", () => {
      creates++
      return HttpResponse.json({})
    }),
  )
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.success).toBe(false)
  expect(result.message).toBe(
    "accountDialog:messages.autoDetectIdentityMismatch",
  )
  expect(result.recoveryData).toMatchObject({ userId: "123" })
  expect(creates).toBe(0)
})

it("does not issue credentials after console identity verification fails", async () => {
  const create = vi.fn(() => HttpResponse.json({}))
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ message: "private console detail" }, { status: 503 }),
    ),
    http.post("https://app.aimlapi.com/v1/keys", create),
  )
  const result = await onboardAimlApiAccount({ allowCredentialCreation: true })
  expect(result.success).toBe(false)
  expect(result.message).not.toContain("private console detail")
  expect(result.recoveryData?.accessToken).toBeUndefined()
  expect(create).not.toHaveBeenCalled()
})

it("requests manual credentials when cross-context issuance coordination is unavailable", async () => {
  const create = vi.fn(() => HttpResponse.json({}))
  server.use(
    http.get("https://app.aimlapi.com/v1/users/me", () =>
      HttpResponse.json({ id: "123" }),
    ),
    http.post("https://app.aimlapi.com/v1/keys", create),
  )
  vi.stubGlobal("navigator", {})
  try {
    const result = await onboardAimlApiAccount({
      allowCredentialCreation: true,
    })
    expect(result.success).toBe(false)
    expect(result.message).toBe("messages:aimlapi.managementKeyRequired")
    expect(create).not.toHaveBeenCalled()
    expect(result.recoveryData?.accessToken).toBeUndefined()
  } finally {
    vi.unstubAllGlobals()
  }
})

it("rejects credentials scoped to another provider before session or API access", async () => {
  const { autoDetectSmart } = await import(
    "~/services/siteDetection/autoDetectService"
  )
  const before = vi.mocked(autoDetectSmart).mock.calls.length
  const result = await onboardAimlApiAccount({
    existingAccount: {
      url: "https://other.example",
      siteType: "new-api",
      userId: "123",
      accessToken: "unrelated-secret",
    },
  })
  expect(result.success).toBe(false)
  expect(vi.mocked(autoDetectSmart).mock.calls.length).toBe(before)
  expect(result.recoveryData?.accessToken).toBeUndefined()
})

it("keeps read-only discovery from issuing credentials while retaining identity", async () => {
  let creates = 0
  server.use(
    http.post("https://app.aimlapi.com/v1/keys", () => {
      creates++
      return HttpResponse.json({})
    }),
  )
  const result = await onboardAimlApiAccount({})
  expect(result.success).toBe(false)
  expect(result.recoveryData).toMatchObject({
    userId: "123",
    username: "person@example.invalid",
  })
  expect(creates).toBe(0)
})

it.each([
  null,
  {
    userId: "other",
    isManagement: true,
    key: "key",
    id: "id",
    prefix: "prefix",
  },
  {
    userId: "123",
    isManagement: false,
    key: "key",
    id: "id",
    prefix: "prefix",
  },
  { userId: "123", isManagement: true, key: "", id: "id", prefix: "prefix" },
  { userId: "123", isManagement: true, key: "key", id: 123, prefix: "prefix" },
  { userId: "123", isManagement: true, key: "key", id: "id" },
])(
  "retains uncertain issuance without replay for invalid console response %#",
  async (body) => {
    const { Storage } = await import("@plasmohq/storage")
    const { AIMLAPI_ONBOARDING_STORAGE_KEY } = await import(
      "~/services/core/storageKeys"
    )
    await new Storage({ area: "local" }).remove(AIMLAPI_ONBOARDING_STORAGE_KEY)
    let creates = 0
    server.use(
      http.get("https://app.aimlapi.com/v1/users/me", ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          "Bearer console-session",
        )
        expect(request.credentials).toBe("omit")
        return HttpResponse.json({ id: "123", email: "person@example.invalid" })
      }),
      http.post("https://app.aimlapi.com/v1/keys", () => {
        creates++
        return HttpResponse.json(body)
      }),
    )
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await onboardAimlApiAccount({
        allowCredentialCreation: true,
      })
      expect(result.success).toBe(false)
      expect(result.recoveryData).toMatchObject({ userId: "123" })
      expect(result.recoveryData?.accessToken).toBeUndefined()
      expect(result.recoveryData?.aimlApiKey).toBeUndefined()
    }
    expect(creates).toBe(1)
  },
)
