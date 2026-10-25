import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import { ACCOUNT_KEY_CREDENTIAL_ROLES } from "~/services/apiAdapters/contracts/accountKeyResource"
import { requestyAccountBootstrap } from "~/services/apiAdapters/requesty/account/accountBootstrap"
import { requestyAccountCompletion } from "~/services/apiAdapters/requesty/account/accountCompletion"
import { requestyAccountPersistence } from "~/services/apiAdapters/requesty/account/accountPersistence"
import { requestyAccountRefresh } from "~/services/apiAdapters/requesty/account/accountRefresh"
import { requestyCapabilities } from "~/services/apiAdapters/requesty/index"
import { requestyAccountKeyResources } from "~/services/apiAdapters/requesty/keys/accountKeyResource"
import {
  createRequestyKeyEditor,
  editRequestyKeyEditor,
} from "~/services/apiAdapters/requesty/keys/keyEditor"
import { requestyProviderModelCatalog } from "~/services/apiAdapters/requesty/models/providerModelCatalog"
import { isValidProviderModelCatalogPricing } from "~/services/modelList/providerCatalogAdmission"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { createAccountCompletionHelpersMock } from "~~/tests/services/apiAdapters/checkInFixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const request: ApiServiceAccountRequest = {
  baseUrl: "https://app.requesty.ai",
  accountId: "account-1",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "manage-key" },
  checkIn: buildCheckInConfig(),
}

const ORG_URL = "https://api-v2.requesty.ai/v1/manage/org"
const SELF_URL = "https://api-v2.requesty.ai/v1/manage/apikey/self"
const KEYS_URL = "https://api-v2.requesty.ai/v1/manage/apikey"

const EMPTY_ACCOUNT_INFO = {
  access_token: "",
  username: "",
  id: "",
  quota: 0,
  today_prompt_tokens: 0,
  today_completion_tokens: 0,
  today_quota_consumption: 0,
  today_requests_count: 0,
  today_income: 0,
}

describe("requestyAccountBootstrap", () => {
  it("does not mistake a numeric request hint for organization identity", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "Engineering", balance: "1" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
        HttpResponse.json({ groups: [] }),
      ),
    )
    await expect(
      requestyAccountBootstrap.fetchUserInfo({
        ...request,
        auth: { ...request.auth, userId: 123 },
      }),
    ).resolves.toMatchObject({ id: expect.stringMatching(/^requesty:.+/) })
  })
  it.each([200, 403])(
    "keeps an unknown organization local through detect and save (%s)",
    async (status) => {
      server.use(
        http.get(ORG_URL, () =>
          HttpResponse.json({ name: "Engineering", balance: "1" }),
        ),
        http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
          HttpResponse.json({ groups: [] }, { status }),
        ),
      )
      const detected = await requestyAccountBootstrap.fetchUserInfo(request)
      expect(detected.username).toBe("Engineering")
      expect(detected.id).toMatch(/^requesty:.+/)
      await expect(
        requestyAccountPersistence.prepareIdentity({
          accessToken: "manage-key",
          userId: detected.id,
        }),
      ).resolves.toBe(detected.id)
      await expect(
        requestyAccountBootstrap.fetchUserInfo({
          ...request,
          auth: { ...request.auth, userId: detected.id },
        }),
      ).resolves.toMatchObject({ id: detected.id })
      // Another independent account cannot inherit identity just from its name.
      const independent = await requestyAccountBootstrap.fetchUserInfo(request)
      expect(independent.id).not.toBe(detected.id)
    },
  )
  it("keeps organization identity and display name stable across different keys", async () => {
    server.use(
      http.get(SELF_URL, () =>
        HttpResponse.json({
          id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
          name: "hub-probe",
          monthly_limit: "0",
          monthly_spend: "0",
          permissions: { manage: "write", completions: "write" },
        }),
      ),
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "example-org", balance: "1" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
        HttpResponse.json({ groups: [{ organization_id: "org-123" }] }),
      ),
    )
    await expect(
      requestyAccountBootstrap.fetchUserInfo(request),
    ).resolves.toMatchObject({
      username: "example-org",
      id: "org-123",
      access_token: "manage-key",
    })
    await expect(
      requestyAccountBootstrap.fetchUserInfo({
        ...request,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "rotated-key",
        },
      }),
    ).resolves.toMatchObject({
      username: "example-org",
      id: "org-123",
      access_token: "rotated-key",
    })
  })

  it("declares check-in unsupported", async () => {
    await expect(
      requestyAccountBootstrap.fetchCheckInSupport(request, {}),
    ).resolves.toBe(false)
    await expect(
      requestyAccountBootstrap.loadBootstrapFacts(request),
    ).resolves.toMatchObject({
      displayName: "Requesty",
      checkInSupported: false,
    })
  })
})

