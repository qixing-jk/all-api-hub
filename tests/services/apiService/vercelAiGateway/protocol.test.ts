import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  fetchVercelCredits,
  fetchVercelTeams,
  parseVercelTeams,
  parseVercelUser,
  resolveVercelAccountScope,
} from "~/services/apiService/vercelAiGateway"
import {
  createVercelAiGatewayKey,
  deleteVercelAiGatewayKey,
  getVercelAiGatewayKey,
  listVercelAiGatewayKeys,
  parseVercelAiGatewayKey,
} from "~/services/apiService/vercelAiGateway/keys"
import {
  fetchVercelModelCatalog,
  parseVercelCatalogModel,
} from "~/services/apiService/vercelAiGateway/models"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const TEAM_ID = "team_test"

/** Saved account: console URL, team as the identity, Vercel access token. */
const request = {
  baseUrl: "https://vercel.com",
  accountId: "acc-vercel",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: TEAM_ID,
    accessToken: "vercel-access-token",
  },
} satisfies ApiServiceRequest

const keyRow = {
  id: "key_1",
  name: "Primary",
  partialKey: "abc123",
  purpose: "ai-gateway",
  teamId: TEAM_ID,
  projectId: null,
  expiresAt: null,
  activeAt: 1_760_000_000_000,
  createdAt: 1_760_000_000_000,
  createdBy: "user_1",
  leakedAt: null,
  leakedUrl: null,
  createdByAppId: null,
  metadata: { spendAttribution: "user" },
}

