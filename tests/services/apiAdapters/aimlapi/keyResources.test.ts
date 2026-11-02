import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  AIMLAPI_KEY_LIMIT_MODES,
  AIMLAPI_KEY_EDITOR_FIELDS as fields,
} from "~/services/apiAdapters/aimlapi/keyResourceFields"
import { aimlApiKeyResources } from "~/services/apiAdapters/aimlapi/keyResources"
import { AIMLAPI_KEY_LIMIT_PERIODS } from "~/services/apiService/aimlapi/constants"
import {
  AIMLAPI_KEY_PREFIX,
  type AimlApiKey,
} from "~/services/apiService/aimlapi/keys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const origin = "https://api.aimlapi.com"
const managementKey = "management-key-value"

const request = {
  baseUrl: "https://aimlapi.com",
  accountId: "acc-aimlapi",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: managementKey,
    userId: "test-user-id",
  },
} satisfies ApiServiceRequest

const nativeKey = {
  name: "probe",
  disabled: false,
  prefix: "0faf15d9",
  scopes: ["model:chat"],
  limit: {
    retention: AIMLAPI_KEY_LIMIT_PERIODS.Month,
    threshold: 9,
    spent: 1,
    spent_usd: 1,
    remaining_usd: 8,
    window_start: "2026-10-01T00:00:00Z",
  },
  created_at: "2026-10-24T13:54:28.292Z",
  updated_at: "2026-10-24T13:54:28.292Z",
  expires_at: "2026-12-01T00:00:00Z",
  allowed_models: ["openai/gpt-5"],
  allowed_tools: null,
  total_usage: 0,
  total_usage_usd: 0,
  monthly_usage: 0,
  monthly_usage_usd: 0,
} satisfies Record<string, unknown>

const openSession = () =>
  aimlApiKeyResources.open({
    account: {
      id: "acc-aimlapi",
      name: "AI/ML API",
      siteType: SITE_TYPES.AIMLAPI,
    },
    request,
  })

