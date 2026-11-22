import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { novitaAccountCompletion } from "~/services/apiAdapters/novita/accountCompletion"
import { novitaAccountDetectionPrivacy } from "~/services/apiAdapters/novita/accountDetection"
import { novitaAccountPersistence } from "~/services/apiAdapters/novita/accountPersistence"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const request = {
  baseUrl: "https://novita.ai",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "sk_test-key" },
  checkIn: { enabled: false, supported: false, last_check_in_time: 0 },
}

const existingAccount = {
  site_type: SITE_TYPES.NOVITA,
  account_info: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "novita-fixture@example.com",
    access_token: "sk_test-key",
  },
} as unknown as Pick<SiteAccount, "site_type" | "account_info">

describe("novita capabilities wiring", () => {
  it("registers the account capabilities through the Novita family", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.NOVITA)
    expect(capabilities.siteType).toBe(SITE_TYPES.NOVITA)
    expect(capabilities.family).toBe("novita")
    expect(capabilities.account?.data).toBeDefined()
    expect(capabilities.account?.persistence).toBeDefined()
    expect(capabilities.account?.bootstrap).toBeDefined()
    expect(capabilities.account?.completion).toBeDefined()
    expect(capabilities.account?.refresh).toBeDefined()
    expect(capabilities.account?.keyResourceManagement).toBeDefined()
    expect(capabilities.account?.providerModelCatalog).toBeDefined()
  })
})

describe("novita account data", () => {
  it("retains valid Novita fields when another amount is missing or larger than a safe integer", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json({
          availableBalance: "930000",
          creditLimit: "9007199254740993",
        }),
      ),
    )
    const data = await getSiteTypeCapabilities(
      SITE_TYPES.NOVITA,
    ).account!.data!.fetchData(request as never)
    expect(
      data.balance?.positions
        .slice(0, 3)
        .map((p) => [
          p.amount.status,
          "value" in p.amount ? p.amount.value : undefined,
        ]),
    ).toEqual([
      ["known", "93"],
      ["unavailable", undefined],
      ["known", "900719925474.0993"],
    ])
  })
  it("preserves independent available cash credit debt and missing pending observations", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json({
          availableBalance: "930000",
          cashBalance: "-20000",
          creditLimit: "200000",
          outstandingInvoices: "9007199254740993",
        }),
      ),
    )
    const data = await getSiteTypeCapabilities(
      SITE_TYPES.NOVITA,
    ).account!.data!.fetchData(request as never)
    expect(
      data.balance?.positions.map((p) => [
        p.role,
        p.amount.status,
        "value" in p.amount ? p.amount.value : undefined,
      ]),
    ).toEqual([
      ["available", "known", "93"],
      ["ledger", "known", "-2"],
      ["credit-limit", "known", "20"],
      ["pending-charge", "unavailable", undefined],
      ["debt", "known", "900719925474.0993"],
    ])
    expect(data).not.toHaveProperty("quota")
    expect(data).not.toHaveProperty("nativeBalance")
    expect(data.balance?.positions[1]?.cashClassification).toBe("reported-cash")
    expect(data.balance?.positions[2]?.nature).toBe("credit")
    expect(data.balanceRefreshParts).toEqual([
      expect.objectContaining({
        enumeration: "complete",
        positions: data.balance?.positions,
      }),
    ])
  })
  beforeEach(() => {
    server.resetHandlers()
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json({
          availableBalance: "1000000",
          cashBalance: "800000",
          creditLimit: "200000",
          pendingCharges: "0",
          outstandingInvoices: "0",
        }),
      ),
    )
  })

  it("normalizes the 1/10000 USD balance into separate available, cash and credit facts", async () => {
    const { fetchData } = getSiteTypeCapabilities(SITE_TYPES.NOVITA).account!
      .data!
    const data = await fetchData(request as never)

    expect(data.balance?.positions.slice(0, 3)).toMatchObject([
      { id: "available", amount: { value: "100" } },
      { id: "cash", amount: { value: "80" } },
      { id: "credit-limit", role: "credit-limit", amount: { value: "20" } },
    ])
    expect(data.todayStatsAvailability).toBeDefined()
    const availability = Object.values(
      data.todayStatsAvailability as unknown as Record<
        string,
        { status: string }
      >,
    )
    expect(availability.length).toBeGreaterThan(0)
    for (const metric of availability) {
      expect(metric.status).toBe("unavailable")
    }
  })

  it("reports unavailable today statistics without inventing a day window", async () => {
    const { fetchData } = getSiteTypeCapabilities(SITE_TYPES.NOVITA).account!
      .data!
    const data = await fetchData(request as never)
    expect(data.today_quota_consumption).toBe(0)
    expect(data.today_requests_count).toBe(0)
  })

  it("preserves authoritative available balance when top-up funds are zero", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/billing/balance/detail", () =>
        HttpResponse.json({
          availableBalance: "930000",
          cashBalance: "0",
          creditLimit: "200000",
        }),
      ),
    )
    const { fetchData } = getSiteTypeCapabilities(SITE_TYPES.NOVITA).account!
      .data!
    const data = await fetchData(request as never)
    expect(data.balance?.positions.slice(0, 3)).toMatchObject([
      { id: "available", amount: { value: "93" } },
      { id: "cash", amount: { value: "0" } },
      { id: "credit-limit", role: "credit-limit", amount: { value: "20" } },
    ])
  })
})