describe("requestyAccountPersistence", () => {
  it("does not carry an unknown identity across credential replacement", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "Engineering", balance: "1" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
        HttpResponse.json({ groups: [] }),
      ),
    )
    const id = await requestyAccountPersistence.prepareIdentity({
      accessToken: "rotated-key",
      userId: "requesty:previous",
      existingAccount: {
        site_type: SITE_TYPES.REQUESTY,
        account_info: {
          ...EMPTY_ACCOUNT_INFO,
          id: "requesty:previous",
          access_token: "manage-key",
        },
      },
    })
    expect(id).toMatch(/^requesty:.+/)
    expect(id).not.toBe("requesty:previous")
  })
  it("derives the stored identity from the credential's organization", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "Engineering", balance: "1" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
        HttpResponse.json({ groups: [{ organization_id: "org-123" }] }),
      ),
    )
    await expect(
      requestyAccountPersistence.prepareIdentity({
        accessToken: "manage-key",
        userId: "",
      }),
    ).resolves.toBe("org-123")
  })

  it("keeps identity stable when editing without replacing the credential", async () => {
    await expect(
      requestyAccountPersistence.prepareIdentity({
        accessToken: " manage-key ",
        userId: "",
        existingAccount: {
          site_type: SITE_TYPES.REQUESTY,
          account_info: {
            ...EMPTY_ACCOUNT_INFO,
            id: "org-123",
            access_token: "manage-key",
          },
        },
      }),
    ).resolves.toBe("org-123")
  })

  it.each(["org-123", "org-other"])(
    "resolves the replacement credential's organization (%s) despite stale form identity",
    async (orgId) => {
      server.use(
        http.get(ORG_URL, () =>
          HttpResponse.json({ name: "Engineering", balance: "1" }),
        ),
        http.get(
          "https://api-v2.requesty.ai/v1/manage/group",
          ({ request }) => {
            expect(request.headers.get("Authorization")).toBe(
              "Bearer rotated-key",
            )
            return HttpResponse.json({ groups: [{ organization_id: orgId }] })
          },
        ),
      )
      await expect(
        requestyAccountPersistence.prepareIdentity({
          accessToken: "rotated-key",
          userId: "org-123",
          existingAccount: {
            site_type: SITE_TYPES.REQUESTY,
            account_info: {
              ...EMPTY_ACCOUNT_INFO,
              id: "org-123",
              access_token: "manage-key",
            },
          },
        }),
      ).resolves.toBe(orgId)
    },
  )

  it("is registered on the site capabilities", () => {
    expect(requestyCapabilities.account?.persistence).toBe(
      requestyAccountPersistence,
    )
  })
})

describe("requestyAccountCompletion", () => {
  const { helpers } = createAccountCompletionHelpersMock(SITE_TYPES.REQUESTY, {
    automaticExecutionEnabled: false,
  })

  it("fails with the documented reason when no token is available", async () => {
    await expect(
      requestyAccountCompletion.complete(
        {
          url: "https://app.requesty.ai",
          requestedAuthType: AuthTypeEnum.AccessToken,
          detected: {
            userId: "",
            user: {},
            siteType: SITE_TYPES.REQUESTY,
          },
          context: {},
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })
})

describe("requestyAccountRefresh", () => {
  it("returns healthy data for a valid key", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "example-org", balance: "7.25" }),
      ),
    )
    const result = await requestyAccountRefresh.refreshAccount(request)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.quota).toBe(3_625_000)
      expect(result.data.nativeBalance).toBeUndefined()
    }
  })

  it("classifies an invalid token failure", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json(
          {
            error: { origin: "api-v2", message: "Invalid authorization token" },
          },
          { status: 401 },
        ),
      ),
    )
    const result = await requestyAccountRefresh.refreshAccount(request)
    expect(result.success).toBe(false)
  })
})