describe("AI/ML API key resources", () => {
  it.each(["disable", "enable"] as const)(
    "executes the %s action without opening the general editor or changing restrictions",
    async (action) => {
      let sent: unknown
      server.use(
        http.get(`${origin}/v1/keys/:prefix`, () =>
          HttpResponse.json({
            data: { ...nativeKey, disabled: action === "enable" },
          }),
        ),
        http.patch(
          `${origin}/v1/keys/:prefix`,
          async ({ request: incoming }) => {
            sent = await incoming.json()
            return HttpResponse.json({
              data: { ...nativeKey, disabled: action === "disable" },
            })
          },
        ),
      )
      const session = await openSession()
      const scope = await session.resolveDefaultScope()
      const collection = await session.openCollection(scope.scopeKey)
      const editor = await collection.openEditEditor(
        {
          accountId: "acc-aimlapi",
          siteType: SITE_TYPES.AIMLAPI,
          scopeKey: scope.scopeKey,
          resourceId: nativeKey.prefix,
        },
        undefined,
        { action },
      )
      expect(editor.action).toBe(action)
      expect(editor.fields).toHaveLength(0)
      await editor.submit(editor.initialValues)
      expect(sent).toEqual({ disabled: action === "disable" })
    },
  )
  beforeEach(() => {
    server.use(
      http.get(`${origin}/v1/keys`, () =>
        HttpResponse.json({ data: [nativeKey] }),
      ),
      http.get(`${origin}/v1/keys/:prefix`, ({ params }) =>
        HttpResponse.json({
          data: { ...nativeKey, prefix: String(params.prefix) },
        }),
      ),
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  it("exposes the saved regular key and marks its provider-confirmed row as the account credential", async () => {
    const regularKey = "0faf15d9-regular-runtime-secret"
    server.use(
      http.get(`${origin}/v1/key`, ({ request }) => {
        expect(request.headers.get("authorization")).toBe(
          `Bearer ${regularKey}`,
        )
        return HttpResponse.json({ data: nativeKey })
      }),
    )
    const session = await aimlApiKeyResources.open({
      account: {
        id: "acc-aimlapi",
        name: "AI/ML API",
        siteType: SITE_TYPES.AIMLAPI,
      },
      request: { ...request, aimlApiKey: regularKey },
    })
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const page = await collection.list()
    expect(page.items[0]?.runtimeSecret).toBe(regularKey)
    expect(page.items[0]?.accountCredentialIdentity).toEqual({
      status: "confirmed",
      source: "provider",
    })
    const detail = await collection.get(page.items[0]!.ref)
    expect(detail.runtimeSecret).toBe(regularKey)
    expect(detail.accountCredentialIdentity).toEqual({
      status: "confirmed",
      source: "provider",
    })
  })
  it.each(["different-resource", "revoked"])(
    "does not expose saved plaintext when the supplemental credential is %s",
    async (state) => {
      server.use(
        http.get(`${origin}/v1/key`, () =>
          state === "revoked"
            ? HttpResponse.json({}, { status: 401 })
            : HttpResponse.json({ data: { ...nativeKey, prefix: "87654321" } }),
        ),
      )
      const session = await aimlApiKeyResources.open({
        account: {
          id: "acc-aimlapi",
          name: "AI/ML API",
          siteType: SITE_TYPES.AIMLAPI,
        },
        request: { ...request, aimlApiKey: "saved-regular-secret" },
      })
      const scope = await session.resolveDefaultScope()
      const collection = await session.openCollection(scope.scopeKey)
      const page = await collection.list()
      expect(page.items).toHaveLength(1)
      expect(page.items[0]?.runtimeSecret).toBeUndefined()
      expect(page.items[0]?.accountCredentialIdentity).toBeUndefined()
    },
  )
  it("projects the native limit as a budget and keeps expiry unknown-free", async () => {
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const page = await collection.list()

    expect(page.items).toHaveLength(1)
    const facts = page.items[0]!
    expect(facts.displayName).toBe("probe")
    expect(facts.status).toBe("enabled")
    // The inventory never carries plaintext: the deployment shows the secret
    // once, at creation.
    expect(facts.runtimeSecret).toBeUndefined()
    expect(facts.displayFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "budget",
          window: "month",
          limitUsd: 9,
          usedUsd: 1,
          remainingUsd: 8,
        }),
        expect.objectContaining({ kind: "expiry" }),
      ]),
    )
  })

  it.each([
    {
      name: "both counters absent",
      counters: {},
      used: undefined,
      remaining: undefined,
    },
    {
      name: "only spend known",
      counters: { spent_usd: 2 },
      used: 2,
      remaining: undefined,
    },
    {
      name: "invalid remaining",
      counters: { spent_usd: 2, remaining_usd: -1 },
      used: 2,
      remaining: undefined,
    },
    {
      name: "legacy counter without a USD unit",
      counters: { spent: 2000000 },
      used: undefined,
      remaining: undefined,
    },
    {
      name: "only remaining known",
      counters: { remaining_usd: 3 },
      used: undefined,
      remaining: 3,
    },
    {
      name: "invalid spend",
      counters: { spent_usd: -1, remaining_usd: 3 },
      used: undefined,
      remaining: 3,
    },
    {
      name: "null counters",
      counters: { spent_usd: null, remaining_usd: null },
      used: undefined,
      remaining: undefined,
    },
  ])(
    "keeps unknown budget counters unknown in list and detail: $name",
    async ({ counters, used, remaining }) => {
      const key = {
        ...nativeKey,
        limit: {
          retention: AIMLAPI_KEY_LIMIT_PERIODS.Month,
          threshold: 9,
          window_start: nativeKey.limit.window_start,
          ...counters,
        },
      }
      server.use(
        http.get(`${origin}/v1/keys`, () => HttpResponse.json({ data: [key] })),
        http.get(`${origin}/v1/keys/:prefix`, () =>
          HttpResponse.json({ data: key }),
        ),
      )
      const session = await openSession()
      const scope = await session.resolveDefaultScope()
      const collection = await session.openCollection(scope.scopeKey)
      const page = await collection.list()
      const listed = page.items[0]!
      const detail = await collection.get(listed.ref)
      for (const item of [listed, detail]) {
        const facts = item.displayFacts ?? []
        expect(facts).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ kind: "budget" })]),
        )
        const limit = facts.find((fact) => fact.kind === "spend-budget")
        expect(limit).toMatchObject({ limitUsd: 9, period: "monthly" })
        expect(limit && "usedUsd" in limit ? limit.usedUsd : undefined).toBe(
          used,
        )
        const balance = facts.find(
          (fact) => fact.kind === "money" && fact.role === "remaining",
        )
        if (remaining === undefined) expect(balance).toBeUndefined()
        else expect(balance).toMatchObject({ amountUsd: remaining })
      }
    },
  )

  it.each([
    { spent_usd: 2, remaining_usd: 3 },
    { spent_usd: 0, remaining_usd: 0 },
  ])(
    "preserves explicit budget counters without deriving them: %j",
    async (counters) => {
      server.use(
        http.get(`${origin}/v1/keys`, () =>
          HttpResponse.json({
            data: [
              { ...nativeKey, limit: { ...nativeKey.limit, ...counters } },
            ],
          }),
        ),
      )
      const session = await openSession()
      const scope = await session.resolveDefaultScope()
      const collection = await session.openCollection(scope.scopeKey)
      const page = await collection.list()
      expect(page.items[0]!.displayFacts).toContainEqual(
        expect.objectContaining({
          kind: "budget",
          usedUsd: counters.spent_usd,
          remainingUsd: counters.remaining_usd,
        }),
      )
    },
  )

  it.each([
    {
      retention: AIMLAPI_KEY_LIMIT_PERIODS.Day,
      start: "2026-12-31T00:00:00Z",
      next: "2027-01-01T00:00:00.000Z",
    },
    {
      retention: AIMLAPI_KEY_LIMIT_PERIODS.Week,
      start: "2026-12-28T00:00:00Z",
      next: "2027-01-04T00:00:00.000Z",
    },
    {
      retention: AIMLAPI_KEY_LIMIT_PERIODS.Month,
      start: "2026-12-01T00:00:00Z",
      next: "2027-01-01T00:00:00.000Z",
    },
  ])(
    "exposes the UTC calendar reset for a $retention budget",
    async ({ retention, start, next }) => {
      server.use(
        http.get(`${origin}/v1/keys`, () =>
          HttpResponse.json({
            data: [
              {
                ...nativeKey,
                limit: { ...nativeKey.limit, retention, window_start: start },
              },
            ],
          }),
        ),
      )
      const session = await openSession()
      const scope = await session.resolveDefaultScope()
      const collection = await session.openCollection(scope.scopeKey)
      const page = await collection.list()
      expect(page.items[0]!.displayFacts).toContainEqual(
        expect.objectContaining({ kind: "budget", nextResetAt: next }),
      )
    },
  )

  it("creates a key and returns its one-time plaintext", async () => {
    let body: unknown
    server.use(
      http.post(`${origin}/v1/keys`, async ({ request: incoming }) => {
        body = await incoming.json()
        expect(incoming.headers.get("authorization")).toBe(
          `Bearer ${managementKey}`,
        )
        return HttpResponse.json({
          data: { ...nativeKey, key: "0faf15d9aaaaaaaaaaaaaaaaaaaaaaaa" },
        })
      }),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "created",
      [fields.LimitMode]: AIMLAPI_KEY_LIMIT_MODES.Limited,
      [fields.LimitAmount]: 5,
      [fields.LimitRetention]: AIMLAPI_KEY_LIMIT_PERIODS.Month,
      [fields.Scopes]: ["model:chat"],
    })

    expect(body).toMatchObject({
      name: "created",
      limit: { retention: "month", threshold: 5 },
      scopes: ["model:chat"],
    })
    expect(result.createdSecret?.secret).toBe(
      "0faf15d9aaaaaaaaaaaaaaaaaaaaaaaa",
    )
  })

  it.each([
    { retention: AIMLAPI_KEY_LIMIT_PERIODS.Day, period: "daily" },
    { retention: AIMLAPI_KEY_LIMIT_PERIODS.Week, period: "weekly" },
    { retention: null, period: "none" },
  ])(
    "retains the configured $period limit when counters are unknown",
    async ({ retention, period }) => {
      server.use(
        http.get(`${origin}/v1/keys`, () =>
          HttpResponse.json({
            data: [
              {
                ...nativeKey,
                limit: { retention, threshold: 9, window_start: null },
              },
            ],
          }),
        ),
      )
      const session = await openSession()
      const scope = await session.resolveDefaultScope()
      const collection = await session.openCollection(scope.scopeKey)
      const page = await collection.list()
      const fact = page.items[0]!.displayFacts?.find(
        (item) => item.kind === "spend-budget",
      )
      expect(fact).toMatchObject({ period, limitUsd: 9 })
      expect(fact).not.toHaveProperty("usedUsd")
    },
  )

  it("sends only patches the update route accepts and never the expiry", async () => {
    let body: unknown
    let method = ""
    server.use(
      http.patch(`${origin}/v1/keys/:prefix`, async ({ request: incoming }) => {
        body = await incoming.json()
        method = incoming.method
        return HttpResponse.json({ data: { ...nativeKey, name: "renamed" } })
      }),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const editor = await collection.openEditEditor({
      accountId: "acc-aimlapi",
      siteType: SITE_TYPES.AIMLAPI,
      scopeKey: scope.scopeKey,
      resourceId: nativeKey.prefix,
    })

    // The expiry descriptor is read-only in edit mode, so its initial value is
    // the created one and can never be submitted.
    expect(
      editor.fields.find((field) => field.fieldId === fields.ExpiresAt)
        ?.readOnly,
    ).toBe(true)

    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "renamed",
      [fields.Enabled]: false,
    })

    expect(method).toBe("PATCH")
    expect(body).toMatchObject({ name: "renamed", disabled: true })
    expect(body).not.toHaveProperty("expires_at")
  })

  it("deletes a key and requires the provider's deletion acknowledgement", async () => {
    server.use(
      http.delete(`${origin}/v1/keys/:prefix`, () =>
        HttpResponse.json({ data: { prefix: "0faf15d9", deleted: true } }),
      ),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    await expect(
      collection.delete({
        accountId: "acc-aimlapi",
        siteType: SITE_TYPES.AIMLAPI,
        scopeKey: scope.scopeKey,
        resourceId: nativeKey.prefix,
      }),
    ).resolves.toBeUndefined()
  })

  it("treats a rejected deletion as not applied", async () => {
    server.use(
      http.delete(`${origin}/v1/keys/:prefix`, () =>
        HttpResponse.json({ message: "nope" }, { status: 400 }),
      ),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    await expect(
      collection.delete({
        accountId: "acc-aimlapi",
        siteType: SITE_TYPES.AIMLAPI,
        scopeKey: scope.scopeKey,
        resourceId: nativeKey.prefix,
      }),
    ).rejects.toMatchObject({ failure: { code: "upstream_rejected" } })
  })

  it("keeps keys without a limit unlimited and shows no budget fact", async () => {
    server.use(
      http.get(`${origin}/v1/keys`, () =>
        HttpResponse.json({
          data: [{ ...nativeKey, limit: null, monthly_usage_usd: 3 }],
        }),
      ),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const page = await collection.list()
    const facts = page.items[0]!
    expect(facts.displayFacts?.some((fact) => fact.kind === "budget")).toBe(
      false,
    )
    expect(facts.displayFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "money", amountUsd: 3 }),
      ]),
    )
  })

  it("shows never-reset caps and tool restrictions with their native meaning", async () => {
    server.use(
      http.get(`${origin}/v1/keys`, () =>
        HttpResponse.json({
          data: [
            {
              ...nativeKey,
              limit: { ...nativeKey.limit, retention: null },
              allowed_tools: ["search/web"],
            },
          ],
        }),
      ),
    )
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const page = await (await session.openCollection(scope.scopeKey)).list()
    expect(page.items[0]?.displayFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "spend-budget",
          period: "none",
          limitUsd: 9,
        }),
        expect.objectContaining({
          kind: "restriction",
          role: "tools",
          value: ["search/web"],
        }),
      ]),
    )
  })

  it("classifies a malformed key payload as unavailable", async () => {
    server.use(
      http.get(`${origin}/v1/keys`, () =>
        HttpResponse.json({ data: [{ ...nativeKey, prefix: "short" }] }),
      ),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    // A payload that is not the documented shape is a provider-side
    // problem, which the shared mapper reports as unavailable.
    await expect(collection.list()).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
  })
})

