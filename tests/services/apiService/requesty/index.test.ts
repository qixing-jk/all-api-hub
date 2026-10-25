import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { QUOTA_PER_USD } from "~/constants/money"
import type { ApiServiceAccountRequest } from "~/services/accounts/accountDataModel"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { supportsMonetaryBalance } from "~/services/accounts/metrics/monetaryBalancePolicy"
import {
  createRequestyApiKey,
  deleteRequestyApiKey,
  fetchAccountData,
  fetchRequestyAccountIdentity,
  fetchRequestyApiKey,
  fetchRequestyApiKeys,
  fetchRequestyOrg,
  fetchRequestySelfKeyInfo,
  updateRequestyApiKeyExpiry,
  updateRequestyApiKeyLimit,
} from "~/services/apiService/requesty"
import { ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const request: ApiServiceAccountRequest = {
  baseUrl: "https://app.requesty.ai",
  accountId: "account-1",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "manage-key" },
  checkIn: buildCheckInConfig(),
}

const ORG_URL = "https://api-v2.requesty.ai/v1/manage/org"
const KEYS_URL = "https://api-v2.requesty.ai/v1/manage/apikey"

describe("fetchRequestyAccountIdentity", () => {
  it.each([
    { groups: [{ organization_id: "org-a" }, { organization_id: "org-b" }] },
    { groups: [{ organization_id: " " }] },
    { groups: [{ organization_id: 123 }] },
    { groups: [null] },
    { groups: {} },
    {},
  ])("rejects malformed or conflicting group identity: %j", async (payload) => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "Engineering", balance: "1" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
        HttpResponse.json(payload),
      ),
    )
    await expect(fetchRequestyAccountIdentity(request)).rejects.toThrow(
      /invalid_requesty/,
    )
  })

  it.each([401, 429, 500])(
    "does not hide group discovery errors (%s)",
    async (status) => {
      server.use(
        http.get(ORG_URL, () =>
          HttpResponse.json({ name: "Engineering", balance: "1" }),
        ),
        http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
          HttpResponse.json(
            { error: { message: "upstream failure" } },
            { status },
          ),
        ),
      )
      await expect(fetchRequestyAccountIdentity(request)).rejects.toMatchObject(
        { statusCode: status },
      )
    },
  )

  it.each([200, 403, 404])(
    "leaves identity unknown when group discovery is unavailable (%s)",
    async (status) => {
      server.use(
        http.get(ORG_URL, () =>
          HttpResponse.json({ name: "Engineering", balance: "1" }),
        ),
        http.get("https://api-v2.requesty.ai/v1/manage/group", () =>
          HttpResponse.json({ groups: [] }, { status }),
        ),
      )
      await expect(fetchRequestyAccountIdentity(request)).resolves.toEqual({
        orgName: "Engineering",
      })
    },
  )
  it("reads the organization identity using the supplied credential", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "Engineering", balance: "12.5" }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/group", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer manage-key")
        return HttpResponse.json({
          groups: [
            { id: "group-a", organization_id: " org-123 " },
            { id: "group-b", organization_id: "org-123" },
          ],
        })
      }),
    )
    await expect(fetchRequestyAccountIdentity(request)).resolves.toEqual({
      orgName: "Engineering",
      orgId: "org-123",
    })
  })
})

describe("fetchRequestyOrg", () => {
  it("parses the string-decimal balance the live deployment returns", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "hang's Workspace", balance: "12.5" }),
      ),
    )
    await expect(fetchRequestyOrg(request)).resolves.toEqual({
      name: "hang's Workspace",
      balance: 12.5,
    })
  })

  it("rejects a malformed org payload", async () => {
    server.use(http.get(ORG_URL, () => HttpResponse.json({ balance: "1" })))
    await expect(fetchRequestyOrg(request)).rejects.toThrow(
      "invalid_requesty_org",
    )
  })

  it("surfaces the provider error envelope for an invalid key", async () => {
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
    const error = await fetchRequestyOrg(request).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.statusCode).toBe(401)
    expect(error.message).toContain("Invalid authorization token")
  })
})

describe("fetchRequestySelfKeyInfo", () => {
  it("resolves the calling key through the literal self id", async () => {
    server.use(
      http.get("https://api-v2.requesty.ai/v1/manage/apikey/self", () =>
        HttpResponse.json({
          id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
          name: "hub-disposable-probe",
          logging: false,
          monthly_spend: "0",
          monthly_limit: "0",
          permissions: { manage: "write", completions: "write" },
        }),
      ),
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "example-org", balance: "3.5" }),
      ),
    )
    await expect(fetchRequestySelfKeyInfo(request)).resolves.toEqual({
      keyId: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
      keyName: "hub-disposable-probe",
      orgName: "example-org",
    })
  })
})