describe("requestyAccountKeyResources", () => {
  it.each(["readback", "second write"])(
    "does not claim an edit was unapplied after a successful write and failed %s",
    async (failureStage) => {
      let monthlyLimit = 5
      let detailReads = 0
      const detail = () => ({
        id: "example",
        name: "example",
        monthly_limit: String(monthlyLimit),
        monthly_spend: "0",
        created_at: "2026-10-21T12:21:41.958098Z",
        permissions: { manage: "none", completions: "write" },
      })
      server.use(
        http.get(`${KEYS_URL}/example`, () => {
          detailReads++
          return failureStage === "readback" && detailReads > 1
            ? HttpResponse.json(
                { error: { message: "read denied" } },
                { status: 403 },
              )
            : HttpResponse.json(detail())
        }),
        http.post(`${KEYS_URL}/example/limit`, () => {
          monthlyLimit = 7
          return new HttpResponse(null, { status: 200 })
        }),
        http.post(`${KEYS_URL}/example/expiry`, () =>
          HttpResponse.json(
            { error: { message: "expiry rejected" } },
            { status: 400 },
          ),
        ),
      )
      const session = await requestyAccountKeyResources.open({
        account: { id: "account-1", siteType: SITE_TYPES.REQUESTY },
        request,
      })
      const collection = await session.openCollection("default")
      const editor = await collection.openEditEditor({
        accountId: "account-1",
        siteType: SITE_TYPES.REQUESTY,
        scopeKey: "default",
        resourceId: "example",
      })
      await expect(
        editor.submit({ monthly_limit: 7, expires_at: "2099-01-01T00:00:00Z" }),
      ).rejects.toMatchObject({
        failure: { code: "mutation_state_uncertain" },
      })
      expect(monthlyLimit).toBe(7)
    },
  )
  it.each([
    [401, "authentication_failed"],
    [403, "permission_denied"],
    [404, "not_found"],
    [500, "unavailable"],
  ])(
    "preserves a detail lookup failure (%s) instead of claiming the key disappeared",
    async (status, code) => {
      server.use(
        http.get(`${KEYS_URL}/example`, () =>
          HttpResponse.json(
            { error: { message: "upstream failure" } },
            { status: Number(status) },
          ),
        ),
      )
      const session = await requestyAccountKeyResources.open({
        account: {
          id: "account-1",
          name: "example-org",
          siteType: SITE_TYPES.REQUESTY,
        },
        request,
      })
      const collection = await session.openCollection("default")
      await expect(
        collection.get({
          accountId: "account-1",
          siteType: SITE_TYPES.REQUESTY,
          scopeKey: "default",
          resourceId: "example",
        }),
      ).rejects.toMatchObject({ failure: { code } })
    },
  )
  it("only offers expiry through editing, where the upstream expiry update is implemented", () => {
    const editor = createRequestyKeyEditor()
    expect(editor.fields.some((field) => field.fieldId === "expires_at")).toBe(
      false,
    )
  })
  it("validates edit values without the create-only name field", () => {
    const editor = editRequestyKeyEditor({
      id: "key-1",
      name: "existing",
      monthlyLimit: 5,
      monthlySpend: 0,
      permissions: { manage: "none", completions: "write" },
      labels: {},
      createdAt: "2026-10-21T12:21:41.958098Z",
    })
    // The edit editor renders only the limit and expiry; the name is not
    // editable and must not fail validation by being absent.
    const result = editor.validate({
      monthly_limit: 7,
      expires_at: "",
    })
    expect(result.valid).toBe(true)
    expect(editor.buildCommand({ monthly_limit: 7, expires_at: "" })).toEqual({
      monthlyLimit: 7,
    })
  })

  it("lists keys with unlimited limit facts", async () => {
    server.use(
      http.get(KEYS_URL, () =>
        HttpResponse.json({
          keys: [
            {
              id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
              name: "hub-probe",
              monthly_limit: "0",
              monthly_spend: "1.25",
              created_at: "2026-10-21T12:21:41.958098Z",
              permissions: { manage: "write", completions: "write" },
            },
          ],
        }),
      ),
      http.get(SELF_URL, () =>
        HttpResponse.json({
          id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
          name: "hub-probe",
          monthly_limit: "0",
          monthly_spend: "1.25",
          created_at: "2026-10-21T12:21:41.958098Z",
          permissions: { manage: "write", completions: "write" },
        }),
      ),
    )
    const session = await requestyAccountKeyResources.open({
      account: {
        id: "account-1",
        name: "example-org",
        siteType: SITE_TYPES.REQUESTY,
      },
      request,
    })
    const scopes = await session.listScopes()
    expect(scopes).toEqual([
      {
        scopeKey: "default",
        routeKey: "default",
        displayName: "Requesty",
        isDefault: true,
      },
    ])
    const collection = await session.openCollection("default")
    const page = await collection.list()
    expect(page.items).toHaveLength(1)
    const item = atIndex(page.items, 0)
    expect(item.displayName).toBe("hub-probe")
    expect(item.actions.canRotate).toBe(false)
    // `self` resolves to the calling key: that row is the account's own
    // credential and a manage key, both surfaced as provider facts.
    expect(item.credentialRole).toBe(ACCOUNT_KEY_CREDENTIAL_ROLES.Account)
    expect(
      item.displayFacts?.find((fact) => fact.kind === "permission"),
    ).toEqual({
      fieldId: "permissions",
      kind: "permission",
      role: "manage",
      granted: true,
    })
  })

  it("marks only the calling key and reports keys without management access", async () => {
    server.use(
      http.get(KEYS_URL, () =>
        HttpResponse.json({
          keys: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "other-tool",
              monthly_limit: "10",
              monthly_spend: "0",
              created_at: "2026-10-21T12:21:41.958098Z",
              permissions: { manage: "none", completions: "write" },
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "account-credential",
              monthly_limit: "0",
              monthly_spend: "0",
              created_at: "2026-10-21T12:21:41.958098Z",
              permissions: { manage: "write", completions: "write" },
            },
          ],
        }),
      ),
      http.get(SELF_URL, () =>
        HttpResponse.json({
          id: "22222222-2222-4222-8222-222222222222",
          name: "account-credential",
          monthly_limit: "0",
          monthly_spend: "0",
          created_at: "2026-10-21T12:21:41.958098Z",
          permissions: { manage: "write", completions: "write" },
        }),
      ),
    )
    const session = await requestyAccountKeyResources.open({
      account: {
        id: "account-1",
        name: "example-org",
        siteType: SITE_TYPES.REQUESTY,
      },
      request,
    })
    const collection = await session.openCollection("default")
    const page = await collection.list()
    const [otherKey, credentialKey] = page.items
    expect(otherKey?.credentialRole).toBeUndefined()
    expect(
      otherKey?.displayFacts?.find((fact) => fact.kind === "permission"),
    ).toMatchObject({ granted: false })
    expect(credentialKey?.credentialRole).toBe(
      ACCOUNT_KEY_CREDENTIAL_ROLES.Account,
    )
  })

  it("still lists keys when the self route is unavailable", async () => {
    server.use(
      http.get(KEYS_URL, () =>
        HttpResponse.json({
          keys: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "hub-probe",
              monthly_limit: "0",
              monthly_spend: "0",
              created_at: "2026-10-21T12:21:41.958098Z",
              permissions: { manage: "write", completions: "write" },
            },
          ],
        }),
      ),
      http.get(SELF_URL, () => HttpResponse.json({}, { status: 403 })),
    )
    const session = await requestyAccountKeyResources.open({
      account: {
        id: "account-1",
        name: "example-org",
        siteType: SITE_TYPES.REQUESTY,
      },
      request,
    })
    const collection = await session.openCollection("default")
    const page = await collection.list()
    expect(page.items).toHaveLength(1)
    expect(atIndex(page.items, 0).credentialRole).toBeUndefined()
  })
})