describe("Vercel AI Gateway protocol", () => {
  beforeEach(() => server.resetHandlers())
  afterEach(() => server.resetHandlers())

  it("keeps an explicitly selected team instead of switching to the dashboard default", () => {
    const user = { id: "u", username: "user", defaultTeamId: "team_a" }
    const teams = [
      { id: "team_a", slug: "a", name: "A" },
      { id: "team_b", slug: "b", name: "B" },
    ]
    expect(resolveVercelAccountScope(user, teams, "team_b").teamId).toBe(
      "team_b",
    )
    expect(() =>
      resolveVercelAccountScope(user, teams, "team_not_authorized"),
    ).toThrow()
  })

  it("creates a budgeted key with its reset period and spend alerts", async () => {
    let submitted: unknown
    server.use(
      http.post("https://api.vercel.com/v1/api-keys", async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({ apiKeyString: "vck_once", apiKey: keyRow })
      }),
    )
    await createVercelAiGatewayKey(request, TEAM_ID, {
      name: "Experiment",
      aiGatewayQuota: {
        limitAmount: 10,
        refreshPeriod: "weekly",
        alertThresholds: [50, 100],
      },
    })
    expect(submitted).toEqual({
      purpose: "ai-gateway",
      name: "Experiment",
      aiGatewayQuota: {
        limitAmount: 10,
        refreshPeriod: "weekly",
        alertThresholds: [50, 100],
      },
    })
  })

  it("reads every key page rather than silently losing the next page", async () => {
    const cursors: string[] = []
    server.use(
      http.get("https://api.vercel.com/v1/api-keys", ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("until") ?? "first"
        cursors.push(cursor)
        return HttpResponse.json({
          apiKeys: [{ ...keyRow, id: cursor === "first" ? "key_a" : "key_b" }],
          pagination: { next: cursor === "first" ? 1234 : null },
        })
      }),
    )
    expect(
      (await listVercelAiGatewayKeys(request, TEAM_ID)).map((k) => k.id),
    ).toEqual(["key_a", "key_b"])
    expect(cursors).toEqual(["first", "1234"])
  })

  it("offers teams from later pages as well", async () => {
    server.use(
      http.get("https://api.vercel.com/v2/teams", ({ request }) => {
        const second = new URL(request.url).searchParams.has("until")
        return HttpResponse.json({
          teams: [
            { id: second ? "team_b" : "team_a", slug: second ? "b" : "a" },
          ],
          pagination: { next: second ? null : 123 },
        })
      }),
    )
    expect((await fetchVercelTeams(request)).map((t) => t.id)).toEqual([
      "team_a",
      "team_b",
    ])
  })

  it("lists only the team's AI Gateway keys and sends the team on the request", async () => {
    let seenUrl = ""
    let seenAuth = ""
    server.use(
      http.get("https://api.vercel.com/v1/api-keys", ({ request: seen }) => {
        seenUrl = seen.url
        seenAuth = seen.headers.get("authorization") ?? ""
        return HttpResponse.json({
          apiKeys: [keyRow, { ...keyRow, id: "key_2", purpose: "deployment" }],
          pagination: { count: 2, next: null, prev: null },
          quotaEnrichment: "ok",
        })
      }),
    )

    const keys = await listVercelAiGatewayKeys(request, TEAM_ID)

    expect(seenUrl).toContain("purpose=ai-gateway")
    expect(seenUrl).toContain(`teamId=${TEAM_ID}`)
    expect(seenAuth).toBe("Bearer vercel-access-token")
    // The deployment can return other key purposes; only AI Gateway keys are ours.
    expect(keys.map((key) => key.id)).toEqual(["key_1", "key_2"])
    expect(keys[0]!.spendAttribution).toBe("user")
  })

  it("drops rows that do not match the verified inventory shape", async () => {
    expect(parseVercelAiGatewayKey({ id: "only-id" })).toBeNull()
    expect(parseVercelAiGatewayKey({ ...keyRow, activeAt: null })).toBeNull()
    expect(parseVercelAiGatewayKey({ ...keyRow, partialKey: "" })).toBeNull()
  })

  it("rejects an unreadable inventory instead of reporting an empty list", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys", () =>
        HttpResponse.json({ unexpected: true }),
      ),
    )
    await expect(listVercelAiGatewayKeys(request, TEAM_ID)).rejects.toThrow(
      "vercel_key_inventory_unreadable",
    )
  })

  it("fails closed when the account has no team identity", async () => {
    await expect(
      listVercelAiGatewayKeys(
        { ...request, auth: { ...request.auth, userId: undefined } },
        "",
      ),
    ).rejects.toThrow("vercel_team_required")
  })

  it("reads one key by id", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
    )
    const key = await getVercelAiGatewayKey(request, TEAM_ID, "key_1")
    expect(key.name).toBe("Primary")
  })

  it("creates a key and keeps the one-time plaintext from the response", async () => {
    let body: unknown
    server.use(
      http.post(
        "https://api.vercel.com/v1/api-keys",
        async ({ request: seen }) => {
          body = await seen.json()
          return HttpResponse.json({
            apiKeyString: "vck_0123456789abcdef",
            apiKey: keyRow,
          })
        },
      ),
    )

    const created = await createVercelAiGatewayKey(request, TEAM_ID, {
      name: "Primary",
      expiresAt: 1_800_000_000_000,
      spendAttribution: "team",
    })

    expect(body).toEqual({
      purpose: "ai-gateway",
      name: "Primary",
      expiresAt: 1_800_000_000_000,
      metadata: { spendAttribution: "team" },
    })
    expect(created.secret).toBe("vck_0123456789abcdef")
    expect(created.key.id).toBe("key_1")
  })

  it("rejects a create response without the plaintext secret", async () => {
    server.use(
      http.post("https://api.vercel.com/v1/api-keys", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
    )
    await expect(
      createVercelAiGatewayKey(request, TEAM_ID, { name: "Primary" }),
    ).rejects.toThrow("vercel_key_inventory_unreadable")
  })

  it("deletes a key and treats 204 with an empty body as success", async () => {
    let method = ""
    server.use(
      http.delete(
        "https://api.vercel.com/v1/api-keys/key_1",
        ({ request: seen }) => {
          method = seen.method
          return new HttpResponse(null, { status: 204 })
        },
      ),
    )
    await deleteVercelAiGatewayKey(request, TEAM_ID, "key_1")
    expect(method).toBe("DELETE")
  })

  it("surfaces the deployment's error envelope on a rejected delete", async () => {
    server.use(
      http.delete("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json(
          { error: { code: "forbidden", message: "Not authorized" } },
          { status: 403 },
        ),
      ),
    )
    await expect(
      deleteVercelAiGatewayKey(request, TEAM_ID, "key_1"),
    ).rejects.toMatchObject({ statusCode: 403, message: "Not authorized" })
  })

  it("reads credits as USD strings with the team on the request", async () => {
    let seenUrl = ""
    server.use(
      http.get(
        "https://ai-gateway.vercel.sh/v1/credits",
        ({ request: seen }) => {
          seenUrl = seen.url
          return HttpResponse.json({ balance: "95.50", total_used: "4.50" })
        },
      ),
    )

    const credits = await fetchVercelCredits(request, TEAM_ID)

    expect(seenUrl).toContain(`teamId=${TEAM_ID}`)
    expect(credits).toEqual({ balanceUsd: 95.5, totalUsedUsd: 4.5 })
  })

  it("rejects a credits payload that is not the documented shape", async () => {
    server.use(
      http.get("https://ai-gateway.vercel.sh/v1/credits", () =>
        HttpResponse.json({ balance: 95.5 }),
      ),
    )
    await expect(fetchVercelCredits(request, TEAM_ID)).rejects.toThrow(
      "vercel_credits_unreadable",
    )
  })

  it("reads the model catalog with availability annotations", async () => {
    let seenUrl = ""
    server.use(
      http.get(
        "https://ai-gateway.vercel.sh/v1/models",
        ({ request: seen }) => {
          seenUrl = seen.url
          return HttpResponse.json({
            object: "list",
            data: [
              {
                id: "openai/gpt-test",
                name: "GPT Test",
                owned_by: "openai",
                type: "language",
                tags: ["tool-use"],
                context_window: 128000,
                max_tokens: 16384,
                pricing: { input: "0.000002", output: "0.000012" },
                model_eligibility: {
                  status: "eligible",
                  evaluated_runtime: "http",
                },
              },
              { id: "image/test", type: "image", pricing: { image: "0.04" } },
            ],
          })
        },
      ),
    )

    const models = await fetchVercelModelCatalog(request, TEAM_ID)

    expect(seenUrl).toContain("include_availability")
    expect(seenUrl).toContain(`teamId=${TEAM_ID}`)
    expect(models).toHaveLength(2)
    expect(models[0]!.pricing).toEqual({ input: 0.000002, output: 0.000012 })
    expect(models[0]!.eligibility?.status).toBe("eligible")
    // Image rows publish no token rate; nothing is invented.
    expect(models[1]!.pricing).toEqual({})
  })

  it("ignores catalog rows without an id", () => {
    expect(parseVercelCatalogModel({ name: "missing id" })).toBeNull()
  })

  it("reads the personal identity and resolves the account team", () => {
    const user = parseVercelUser({
      user: {
        id: "user_1",
        username: "someone",
        email: "someone@example.invalid",
        defaultTeamId: TEAM_ID,
        billing: { plan: "hobby" },
      },
    })
    expect(user).toEqual({
      id: "user_1",
      username: "someone",
      email: "someone@example.invalid",
      defaultTeamId: TEAM_ID,
      plan: "hobby",
    })

    const teams = parseVercelTeams({
      teams: [
        { id: "team_other", slug: "other", name: "Other" },
        {
          id: TEAM_ID,
          slug: "chosen",
          name: "Chosen",
          membership: { role: "OWNER" },
        },
      ],
    })
    expect(teams.map((team) => team.id)).toEqual(["team_other", TEAM_ID])

    expect(resolveVercelAccountScope(user!, teams)).toEqual({
      teamId: TEAM_ID,
      teamSlug: "chosen",
      teamName: "Chosen",
    })
  })

  it("uses the only team when the dashboard default is not returned", () => {
    const user = parseVercelUser({ user: { id: "u", username: "u" } })!
    const scope = resolveVercelAccountScope(user, [
      { id: "team_only", slug: "only", name: "Only" },
    ])
    expect(scope.teamId).toBe("team_only")
  })

  it("refuses to guess between several teams without a dashboard default", () => {
    const user = parseVercelUser({ user: { id: "u", username: "u" } })!
    expect(() =>
      resolveVercelAccountScope(user, [
        { id: "team_a", slug: "a", name: "A" },
        { id: "team_b", slug: "b", name: "B" },
      ]),
    ).toThrow("vercel_team_required")
  })

  it("rejects an identity payload without a user", () => {
    expect(parseVercelUser({})).toBeNull()
    expect(parseVercelUser({ user: { id: "only-id" } })).toBeNull()
    expect(parseVercelTeams({ teams: "nope" })).toEqual([])
  })
})
