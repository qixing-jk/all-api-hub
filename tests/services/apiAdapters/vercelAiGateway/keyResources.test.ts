import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountRuntimeKeyLocator } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  ACCOUNT_KEY_RESOURCE_STATUSES,
  type AccountKeyResourceCapability,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/resourceNative"
import { vercelAiGatewayCapabilities } from "~/services/apiAdapters/vercelAiGateway"
import {
  createVercelKeyEditor,
  vercelKeyFields,
} from "~/services/apiAdapters/vercelAiGateway/keyEditor"
import { vercelAiGatewayKeyResources } from "~/services/apiAdapters/vercelAiGateway/keyResources"
import { apiCredentialProfileLinks } from "~/services/apiCredentialProfiles/links"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/storage/profiles"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const TEAM_ID = "team_test"
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

const openSession = (
  capability: AccountKeyResourceCapability = vercelAiGatewayKeyResources,
) =>
  capability.open({
    account: {
      id: "acc-vercel",
      name: "Vercel AI Gateway",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
    },
    request,
  })

const listHandler = (rows: unknown[]) =>
  http.get("https://api.vercel.com/v1/api-keys", () =>
    HttpResponse.json({
      apiKeys: rows,
      pagination: { count: rows.length, next: null, prev: null },
      quotaEnrichment: "ok",
    }),
  )