describe("fetchAccountData", () => {
  it("keeps the organization's prepaid USD balance eligible for monetary totals and history", async () => {
    server.use(
      http.get(ORG_URL, () =>
        HttpResponse.json({ name: "example-org", balance: "12.5" }),
      ),
    )
    const data = await fetchAccountData(request)
    expect(data.quota).toBe(Math.round(12.5 * QUOTA_PER_USD))
    expect(data.nativeBalance).toBeUndefined()
    expect(supportsMonetaryBalance(data.nativeBalance)).toBe(true)
    // Day-boundary timezone semantics are unverified, so today stays unsupported.
    expect(data.todayStatsAvailability).toEqual(
      createUnsupportedTodayStatsAvailability(),
    )
  })
})

describe("key management", () => {
  it.each([{}, { keys: {} }, { keys: [null] }])(
    "does not report malformed key inventory as an empty organization: %j",
    async (payload) => {
      server.use(http.get(KEYS_URL, () => HttpResponse.json(payload)))
      await expect(fetchRequestyApiKeys(request)).rejects.toThrow(
        /invalid_requesty/,
      )
    },
  )
  it("lists keys with string decimals normalized", async () => {
    server.use(
      http.get(KEYS_URL, () =>
        HttpResponse.json({
          keys: [
            {
              id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
              name: "hub-disposable-probe",
              monthly_limit: "0",
              monthly_spend: "1.25",
              expires_at: "2027-01-01T00:00:00Z",
              created_at: "2026-10-21T12:21:41.958098Z",
              permissions: { manage: "write", completions: "write" },
              labels: { team: "hub" },
              created_by: {
                id: "user_1",
                email: "owner@example.com",
              },
              group: { id: "20899a25-dd03-4ae9-9e5d-3ca9cc141d53" },
            },
          ],
        }),
      ),
    )
    const keys = await fetchRequestyApiKeys(request)
    expect(keys).toEqual([
      {
        id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
        name: "hub-disposable-probe",
        monthlyLimit: 0,
        monthlySpend: 1.25,
        expiresAt: "2027-01-01T00:00:00Z",
        permissions: { manage: "write", completions: "write" },
        labels: { team: "hub" },
        createdAt: "2026-10-21T12:21:41.958098Z",
      },
    ])
  })

  it("fetches one key by uuid", async () => {
    server.use(
      http.get(
        "https://api-v2.requesty.ai/v1/manage/apikey/6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
        () =>
          HttpResponse.json({
            id: "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
            name: "probe",
            monthly_limit: "5",
            monthly_spend: "0",
            created_at: "2026-10-21T12:36:42.765502Z",
            permissions: { manage: "none", completions: "write" },
          }),
      ),
    )
    const key = await fetchRequestyApiKey(
      request,
      "6f09e3c5-9bbc-4fe4-aa14-d6cfcba92f24",
    )
    expect(key.monthlyLimit).toBe(5)
    expect(key.permissions.manage).toBe("none")
    expect(key.expiresAt).toBeUndefined()
  })

  it("creates a key and returns the one-time plaintext", async () => {
    let createdBody: Record<string, unknown> | undefined
    server.use(
      http.post(KEYS_URL, async ({ request: req }) => {
        createdBody = (await req.json()) as Record<string, unknown>
        return HttpResponse.json({
          api_key_id: "01089d27-2d4c-4146-8d6a-1c3e608f359f",
          api_key: "rqsty-sk-created-plaintext",
        })
      }),
    )
    const { key, plaintextKey } = await createRequestyApiKey(request, {
      name: "hub-second-probe",
      monthlyLimit: 5,
    })
    expect(plaintextKey).toBe("rqsty-sk-created-plaintext")
    expect(key.id).toBe("01089d27-2d4c-4146-8d6a-1c3e608f359f")
    // Verified live: keys default to completions-only unless manage is set.
    expect(createdBody).toEqual({
      name: "hub-second-probe",
      monthly_limit: 5,
      permissions: { manage: "none", completions: "write" },
    })
  })

  it("updates the monthly limit and reads the result back", async () => {
    server.use(
      http.post(
        "https://api-v2.requesty.ai/v1/manage/apikey/01089d27/limit",
        () => new HttpResponse(null, { status: 200 }),
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/apikey/01089d27", () =>
        HttpResponse.json({
          id: "01089d27",
          name: "probe",
          monthly_limit: "5",
          monthly_spend: "0",
          created_at: "2026-10-21T12:36:42.765502Z",
          permissions: { manage: "none", completions: "write" },
        }),
      ),
    )
    const updated = await updateRequestyApiKeyLimit(request, "01089d27", 5)
    expect(updated.monthlyLimit).toBe(5)
  })

  it("clears the expiry by sending null and reads the result back", async () => {
    let expiryBody: unknown
    server.use(
      http.post(
        "https://api-v2.requesty.ai/v1/manage/apikey/01089d27/expiry",
        async ({ request: req }) => {
          expiryBody = await req.json()
          return new HttpResponse(null, { status: 200 })
        },
      ),
      http.get("https://api-v2.requesty.ai/v1/manage/apikey/01089d27", () =>
        HttpResponse.json({
          id: "01089d27",
          name: "probe",
          monthly_limit: "0",
          monthly_spend: "0",
          created_at: "2026-10-21T12:36:42.765502Z",
          permissions: { manage: "none", completions: "write" },
        }),
      ),
    )
    const updated = await updateRequestyApiKeyExpiry(
      request,
      "01089d27",
      undefined,
    )
    expect(expiryBody).toEqual({ expires_at: null })
    expect(updated.expiresAt).toBeUndefined()
  })

  it("deletes a key against the empty 200 acknowledgement", async () => {
    let deleteCalled = false
    server.use(
      http.delete(
        "https://api-v2.requesty.ai/v1/manage/apikey/01089d27",
        () => {
          deleteCalled = true
          return new HttpResponse(null, { status: 200 })
        },
      ),
    )
    await expect(
      deleteRequestyApiKey(request, "01089d27"),
    ).resolves.toBeUndefined()
    expect(deleteCalled).toBe(true)
  })
})