describe("novita account persistence", () => {
  it("retains saved identity when an unchanged credential is saved without a draft identity", async () => {
    await expect(
      novitaAccountPersistence.prepareIdentity({
        accessToken: "sk_test-key",
        userId: "",
        existingAccount,
      }),
    ).resolves.toBe("00000000-0000-4000-8000-000000000001")
    await expect(
      novitaAccountPersistence.prepareIdentity({
        accessToken: "",
        userId: "",
        existingAccount: {
          ...existingAccount,
          account_info: {
            ...existingAccount.account_info,
            id: "",
            access_token: "",
          },
        },
      }),
    ).resolves.toBe("")
  })
  beforeEach(() => {
    server.resetHandlers()
  })

  it("validates a new key against the OpenAPI identity endpoint", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/user/info", () =>
        HttpResponse.json({
          email: "novita-fixture@example.com",
          uid: "100001",
          uuid: "00000000-0000-4000-8000-000000000001",
        }),
      ),
    )

    const identity = await novitaAccountPersistence.prepareIdentity({
      accessToken: "sk_new-key",
      userId: "",
      existingAccount: undefined,
    })
    expect(identity).toBe("00000000-0000-4000-8000-000000000001")
  })

  it("rejects a pasted key when it does not match the detected browser identity", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/user/info", () =>
        HttpResponse.json({
          email: "other@example.com",
          uuid: "different-user",
        }),
      ),
    )
    await expect(
      novitaAccountPersistence.prepareIdentity({
        accessToken: "sk_other-account",
        userId: "detected-user",
        existingAccount: undefined,
      }),
    ).rejects.toThrow()
  })

  it("keeps an unchanged credential from revalidating", async () => {
    let identityReads = 0
    server.use(
      http.get("https://api.novita.ai/openapi/v1/user/info", () => {
        identityReads += 1
        return HttpResponse.json({ email: "x@y.z", uuid: "uuid-x" })
      }),
    )

    const identity = await novitaAccountPersistence.prepareIdentity({
      accessToken: "sk_test-key",
      userId: "00000000-0000-4000-8000-000000000001",
      existingAccount,
    })
    expect(identity).toBe("00000000-0000-4000-8000-000000000001")
    expect(identityReads).toBe(0)
  })

  it("maps an invalid-key 401 to the credential-invalid message", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/user/info", () =>
        HttpResponse.json(
          { code: 401, reason: "UNAUTHORIZED", message: "key not found" },
          { status: 401 },
        ),
      ),
    )
    await expect(
      novitaAccountPersistence.prepareIdentity({
        accessToken: "sk_bad-key",
        userId: "",
        existingAccount: undefined,
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe("Novita paired credential admission", () => {
  it("rejects a console token belonging to another account even when the API key matches", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/user/info", () =>
        HttpResponse.json({
          uuid: "expected-user",
          email: "first@example.com",
        }),
      ),
      http.get("https://api-server.novita.ai/v1/user/info", () =>
        HttpResponse.json({ uuid: "other-user", email: "other@example.com" }),
      ),
    )
    await expect(
      novitaAccountPersistence.prepareIdentity({
        accessToken:
          'novita-credentials:{"apiKey":"sk_daily","consoleToken":"wrong-account"}',
        userId: "expected-user",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_IDENTITY_MISMATCH" })
  })
})

describe("novita account completion", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("completes from a pasted key and captures the verified identity", async () => {
    server.use(
      http.get("https://api.novita.ai/openapi/v1/user/info", () =>
        HttpResponse.json({
          email: "novita-fixture@example.com",
          uid: "100001",
          uuid: "00000000-0000-4000-8000-000000000001",
        }),
      ),
    )

    const captured: unknown[] = []
    const result = await novitaAccountCompletion.complete(
      {
        url: "https://novita.ai",
        requestedAuthType: AuthTypeEnum.AccessToken,
        existingAccessToken: "sk_test-key",
        detected: {
          userId: "",
          siteType: SITE_TYPES.NOVITA,
          rawUser: {},
        },
      } as never,
      {
        createServiceRequest: (input: { baseUrl: string; auth: unknown }) =>
          ({
            baseUrl: input.baseUrl,
            auth: input.auth,
          }) as never,
        fetchSiteName: async () => "Novita AI",
        createCompletionError: (reason: string, cause: unknown) =>
          Object.assign(new Error("completion failed"), {
            reason,
            cause,
          }) as never,
        trimString: (value: unknown) =>
          typeof value === "string" ? value.trim() : "",
        createInitialCheckInConfig: ({ supported }: { supported: boolean }) =>
          ({ enabled: false, supported }) as never,
        handleCheckInSupportFetchFailure: () => false,
        captureRecoveryData: (data: unknown) => captured.push(data),
      } as never,
    )

    expect(result).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000001",
      username: "novita-fixture@example.com",
      accessToken: "sk_test-key",
      siteName: "Novita AI",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(result.checkIn).toMatchObject({ supported: false })
  })

  it("fails completion when no key is available", async () => {
    await expect(
      novitaAccountCompletion.complete(
        {
          url: "https://novita.ai",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: { userId: "", siteType: SITE_TYPES.NOVITA, rawUser: {} },
        } as never,
        {
          createServiceRequest: (() => ({})) as never,
          fetchSiteName: async () => "Novita AI",
          createCompletionError: (reason: string) =>
            Object.assign(new Error("completion failed"), { reason }) as never,
          trimString: (value: unknown) =>
            typeof value === "string" ? value.trim() : "",
          createInitialCheckInConfig: ({ supported }: { supported: boolean }) =>
            ({ enabled: false, supported }) as never,
          handleCheckInSupportFetchFailure: () => false,
          captureRecoveryData: () => {},
        } as never,
      ),
    ).rejects.toMatchObject({ reason: "access_token_missing" })
  })
})

describe("novita detection privacy policy", () => {
  it("matches only the canonical console origin", () => {
    expect(novitaAccountDetectionPrivacy.matchesUrl("https://novita.ai/")).toBe(
      true,
    )
    expect(
      novitaAccountDetectionPrivacy.matchesUrl(
        "https://novita.ai/settings/key-management",
      ),
    ).toBe(true)
    expect(
      novitaAccountDetectionPrivacy.matchesUrl(
        "https://api.novita.ai/openapi/v1/user/info",
      ),
    ).toBe(false)
    expect(
      novitaAccountDetectionPrivacy.matchesUrl("https://not-novita.example"),
    ).toBe(false)
  })

  it("routes detection failures to Novita-specific credential guidance", () => {
    // Unit tests see the unresolved key; the copy lives in each locale.
    expect(novitaAccountDetectionPrivacy.getFailureMessage()).toBe(
      "messages:novita.apiKeyRequired",
    )
  })
})