describe("Vercel AI Gateway key resources", () => {
  beforeEach(() => {
    server.resetHandlers()
    server.use(
      http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
        HttpResponse.json({ budgets: [] }),
      ),
      http.get("https://api.vercel.com/ai-gateway/budgets/defaults/list", () =>
        HttpResponse.json({ defaults: [] }),
      ),
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({
          teams: [{ id: TEAM_ID, slug: "test", membership: { role: "OWNER" } }],
        }),
      ),
    )
  })
  afterEach(() => server.resetHandlers())

  it("keeps inventory and one-time delivery usable when the independent budget read fails", async () => {
    server.use(
      listHandler([keyRow]),
      http.get(
        "https://api.vercel.com/ai-gateway/budgets/list",
        () => new HttpResponse(null, { status: 503 }),
      ),
      http.post("https://api.vercel.com/v1/api-keys", () =>
        HttpResponse.json({ apiKey: keyRow, apiKeyString: "vck_once" }),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const listed = await collection.list(undefined, {
      signal: new AbortController().signal,
    })
    expect(listed.items[0]?.displayFacts).toContainEqual(
      expect.objectContaining({ kind: "spend-budget", source: "unavailable" }),
    )
    const editor = await session.openCreateEditor("account")
    const created = await editor.submit(editor.initialValues)
    expect(created.createdSecret?.secret).toBe("vck_once")
  })

  it("uses budget-manager permission and checks it again immediately before changing attribution", async () => {
    let authorized = true
    let writes = 0
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({
          teams: [
            {
              id: TEAM_ID,
              slug: "test",
              membership: {
                role: "MEMBER",
                teamRoles: authorized ? ["AI_GATEWAY_BUDGET_MANAGER"] : [],
              },
            },
          ],
        }),
      ),
      http.patch("https://api.vercel.com/v1/api-keys/key_1", () => {
        writes++
        return HttpResponse.json({ apiKey: keyRow })
      }),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    expect(editor.fields.map((field) => field.fieldId)).toContain(
      vercelKeyFields.SpendAttribution,
    )
    authorized = false
    await expect(
      editor.submit({ ...editor.initialValues, spend_attribution: "team" }),
    ).rejects.toMatchObject({ failure: { code: "permission_denied" } })
    expect(writes).toBe(0)
  })

  it("does not write an unchanged key", async () => {
    let writes = 0
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.patch("https://api.vercel.com/v1/api-keys/key_1", () => {
        writes++
        return HttpResponse.json({ apiKey: keyRow })
      }),
      http.patch("https://api.vercel.com/v1/api-keys/key_1/quota", () => {
        writes++
        return HttpResponse.json({})
      }),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    await editor.submit(editor.initialValues)
    expect(writes).toBe(0)
  })

  it("rejects an attribution edit when another client changed it after opening", async () => {
    let attribution = "user"
    let writes = 0
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({
          apiKey: { ...keyRow, metadata: { spendAttribution: attribution } },
        }),
      ),
      http.patch("https://api.vercel.com/v1/api-keys/key_1", () => {
        writes++
        return HttpResponse.json({})
      }),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    attribution = "team"
    await expect(
      editor.submit({ ...editor.initialValues, spend_attribution: "team" }),
    ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    expect(writes).toBe(0)
  })

  it("treats accepted attribution with stale readback as uncertain", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.patch("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    await expect(
      editor.submit({ ...editor.initialValues, spend_attribution: "team" }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })

  it.each<EditableResourceProjection>([
    { expires_at: "invalid-date" },
    { expires_at: 42 },
    {
      budget_enabled: true,
      budget_limit: 5,
      budget_period: "yearly",
      budget_alerts: [],
    },
    {
      budget_enabled: true,
      budget_limit: 5,
      budget_period: "daily",
      budget_alerts: "50",
    },
    {
      budget_enabled: true,
      budget_limit: 5,
      budget_period: "daily",
      budget_alerts: ["30"],
    },
    {
      budget_enabled: true,
      budget_limit: null,
      budget_period: "daily",
      budget_alerts: [],
    },
  ])("rejects invalid key configuration %j before mutation", (patch) => {
    const editor = createVercelKeyEditor()
    expect(
      editor.validate({ ...editor.initialValues, ...patch }),
    ).toMatchObject({ valid: false })
  })

  it.each([undefined, 42, " "])(
    "rejects a key workspace without a saved team (%s)",
    async (userId) => {
      await expect(
        vercelAiGatewayKeyResources.open({
          account: { id: "a", siteType: SITE_TYPES.VERCEL_AI_GATEWAY },
          request: { ...request, auth: { ...request.auth, userId } },
        }),
      ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    },
  )

  it("recovers a team's one-time key through its exact credential-library association", async () => {
    server.use(listHandler([keyRow]))
    const account = buildDisplaySiteData({
      id: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      baseUrl: "https://vercel.com",
      userId: TEAM_ID,
      token: "management-pat",
    })
    await apiCredentialProfilesStorage.clearAllData()
    try {
      const [runtimeKey] = await fetchDisplayAccountRuntimeKeys(account)
      expect(runtimeKey!.secret).toBe("")
      await expect(
        resolveDisplayAccountRuntimeKeySecret(account, runtimeKey!),
      ).rejects.toMatchObject({
        code: "ACCOUNT_RUNTIME_KEY_SECRET_UNAVAILABLE",
      })
      await apiCredentialProfileLinks.capture({
        profile: {
          name: "Stored Vercel key",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: "https://ai-gateway.vercel.sh/v1",
          apiKey: "vck_complete-inference-key",
        },
        locator: getAccountRuntimeKeyLocator(runtimeKey!),
        linkedBy: "creation-response",
      })
      const resolved = await resolveDisplayAccountRuntimeKeySecret(
        account,
        runtimeKey!,
      )
      expect(resolved.secret).toBe("vck_complete-inference-key")
      expect(resolved.baseUrl).toBe("https://ai-gateway.vercel.sh")
      expect(resolved.secret).not.toBe(account.token)
      const otherAccount = buildDisplaySiteData({
        ...account,
        id: "other-team-account",
      })
      const [otherKey] = await fetchDisplayAccountRuntimeKeys(otherAccount)
      await expect(
        resolveDisplayAccountRuntimeKeySecret(otherAccount, otherKey!),
      ).rejects.toMatchObject({
        code: "ACCOUNT_RUNTIME_KEY_SECRET_UNAVAILABLE",
      })
    } finally {
      await apiCredentialProfilesStorage.clearAllData()
    }
  })

  it("opens budget editing when the attribution permission lookup fails", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json(
          { error: { message: "Unavailable" } },
          { status: 503 },
        ),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    expect(editor.fields.map((field) => field.fieldId)).toContain(
      vercelKeyFields.BudgetLimit,
    )
    expect(editor.fields.map((field) => field.fieldId)).not.toContain(
      vercelKeyFields.SpendAttribution,
    )
  })

  it("opens creation without attribution controls when team permissions cannot be read", async () => {
    server.use(
      http.get(
        "https://api.vercel.com/v2/teams",
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    expect(editor.fields.map((field) => field.fieldId)).not.toContain(
      vercelKeyFields.SpendAttribution,
    )
    expect(editor.validate(editor.initialValues)).toMatchObject({ valid: true })
  })

  it("uses a safe fallback name and omits attribution for keys without optional metadata", async () => {
    server.use(
      listHandler([
        {
          ...keyRow,
          name: undefined,
          createdBy: undefined,
          metadata: undefined,
        },
      ]),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const page = await collection.list()
    expect(page.items[0]?.displayName).toBe("Key abc123")
    expect(
      page.items[0]?.displayFacts?.some((fact) => fact.kind === "attribution"),
    ).toBe(false)
  })

  it("maps the team's keys into native inventory facts", async () => {
    server.use(listHandler([keyRow]))
    const session = await openSession()
    const scopes = await session.listScopes()
    expect(scopes).toHaveLength(1)
    expect(scopes[0]!.isDefault).toBe(true)

    const collection = await session.openCollection(scopes[0]!.scopeKey)
    const page = await collection.list()

    expect(page.items).toHaveLength(1)
    const [facts] = page.items
    expect(facts!.displayName).toBe("Primary")
    // Only the last six characters are ever exposed by the deployment.
    expect(facts!.maskedLabel).toContain("abc123")
    expect(facts!.status).toBe(ACCOUNT_KEY_RESOURCE_STATUSES.Enabled)
    // The plaintext is not recoverable from the inventory.
    expect(facts!.runtimeSecret).toBeUndefined()
    expect(facts!.runtimeKey?.baseUrl).toBe("https://ai-gateway.vercel.sh/v1")
    expect(facts!.actions).toEqual({ canUpdate: true, canDelete: true })
  })

  it("reports an expired key as expired and a leaked key as disabled", async () => {
    server.use(
      listHandler([
        { ...keyRow, id: "expired", expiresAt: 1_000 },
        { ...keyRow, id: "leaked", leakedAt: 1_700_000_000_000 },
      ]),
    )
    const session = await openSession()
    const [scope] = await session.listScopes()
    const page = await (await session.openCollection(scope!.scopeKey)).list()
    expect(page.items.map((facts) => facts.status)).toEqual([
      ACCOUNT_KEY_RESOURCE_STATUSES.Expired,
      ACCOUNT_KEY_RESOURCE_STATUSES.Disabled,
    ])
  })

  it("keeps a never-used key enabled and surfaces its last use separately", async () => {
    server.use(
      listHandler([
        // `activeAt` is "most recently used"; a fresh key equals createdAt.
        { ...keyRow, id: "unused", activeAt: keyRow.createdAt },
        { ...keyRow, id: "used", activeAt: keyRow.createdAt + 60_000 },
      ]),
    )
    const session = await openSession()
    const [scope] = await session.listScopes()
    const page = await (await session.openCollection(scope!.scopeKey)).list()
    expect(page.items.map((facts) => facts.status)).toEqual([
      ACCOUNT_KEY_RESOURCE_STATUSES.Enabled,
      ACCOUNT_KEY_RESOURCE_STATUSES.Enabled,
    ])
    expect(page.items[0]!.displayFacts).not.toContainEqual(
      expect.objectContaining({ kind: "last-used" }),
    )
    expect(page.items[1]!.displayFacts).toContainEqual({
      fieldId: "accessed_time",
      kind: "last-used",
      timestampMs: keyRow.createdAt + 60_000,
    })
  })

  it("reports spend attribution as a billing fact, never as a key group", async () => {
    server.use(
      listHandler([
        { ...keyRow, id: "attributed", metadata: { spendAttribution: "team" } },
      ]),
    )
    const session = await openSession()
    const [scope] = await session.listScopes()
    const page = await (await session.openCollection(scope!.scopeKey)).list()
    expect(page.items[0]!.displayFacts).toContainEqual({
      fieldId: "spend_attribution",
      kind: "attribution",
      value: "team",
    })
    expect(page.items[0]!.displayFacts).not.toContainEqual(
      expect.objectContaining({ kind: "group" }),
    )
  })

  it("creates a key and hands back the one-time secret", async () => {
    server.use(
      http.post("https://api.vercel.com/v1/api-keys", () =>
        HttpResponse.json({ apiKeyString: "vck_secret", apiKey: keyRow }),
      ),
    )
    const session = await openSession()
    const [scope] = await session.listScopes()
    const editor = await session.openCreateEditor(scope!.scopeKey, undefined, {
      nameHint: "Primary",
    })

    const result = await editor.submit({ ...editor.initialValues })

    expect(result.createdSecret?.secret).toBe("vck_secret")
    expect(result.createdSecret?.secretAvailability).toBe(
      "create-response-only",
    )
    expect(result.facts?.displayName).toBe("Primary")
    expect(result.createdSecret?.credential.baseUrl).toBe(
      "https://ai-gateway.vercel.sh/v1",
    )
  })

  it("lets a user create a key with an optional budget and validates its minimum", async () => {
    let submitted: unknown
    server.use(
      http.post("https://api.vercel.com/v1/api-keys", async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({ apiKeyString: "vck_once", apiKey: keyRow })
      }),
    )
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    const values = {
      ...editor.initialValues,
      [vercelKeyFields.BudgetEnabled]: true,
      [vercelKeyFields.BudgetLimit]: 0,
      [vercelKeyFields.BudgetPeriod]: "weekly",
      [vercelKeyFields.BudgetAlerts]: ["100", "50", "50"],
    }
    expect(editor.validate(values)).toMatchObject({ valid: false })
    server.use(
      http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
        HttpResponse.json({
          budgets: [
            {
              scopeType: "api-key",
              scopeId: "key_1",
              limitAmount: 10,
              currentSpend: 0,
              refreshPeriod: "weekly",
              active: true,
              archived: false,
              alertThresholds: [50, 100],
            },
          ],
        }),
      ),
    )
    const created = await editor.submit({ ...values, budget_limit: 10 })
    expect(created.facts?.displayFacts).toContainEqual(
      expect.objectContaining({
        kind: "spend-budget",
        source: "custom",
        limitUsd: 10,
        period: "weekly",
      }),
    )
    expect(submitted).toMatchObject({
      aiGatewayQuota: {
        limitAmount: 10,
        refreshPeriod: "weekly",
        alertThresholds: [50, 100],
      },
    })
  })

  it("reports no runtime key for an inventory item", async () => {
    server.use(listHandler([keyRow]))
    const session = await openSession()
    const resolution = await session.runtimeKey?.resolve({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    expect(resolution).toMatchObject({
      kind: "unavailable",
      failure: { code: "unavailable" },
    })
  })

  it("deletes a key through the native collection", async () => {
    let deleted = ""
    server.use(
      listHandler([keyRow]),
      http.delete("https://api.vercel.com/v1/api-keys/key_1", () => {
        deleted = "key_1"
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const session = await openSession()
    const [scope] = await session.listScopes()
    const collection = await session.openCollection(scope!.scopeKey)
    await collection.delete({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    expect(deleted).toBe("key_1")
  })

  it("edits a key budget and attribution without changing its name, expiry or unrelated metadata", async () => {
    let row = {
      ...keyRow,
      metadata: {
        spendAttribution: "user",
        custom: "preserve",
        tokenPass: { readonly: true },
      },
    }
    let budget = {
      scopeType: "api-key",
      scopeId: "key_1",
      limitAmount: 5,
      currentSpend: 2,
      refreshPeriod: "weekly",
      active: true,
      archived: false,
      alertThresholds: [50],
      includeByokInQuota: true,
    }
    const writes: unknown[] = []
    server.use(
      listHandler([keyRow]),
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: row }),
      ),
      http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
        HttpResponse.json({ budgets: [budget] }),
      ),
      http.patch(
        "https://api.vercel.com/v1/api-keys/key_1",
        async ({ request }) => {
          const body = (await request.json()) as typeof row
          writes.push(body)
          row = { ...row, metadata: { ...row.metadata, ...body.metadata } }
          return HttpResponse.json({ apiKey: row })
        },
      ),
      http.patch(
        "https://api.vercel.com/v1/api-keys/key_1/quota",
        async ({ request }) => {
          const body = (await request.json()) as typeof budget
          writes.push(body)
          budget = { ...budget, ...body }
          return HttpResponse.json({ apiKey: row, quota: budget })
        },
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    }
    const editor = await collection.openEditEditor(ref)
    expect(editor.initialValues).toMatchObject({
      [vercelKeyFields.BudgetEnabled]: true,
      [vercelKeyFields.BudgetLimit]: 5,
      [vercelKeyFields.BudgetPeriod]: "weekly",
      [vercelKeyFields.BudgetAlerts]: ["50"],
    })
    await editor.submit({
      ...editor.initialValues,
      [vercelKeyFields.BudgetLimit]: 10,
      [vercelKeyFields.BudgetPeriod]: "monthly",
      [vercelKeyFields.SpendAttribution]: "team",
    })
    expect(writes).toContainEqual({
      metadata: { custom: "preserve", spendAttribution: "team" },
    })
    expect(writes).toContainEqual(
      expect.objectContaining({
        limitAmount: 10,
        refreshPeriod: "monthly",
        alertThresholds: [50],
      }),
    )
    const reopened = await collection.openEditEditor(ref)
    expect(reopened.initialValues).toMatchObject({
      [vercelKeyFields.BudgetLimit]: 10,
      [vercelKeyFields.BudgetPeriod]: "monthly",
      [vercelKeyFields.SpendAttribution]: "team",
    })
    expect(row.name).toBe("Primary")
    expect(budget.includeByokInQuota).toBe(true)
  })

  it("omits privileged attribution controls and payload for an ordinary member", async () => {
    let submitted: unknown
    server.use(
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({
          teams: [
            { id: TEAM_ID, slug: "test", membership: { role: "MEMBER" } },
          ],
        }),
      ),
      http.post("https://api.vercel.com/v1/api-keys", async ({ request }) => {
        submitted = await request.json()
        return HttpResponse.json({ apiKey: keyRow, apiKeyString: "vck_once" })
      }),
    )
    const session = await openSession()
    const editor = await session.openCreateEditor("account")
    expect(
      editor.fields.some(
        (field) => field.fieldId === vercelKeyFields.SpendAttribution,
      ),
    ).toBe(false)
    await editor.submit({
      ...editor.initialValues,
      [vercelKeyFields.SpendAttribution]: "team",
    })
    expect(submitted).not.toHaveProperty("metadata")
  })

  it("does not open a destructive budget edit when the budget read fails", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.get(
        "https://api.vercel.com/ai-gateway/budgets/list",
        () => new HttpResponse(null, { status: 503 }),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    await expect(
      collection.openEditEditor({
        accountId: "acc-vercel",
        siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
        scopeKey: "account",
        resourceId: "key_1",
      }),
    ).rejects.toBeDefined()
  })

  it("shows a team's inherited budget separately from a custom key budget", async () => {
    server.use(
      listHandler([keyRow]),
      http.get("https://api.vercel.com/ai-gateway/budgets/defaults/list", () =>
        HttpResponse.json({
          defaults: [
            {
              scopeType: "api-key",
              limitAmount: 8,
              refreshPeriod: "monthly",
              alertThresholds: [],
            },
          ],
        }),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const page = await collection.list()
    expect(page.items[0]?.displayFacts).toContainEqual(
      expect.objectContaining({
        kind: "spend-budget",
        source: "inherited",
        limitUsd: 8,
        period: "monthly",
      }),
    )
  })

  it("reports a partial update as uncertain when its second write is rejected", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.patch("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({
          apiKey: { ...keyRow, metadata: { spendAttribution: "team" } },
        }),
      ),
      http.patch(
        "https://api.vercel.com/v1/api-keys/key_1/quota",
        () => new HttpResponse(null, { status: 403 }),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    await expect(
      editor.submit({
        ...editor.initialValues,
        [vercelKeyFields.SpendAttribution]: "team",
        [vercelKeyFields.BudgetEnabled]: true,
        [vercelKeyFields.BudgetLimit]: 5,
      }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })

  it("does not claim success when an accepted budget write has stale readback", async () => {
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.patch("https://api.vercel.com/v1/api-keys/key_1/quota", () =>
        HttpResponse.json({ apiKey: keyRow, quota: { limitAmount: 5 } }),
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const editor = await collection.openEditEditor({
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    })
    await expect(
      editor.submit({
        ...editor.initialValues,
        [vercelKeyFields.BudgetEnabled]: true,
        [vercelKeyFields.BudgetLimit]: 5,
      }),
    ).rejects.toMatchObject({ failure: { code: "mutation_state_uncertain" } })
  })

  it("can edit a budget after new usage arrives and removes it with the native archive operation", async () => {
    let spend = 1
    let budget: {
      scopeType: string
      scopeId: string
      limitAmount: number
      currentSpend: number
      refreshPeriod: string
      active: boolean
      archived: boolean
      alertThresholds: number[]
    } = {
      scopeType: "api-key",
      scopeId: "key_1",
      limitAmount: 5,
      currentSpend: 1,
      refreshPeriod: "weekly",
      active: true,
      archived: false,
      alertThresholds: [],
    }
    const patches: unknown[] = []
    server.use(
      http.get("https://api.vercel.com/v1/api-keys/key_1", () =>
        HttpResponse.json({ apiKey: keyRow }),
      ),
      http.get("https://api.vercel.com/ai-gateway/budgets/list", () =>
        HttpResponse.json({ budgets: [{ ...budget, currentSpend: spend++ }] }),
      ),
      http.patch(
        "https://api.vercel.com/v1/api-keys/key_1/quota",
        async ({ request }) => {
          const patch = (await request.json()) as Partial<typeof budget>
          patches.push(patch)
          budget = { ...budget, ...patch }
          return HttpResponse.json({ apiKey: keyRow, quota: budget })
        },
      ),
    )
    const session = await openSession()
    const collection = await session.openCollection("account")
    const ref = {
      accountId: "acc-vercel",
      siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
      scopeKey: "account",
      resourceId: "key_1",
    }
    const editor = await collection.openEditEditor(ref)
    await editor.submit({
      ...editor.initialValues,
      [vercelKeyFields.BudgetLimit]: 6,
    })
    const reopen = await collection.openEditEditor(ref)
    await reopen.submit({ ...reopen.initialValues, budget_enabled: false })
    expect(patches[1]).toEqual({ archived: true })
  })

  it("keeps the create editor's defaults aligned with the native dialog", () => {
    const editor = createVercelKeyEditor({ nameHint: "  Auto key  " })
    expect(editor.initialValues[vercelKeyFields.Name]).toBe("Auto key")
    expect(editor.initialValues[vercelKeyFields.ExpiresAt]).toBeNull()
    expect(editor.initialValues[vercelKeyFields.SpendAttribution]).toBe("user")

    expect(
      editor.validate({
        ...editor.initialValues,
        [vercelKeyFields.Name]: "   ",
      }),
    ).toMatchObject({ valid: false })
    expect(
      editor.validate({
        ...editor.initialValues,
        [vercelKeyFields.ExpiresAt]: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toMatchObject({ valid: false })
    expect(
      editor.validate({
        ...editor.initialValues,
        [vercelKeyFields.SpendAttribution]: "other",
      }),
    ).toMatchObject({ valid: false })
  })

  it("builds a create command with epoch milliseconds", () => {
    const editor = createVercelKeyEditor()
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
    expect(
      editor.buildCommand({
        ...editor.initialValues,
        name: " Primary ",
        [vercelKeyFields.ExpiresAt]: expiresAt,
        [vercelKeyFields.SpendAttribution]: "team",
      }),
    ).toEqual({
      name: "Primary",
      expiresAt: Date.parse(expiresAt),
      spendAttribution: "team",
    })
  })

  it("exposes the account capabilities promised for this integration", () => {
    const account = vercelAiGatewayCapabilities.account
    expect(account?.data).toBeDefined()
    expect(account?.refresh).toBeDefined()
    expect(account?.completion).toBeDefined()
    expect(account?.bootstrap).toBeDefined()
    expect(account?.keyResourceManagement).toBe(vercelAiGatewayKeyResources)
    expect(account?.modelPricing).toBeDefined()
    // No check-in, invite, redemption or managed-site surface is claimed.
    expect(account?.inviteLink).toBeUndefined()
    expect(account?.redemption).toBeUndefined()
    expect(vercelAiGatewayCapabilities.managedSites).toBeUndefined()
  })

  it("cannot mint a Vercel access token in the background", async () => {
    await expect(
      vercelAiGatewayCapabilities.account?.bootstrap?.getOrCreateAccessToken(
        request,
      ),
    ).rejects.toMatchObject({ code: "ACCESS_TOKEN_VERIFICATION_REQUIRED" })
  })

  it("reads the saved team as the account identity", async () => {
    server.use(
      http.get("https://api.vercel.com/v2/user", () =>
        HttpResponse.json({
          user: {
            id: "user_1",
            username: "someone",
            defaultTeamId: TEAM_ID,
          },
        }),
      ),
      http.get("https://api.vercel.com/v2/teams", () =>
        HttpResponse.json({
          teams: [{ id: TEAM_ID, slug: "chosen", name: "Chosen Team" }],
        }),
      ),
    )
    const info =
      await vercelAiGatewayCapabilities.account?.bootstrap?.fetchUserInfo(
        request,
      )
    expect(info).toEqual({
      id: TEAM_ID,
      username: "Chosen Team",
      access_token: null,
    })
  })
})