describe("AI/ML API key editor", () => {
  beforeEach(() => {
    server.use(
      http.get(`${origin}/v1/keys/:prefix`, ({ params }) =>
        HttpResponse.json({
          data: { ...nativeKey, prefix: String(params.prefix) },
        }),
      ),
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  it("uses the documented prefix width", () => {
    expect(AIMLAPI_KEY_PREFIX).toBe(8)
  })

  it("rejects model and tool selections beyond the native editor limits", async () => {
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    expect(
      editor.validate({
        ...editor.initialValues,
        allowedModels: Array.from({ length: 16 }, (_, i) => `model-${i}`),
      }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "allowedModels", code: "out_of_range" }],
    })
    expect(
      editor.validate({
        ...editor.initialValues,
        allowedTools: Array.from({ length: 51 }, (_, i) => `tool-${i}`),
      }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "allowedTools", code: "out_of_range" }],
    })
  })

  it("offers searchable models and preserves a saved model absent from the current catalogue", async () => {
    server.use(
      http.get(`${origin}/v1/models`, () =>
        HttpResponse.json({
          data: [
            {
              id: "openai/gpt-5.2",
              info: { name: "GPT 5.2", developer: "OpenAI" },
              type: "openai/chat-completions",
            },
          ],
        }),
      ),
    )
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const editor = await collection.openEditEditor({
      accountId: "acc-aimlapi",
      siteType: SITE_TYPES.AIMLAPI,
      scopeKey: scope.scopeKey,
      resourceId: nativeKey.prefix,
    })
    expect(
      editor.fields.find((field) => field.fieldId === fields.AllowedModels)
        ?.type,
    ).toBe("multi-select")
    expect(editor.initialValues[fields.AllowedModels]).toEqual(["openai/gpt-5"])
    expect(
      await editor.loadOptions?.(fields.AllowedModels, editor.initialValues),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "openai/gpt-5.2",
          displayLabel: "GPT 5.2 (openai/gpt-5.2)",
        }),
        expect.objectContaining({ value: "openai/gpt-5" }),
      ]),
    )
  })

  it("keeps the created expiry visible but unchanged in edit mode", async () => {
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const collection = await session.openCollection(scope.scopeKey)
    const editor = await collection.openEditEditor({
      accountId: "acc-aimlapi",
      siteType: SITE_TYPES.AIMLAPI,
      scopeKey: scope.scopeKey,
      resourceId: nativeKey.prefix,
    })

    expect(editor.initialValues[fields.ExpiresAt]).toBe("2026-12-01T00:00:00Z")
    expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
  })

  it("loads tool choices from the native tools host and saves selected restrictions", async () => {
    let sent: Record<string, unknown> | undefined
    server.use(
      http.get(
        "https://tools.aimlapi.com/v1/tools",
        ({ request: incoming }) => {
          expect(incoming.headers.get("authorization")).toBeNull()
          return HttpResponse.json({
            data: [{ id: "search/web", name: "search__web_search" }],
          })
        },
      ),
      http.post(`${origin}/v1/keys`, async ({ request: incoming }) => {
        sent = (await incoming.json()) as Record<string, unknown>
        return HttpResponse.json({
          data: {
            ...nativeKey,
            allowed_tools: ["search/web"],
            key: "0faf15d9-created-secret",
          },
        })
      }),
    )
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    expect(
      await editor.loadOptions?.("allowedTools", editor.initialValues),
    ).toEqual([
      {
        value: "search/web",
        displayLabel: "Web search",
        secondaryLabel: "search/web",
        badgeLabel: "search",
      },
    ])
    await editor.submit({
      ...editor.initialValues,
      name: "tool key",
      allowedTools: ["search/web"],
    })
    expect(sent?.allowed_tools).toEqual(["search/web"])
  })

  it("requires a positive amount when a limit is selected", async () => {
    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)

    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.Name]: "x",
        [fields.LimitMode]: AIMLAPI_KEY_LIMIT_MODES.Limited,
        [fields.LimitAmount]: 0,
      }),
    ).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ fieldId: fields.LimitAmount })],
    })
  })

  it("omits an unrestricted scope selection on create, which the route rejects as null", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post(`${origin}/v1/keys`, async ({ request: incoming }) => {
        body = (await incoming.json()) as Record<string, unknown>
        return HttpResponse.json({
          data: {
            ...nativeKey,
            scopes: null,
            key: "0faf15d9cccccccccccccccccccccccc",
          },
        })
      }),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "unrestricted",
      [fields.Scopes]: null,
    })

    // Live contract: `{"scopes": null}` is a 400 body-validation error while the
    // same field absent reads back as null, so the request must not send it.
    expect(body).not.toHaveProperty("scopes")
  })

  it("turns an empty allowed-model list into an unrestricted null", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post(`${origin}/v1/keys`, async ({ request: incoming }) => {
        body = (await incoming.json()) as Record<string, unknown>
        return HttpResponse.json({
          data: { ...nativeKey, key: "0faf15d9bbbbbbbbbbbbbbbbbbbbbbbb" },
        })
      }),
    )

    const session = await openSession()
    const scope = await session.resolveDefaultScope()
    const editor = await session.openCreateEditor(scope.scopeKey)
    await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "x",
      [fields.AllowedModels]: "",
    })

    // An empty list means unrestricted, which the deployment expresses as null.
    expect(body).toHaveProperty("allowed_models", null)
  })
})

/** Compile-time guard: the adapter only exposes keys with the documented shape. */
const _keyTypeCheck: AimlApiKey["prefix"] = "0faf15d9"
void _keyTypeCheck