describe("requestyProviderModelCatalog", () => {
  it("adapts per-token prices and marks the catalog provider-wide", async () => {
    server.use(
      http.get("https://router.requesty.ai/v1/models", () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              id: "minimaxi/minimax-m3.1-flash",
              input_price: 1.5e-7,
              output_price: 6e-7,
              cached_price: 1.5e-8,
              context_window: 1000000,
              supports_caching: true,
              supports_vision: true,
              supports_reasoning: true,
              supports_tool_calling: true,
            },
          ],
        }),
      ),
    )
    const response = await requestyProviderModelCatalog.fetchPricing({})
    expect(response.data).toHaveLength(1)
    const model = atIndex(response.data, 0)
    expect(model.model_name).toBe("minimaxi/minimax-m3.1-flash")
    // Per-token quotes stay in token units; the engine scales them.
    expect(model.pricingPlan?.rates.input?.amount).toBe(1.5e-7)
    expect(model.pricingPlan?.rates.output?.amount).toBe(6e-7)
    expect(model.pricingPlan?.rates.cacheRead?.amount).toBe(1.5e-8)
    expect(model.price_metadata.precision).toBe("exact")
    expect(response.model_list_source.supportsPricing).toBe(true)
  })

  it("satisfies the provider catalog admission boundary for live-shaped rows", async () => {
    server.use(
      http.get("https://router.requesty.ai/v1/models", () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              // A cached price exercises the cache meter; the trailing
              // whitespace in the description mirrors the live catalog.
              id: "deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct",
              description: "Flagship open-weight coding model. ",
              input_price: 4e-7,
              output_price: 1.6e-6,
              cached_price: 4e-7,
              context_window: 1000000,
              supports_caching: true,
              supports_vision: false,
              supports_reasoning: false,
              supports_tool_calling: true,
            },
            {
              id: "unknown/model",
              input_price: -1,
              output_price: -1,
            },
          ],
        }),
      ),
    )
    const response = await requestyProviderModelCatalog.fetchPricing({})
    expect(
      isValidProviderModelCatalogPricing(response, SITE_TYPES.REQUESTY),
    ).toBe(true)
    const priced = atIndex(response.data, 0)
    // Exact quotes carry the canonical per-million-token prices.
    const tokenPrices = priced.token_price_usd_per_million
    expect(tokenPrices?.input).toBeCloseTo(0.4, 12)
    expect(tokenPrices?.output).toBeCloseTo(1.6, 12)
    expect(tokenPrices?.cache_read).toBeCloseTo(0.4, 12)
  })

  it("marks missing prices unavailable instead of guessing", async () => {
    server.use(
      http.get("https://router.requesty.ai/v1/models", () =>
        HttpResponse.json({
          object: "list",
          data: [
            {
              id: "unknown/model",
              input_price: -1,
              output_price: -1,
            },
          ],
        }),
      ),
    )
    const response = await requestyProviderModelCatalog.fetchPricing({})
    const model = atIndex(response.data, 0)
    expect(model.price_metadata.unavailable_reason).toBeDefined()
  })

  it.each([null, "", undefined])(
    "does not turn an absent primary price (%s) into a free model",
    async (price) => {
      server.use(
        http.get("https://router.requesty.ai/v1/models", () =>
          HttpResponse.json({
            data: [
              { id: "unknown/model", input_price: price, output_price: 0 },
            ],
          }),
        ),
      )
      const response = await requestyProviderModelCatalog.fetchPricing({})
      const model = atIndex(response.data, 0)
      expect(model.price_metadata.precision).toBe("unavailable")
      expect(model.pricingPlan?.rates).toEqual({})
    },
  )
})