describe("key readback and creation drift", () => {
  it("refuses to report a malformed key detail as a key", async () => {
    server.use(
      http.get("https://api-v2.requesty.ai/v1/manage/apikey/01089d27", () =>
        HttpResponse.json({ id: "01089d27" }),
      ),
    )
    await expect(fetchRequestyApiKey(request, "01089d27")).rejects.toThrow(
      /invalid_requesty_apikey$/,
    )
  })

  it("defaults a key row without permissions or labels instead of dropping it", async () => {
    server.use(
      http.get("https://api-v2.requesty.ai/v1/manage/apikey/01089d27", () =>
        HttpResponse.json({
          id: "01089d27",
          name: "probe",
          monthly_limit: "0",
          monthly_spend: "0",
          created_at: "2026-10-21T12:36:42.765502Z",
        }),
      ),
    )
    await expect(
      fetchRequestyApiKey(request, "01089d27"),
    ).resolves.toMatchObject({
      permissions: { manage: "none", completions: "none" },
      labels: {},
    })
  })

  it("creates a management key without a limit and reports its own permissions", async () => {
    let createdBody: Record<string, unknown> | undefined
    server.use(
      http.post(KEYS_URL, async ({ request: req }) => {
        createdBody = (await req.json()) as Record<string, unknown>
        return HttpResponse.json({
          api_key_id: "01089d27-2d4c-4146-8d6a-1c3e608f359f",
          api_key: "rqsty-sk-created-plaintext",
        })
      }),
    )

    const { key } = await createRequestyApiKey(request, {
      name: "hub-manage-probe",
      managePermission: true,
    })

    // An unlimited key must omit the cap rather than send zero.
    expect(createdBody).toEqual({
      name: "hub-manage-probe",
      permissions: { manage: "write", completions: "write" },
    })
    expect(key.permissions.manage).toBe("write")
    expect(key.monthlyLimit).toBe(0)
  })

  it("rejects a create acknowledgement without one-time plaintext", async () => {
    server.use(
      http.post(KEYS_URL, () => HttpResponse.json({ api_key_id: "01089d27" })),
    )
    await expect(
      createRequestyApiKey(request, { name: "hub-probe" }),
    ).rejects.toThrow(/invalid_requesty_apikey_create$/)
  })
})

describe("manage transport boundaries", () => {
  it("never sends an unauthenticated management request", async () => {
    let reached = false
    server.use(
      http.get(ORG_URL, () => {
        reached = true
        return HttpResponse.json({ name: "org", balance: "1" })
      }),
    )

    await expect(
      fetchRequestyOrg({
        ...request,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "   " },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(reached).toBe(false)
  })

  it("rejects a non-record envelope instead of returning it", async () => {
    server.use(http.get(ORG_URL, () => HttpResponse.json(["not", "a", "org"])))
    await expect(fetchRequestyOrg(request)).rejects.toMatchObject({
      message: expect.stringMatching(/invalid/i),
    })
  })

  it("reports a self-key payload without identity as unreadable", async () => {
    server.use(
      http.get("https://api-v2.requesty.ai/v1/manage/apikey/self", () =>
        HttpResponse.json({ name: "only-a-name" }),
      ),
    )
    await expect(fetchRequestySelfKeyInfo(request)).rejects.toThrow(
      /invalid_requesty_apikey_self/,
    )
  })
})