describe("requesty inference eligibility", () => {
  const listWith = async (
    manage: string,
    completions: string | null = "write",
    expiresAt?: string,
  ) => {
    server.use(
      http.get(KEYS_URL, () =>
        HttpResponse.json({
          keys: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              name: "example",
              monthly_limit: "10",
              monthly_spend: "4",
              created_at: "2026-10-21T12:21:41.958098Z",
              permissions: { manage, completions },
              expires_at: expiresAt,
            },
          ],
        }),
      ),
      http.get(SELF_URL, () =>
        HttpResponse.json({
          id: "55555555-5555-4555-8555-555555555555",
          name: "other",
          monthly_limit: "0",
          monthly_spend: "0",
          created_at: "2026-10-21T12:21:41.958098Z",
          permissions: { manage: "write", completions: "write" },
        }),
      ),
    )
    const session = await requestyAccountKeyResources.open({
      account: {
        id: "account-1",
        name: "example-org",
        siteType: SITE_TYPES.REQUESTY,
      },
      request,
    })
    const collection = await session.openCollection("default")
    const page = await collection.list()
    return atIndex(page.items, 0)
  }

  it("marks a manage key as non-inference even though it may answer completions", async () => {
    const item = await listWith("write")
    expect(item.runtimeKey?.inference).toBe(false)
  })

  it("keeps an ordinary key eligible for inference", async () => {
    const item = await listWith("none")
    expect(item.runtimeKey?.inference).toBe(true)
  })

  it.each(["none", "read", "unknown", null])(
    "does not offer inference when completions permission is %s",
    async (permission) => {
      const item = await listWith("none", permission)
      expect(item.runtimeKey?.inference).toBe(false)
    },
  )

  it("reports the monthly cap as a total instead of a remaining balance", async () => {
    const item = await listWith("none")
    expect(item.displayFacts).toContainEqual({
      fieldId: "monthly_limit",
      kind: "money",
      role: "total",
      amountUsd: 10,
      unlimited: false,
    })
  })

  it("reports a key with an elapsed expiry as expired", async () => {
    const item = await listWith("none", "write", "2000-01-01T00:00:00Z")
    expect(item.status).toBe("expired")
  })
})
