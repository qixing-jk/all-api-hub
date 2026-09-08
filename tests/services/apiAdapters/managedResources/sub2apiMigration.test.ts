import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { ChannelType } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import {
  executeManagedSiteMigration,
  prepareManagedSiteMigrationPreview,
} from "~/services/managedSites/channelMigration"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import { toMigrationWarningCodes } from "~/services/managedSites/channelMigrationWarnings"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES as warnings,
} from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationExecutionCommand,
  ManagedSiteMigrationSelection,
  ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://sub2api.example.invalid",
  adminToken: "sub2api-admin-placeholder",
}
const selection: ManagedSiteMigrationSelection = {
  selectionId: "17",
  displayName: "Claude upstream",
  ref: {
    siteType: SITE_TYPES.SUB2API,
    kind: "channel",
    scopeKey: config.baseUrl,
    resourceId: "17",
  },
}
const account: Sub2ApiAdminApiKeyAccount = {
  id: 17,
  name: selection.displayName,
  platform: "anthropic",
  type: "apikey",
  credentials: {
    base_url: "https://upstream.example.invalid",
    model_mapping: { "claude-sonnet-4-5": "claude-sonnet-4-5" },
  },
  credentials_status: { has_api_key: true },
  concurrency: 1,
  priority: 0,
  status: "active",
}
const migrationSource: ManagedSiteMigrationSource = {
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: ChannelType.Anthropic,
  baseUrl: "http://upstream.example.invalid/custom",
  models: ["claude-sonnet-4-5"],
  groups: ["vip"],
  priority: 0,
  weight: 5,
  status: "disabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
}

const createCommand = (
  overrides: Partial<ManagedSiteMigrationExecutionCommand["projection"]> = {},
): ManagedSiteMigrationExecutionCommand => ({
  source: migrationSource,
  targetSiteType: SITE_TYPES.SUB2API,
  credential: "source-key",
  projection: {
    name: "Migrated channel",
    type: "anthropic",
    baseUrl: migrationSource.baseUrl,
    models: migrationSource.models,
    groups: [],
    priority: 0,
    weight: 1,
    enabled: true,
    ...overrides,
  },
})

describe("Sub2API channel migration", () => {
  beforeEach(async () => {
    await userPreferences.updateSub2ApiManagedSiteConfig(config)
    server.use(
      http.get(`${config.baseUrl}/api/v1/admin/accounts/17`, () =>
        HttpResponse.json({ code: 0, data: account }),
      ),
    )
  })

  it("previews an API-key account as a native channel without exporting its secret", async () => {
    const requests: string[] = []
    server.use(
      http.get(`${config.baseUrl}/api/v1/admin/accounts/17`, ({ request }) => {
        requests.push(request.url)
        expect(request.headers.get("x-api-key")).toBe(config.adminToken)
        return HttpResponse.json({
          code: 0,
          data: {
            ...account,
            credentials: { ...account.credentials, api_key: "private-key" },
          },
        })
      }),
      http.get(
        `${config.baseUrl}/api/v1/admin/accounts/data`,
        ({ request }) => {
          requests.push(request.url)
          return HttpResponse.json({ code: 0, data: {} })
        },
      ),
    )

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.SUB2API,
      targetSiteType: SITE_TYPES.NEW_API,
      selections: [selection],
    })

    expect(preview).toMatchObject({
      readyCount: 1,
      blockedCount: 0,
      items: [
        {
          status: "ready",
          source: {
            sourceSiteType: SITE_TYPES.SUB2API,
            resourceType: "anthropic",
            baseUrl: "https://upstream.example.invalid",
            models: ["claude-sonnet-4-5"],
            priority: 0,
            status: "enabled",
            lossSignals: { hasModelMapping: false },
          },
          target: { projection: { type: ChannelType.Anthropic } },
        },
      ],
    })
    expect(requests).toEqual([`${config.baseUrl}/api/v1/admin/accounts/17`])
    expect(JSON.stringify(preview)).not.toContain("private-key")
    expect(JSON.stringify(preview)).not.toContain(config.adminToken)
  })

  it("warns about target default groups even when the source has no groups", async () => {
    const source = { ...migrationSource, groups: [] }
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    const prepared = await target.prepare(source)

    expect(prepared.projection.groups).toEqual([])
    expect(
      toMigrationWarningCodes({
        lossSignals: source.lossSignals,
        adjustments: prepared.adjustments,
      }),
    ).toContain(warnings.TARGET_FORCES_DEFAULT_GROUP)
  })

  it("creates an imported API-key account with its model allowlist and paused status", async () => {
    const requests: { method: string; body: unknown }[] = []
    server.use(
      http.post(
        `${config.baseUrl}/api/v1/admin/accounts`,
        async ({ request }) => {
          expect(request.headers.get("x-api-key")).toBe(config.adminToken)
          requests.push({ method: request.method, body: await request.json() })
          return HttpResponse.json({ code: 0, data: { ...account, id: 41 } })
        },
      ),
      http.put(
        `${config.baseUrl}/api/v1/admin/accounts/41`,
        async ({ request }) => {
          requests.push({ method: request.method, body: await request.json() })
          return HttpResponse.json({
            code: 0,
            data: { ...account, id: 41, status: "inactive" },
          })
        },
      ),
    )
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )?.target
    expect(target).toBeDefined()
    const prepared = await target!.prepare(migrationSource)
    expect(prepared).toEqual({
      projection: {
        name: "",
        type: "anthropic",
        baseUrl: "http://upstream.example.invalid/custom",
        models: ["claude-sonnet-4-5"],
        groups: [],
        priority: 0,
        weight: 1,
        enabled: false,
      },
      adjustments: {
        remappedType: false,
        normalizedBaseUrl: false,
        forcedDefaultGroup: true,
        ignoredPriority: false,
        ignoredWeight: true,
        simplifiedStatus: false,
      },
    })
    const result = await target!.create({
      source: migrationSource,
      targetSiteType: SITE_TYPES.SUB2API,
      projection: { ...prepared.projection, name: "Migrated Claude" },
      credential: " source-key ",
    })
    expect(result).toEqual({ status: "created" })
    expect(requests).toEqual([
      {
        method: "POST",
        body: {
          name: "Migrated Claude",
          platform: "anthropic",
          type: "apikey",
          credentials: {
            base_url: "http://upstream.example.invalid/custom",
            api_key: "source-key",
            model_mapping: { "claude-sonnet-4-5": "claude-sonnet-4-5" },
          },
          concurrency: 1,
          priority: 0,
          notes: "",
        },
      },
      { method: "PUT", body: { status: "inactive" } },
    ])
    expect(JSON.stringify(result)).not.toContain("source-key")
  })

  it("rejects admin redirects without forwarding credentials or retrying creation", async () => {
    const endpoint = `${config.baseUrl}/api/v1/admin/accounts`
    const redirectedEndpoint = "https://redirect.example.invalid/accounts"
    const requests: { url: string; redirect: RequestRedirect }[] = []
    server.use(
      http.post(endpoint, ({ request }) => {
        requests.push({ url: request.url, redirect: request.redirect })
        return HttpResponse.redirect(redirectedEndpoint, 307)
      }),
      http.post(redirectedEndpoint, ({ request }) => {
        requests.push({ url: request.url, redirect: request.redirect })
        return HttpResponse.json({ code: 0, data: { ...account, id: 41 } })
      }),
    )
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    const result = await target.create(createCommand())

    expect({ result, requests }).toEqual({
      result: { status: "uncertain" },
      requests: [{ url: endpoint, redirect: "error" }],
    })
  })

  it("shows native groups and warns about aliases and settings that cannot be transferred", async () => {
    server.use(
      http.get(`${config.baseUrl}/api/v1/admin/accounts/17`, () =>
        HttpResponse.json({
          code: 0,
          data: {
            ...account,
            groups: [{ id: 5, name: "VIP" }],
            group_ids: [5],
            concurrency: 3,
            schedulable: false,
            credentials: {
              ...account.credentials,
              model_mapping: { "claude-sonnet-4-5": "provider-model" },
              header_overrides: { "X-Secret": "private-header" },
            },
            extra: { custom_setting: "private-extra" },
          },
        }),
      ),
    )
    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.SUB2API,
      targetSiteType: SITE_TYPES.NEW_API,
      selections: [selection],
    })
    expect(preview.items[0]).toMatchObject({
      status: "ready",
      source: {
        groups: ["VIP"],
        status: "other",
        lossSignals: { hasModelMapping: true, hasAdvancedSettings: true },
      },
      target: { projection: { groups: ["VIP"], enabled: false } },
      warningCodes: [
        warnings.DROPS_MODEL_MAPPING,
        warnings.DROPS_ADVANCED_SETTINGS,
        warnings.TARGET_SIMPLIFIES_STATUS,
      ],
    })
    expect(JSON.stringify(preview)).not.toContain("private-header")
    expect(JSON.stringify(preview)).not.toContain("private-extra")
  })

  it("blocks accounts whose API key is explicitly missing before execution", async () => {
    server.use(
      http.get(`${config.baseUrl}/api/v1/admin/accounts/17`, () =>
        HttpResponse.json({
          code: 0,
          data: { ...account, credentials_status: { has_api_key: false } },
        }),
      ),
    )
    const capability = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!
    await expect(capability.source!.prepare(selection)).resolves.toEqual({
      status: "blocked",
      reasonCode: blockers.SOURCE_KEY_MISSING,
    })
    await expect(
      capability.source!.resolveCredential(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode: blockers.SOURCE_KEY_MISSING,
    })
  })

  it.each([
    ["response lost", () => HttpResponse.error(), "uncertain"],
    [
      "missing identity",
      () => HttpResponse.json({ code: 0, data: {} }),
      "uncertain",
    ],
    [
      "rejected",
      () =>
        HttpResponse.json(
          { code: "BAD_INPUT", message: "private source-key" },
          { status: 400 },
        ),
      "failed",
    ],
  ] as const)(
    "reports a %s create without replaying it or leaking its credential",
    async (_label, response, status) => {
      let creates = 0
      server.use(
        http.post(`${config.baseUrl}/api/v1/admin/accounts`, () => {
          creates += 1
          return response()
        }),
      )
      const target = resolveManagedSiteMigrationCapability(
        SITE_TYPES.SUB2API,
      )!.target!
      const result = await target.create(createCommand())
      expect(result).toEqual(
        status === "uncertain"
          ? { status: "uncertain" }
          : { status: "failed", failureCode: "target_rejected" },
      )
      expect(creates).toBe(1)
      expect(JSON.stringify(result)).not.toContain("source-key")
    },
  )

  it("requires reconciliation when creation succeeded but pausing the new account failed", async () => {
    const methods: string[] = []
    server.use(
      http.post(`${config.baseUrl}/api/v1/admin/accounts`, ({ request }) => {
        methods.push(request.method)
        return HttpResponse.json({ code: 0, data: { ...account, id: 41 } })
      }),
      http.put(`${config.baseUrl}/api/v1/admin/accounts/41`, ({ request }) => {
        methods.push(request.method)
        return HttpResponse.json({ code: "PAUSE_REJECTED" }, { status: 400 })
      }),
    )
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    await expect(
      target.create(createCommand({ enabled: false })),
    ).resolves.toEqual({ status: "uncertain" })
    expect(methods).toEqual(["POST", "PUT"])
  })

  it.each([
    { name: " " },
    { type: "antigravity" },
    { baseUrl: "file:///private" },
    { baseUrl: "https://user:password@upstream.example.invalid" },
    { priority: -1 },
  ])(
    "rejects an invalid target projection before a create request: %j",
    async (projection) => {
      let creates = 0
      server.use(
        http.post(`${config.baseUrl}/api/v1/admin/accounts`, () => {
          creates += 1
          return HttpResponse.json({ code: 0, data: account })
        }),
      )
      const target = resolveManagedSiteMigrationCapability(
        SITE_TYPES.SUB2API,
      )!.target!
      await expect(target.create(createCommand(projection))).resolves.toEqual({
        status: "failed",
        failureCode: "target_rejected",
      })
      expect(creates).toBe(0)
    },
  )

  it("does not create a target using a masked credential", async () => {
    let creates = 0
    server.use(
      http.post(`${config.baseUrl}/api/v1/admin/accounts`, () => {
        creates += 1
        return HttpResponse.json({ code: 0, data: account })
      }),
    )
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    await expect(
      target.create({ ...createCommand(), credential: "sk-********" }),
    ).resolves.toEqual({
      status: "failed",
      failureCode: "target_rejected",
    })
    expect(creates).toBe(0)
  })

  it.each([
    { siteType: SITE_TYPES.NEW_API },
    { scopeKey: "https://different.example.invalid" },
    { resourceId: "../17" },
    { resourceId: "0" },
    { resourceId: "9007199254740992" },
  ])(
    "rejects a source reference outside the configured account scope: %j",
    async (ref) => {
      const requests: string[] = []
      server.use(
        http.get(`${config.baseUrl}/api/v1/admin/accounts/*`, ({ request }) => {
          requests.push(request.url)
          return HttpResponse.json({ code: 0, data: account })
        }),
      )
      const source = resolveManagedSiteMigrationCapability(
        SITE_TYPES.SUB2API,
      )!.source!
      const invalidSelection = {
        ...selection,
        ref: { ...selection.ref, ...ref },
      }
      expect(
        (await source.createSelectionValidationContext!()).isValid(
          invalidSelection,
        ),
      ).toBe(false)
      await expect(source.prepare(invalidSelection)).resolves.toEqual({
        status: "blocked",
        reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
      })
      await expect(source.resolveCredential(invalidSelection)).resolves.toEqual(
        {
          status: "blocked",
          reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
        },
      )
      expect(requests).toEqual([])
    },
  )

  it.each([
    { type: "oauth" },
    { type: "upstream", platform: "antigravity" },
    { type: "apikey", platform: "antigravity" },
    { type: "apikey", platform: "future-platform" },
  ])(
    "does not export credentials for an unsupported account: %j",
    async (overrides) => {
      let exports = 0
      server.use(
        http.get(`${config.baseUrl}/api/v1/admin/accounts/17`, () =>
          HttpResponse.json({ code: 0, data: { ...account, ...overrides } }),
        ),
        http.get(`${config.baseUrl}/api/v1/admin/accounts/data`, () => {
          exports += 1
          return HttpResponse.json({ code: 0, data: {} })
        }),
      )
      const source = resolveManagedSiteMigrationCapability(
        SITE_TYPES.SUB2API,
      )!.source!
      await expect(source.prepare(selection)).resolves.toEqual({
        status: "blocked",
        reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
      })
      await expect(source.resolveCredential(selection)).resolves.toEqual({
        status: "blocked",
        reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
      })
      expect(exports).toBe(0)
    },
  )

  it("resolves the selected account key through data export only when executing", async () => {
    server.use(
      http.get(
        `${config.baseUrl}/api/v1/admin/accounts/data`,
        ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get("ids")).toBe("17")
          expect(url.searchParams.get("include_proxies")).toBe("false")
          return HttpResponse.json({
            code: 0,
            data: {
              accounts: [
                { ...account, credentials: { api_key: " exported-key " } },
              ],
            },
          })
        },
      ),
    )
    const source = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.source!
    await expect(source.resolveCredential(selection)).resolves.toEqual({
      status: "ready",
      credential: "exported-key",
    })
  })

  it("blocks secret export when the deployment requires step-up authentication", async () => {
    server.use(
      http.get(`${config.baseUrl}/api/v1/admin/accounts/data`, () =>
        HttpResponse.json(
          {
            code: "STEP_UP_ADMIN_API_KEY_FORBIDDEN",
            message: "private diagnostic",
          },
          { status: 403 },
        ),
      ),
    )
    const source = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.source!
    await expect(source.resolveCredential(selection)).resolves.toEqual({
      status: "blocked",
      reasonCode: "source-key-export-restricted",
    })
  })

  it.each([
    [
      ChannelType.Anthropic,
      "https://upstream.example.invalid/custom/v1/",
      "https://upstream.example.invalid/custom",
    ],
    [
      ChannelType.Gemini,
      "https://upstream.example.invalid/custom/v1beta",
      "https://upstream.example.invalid/custom",
    ],
    [
      ChannelType.OpenAI,
      "http://upstream.example.invalid/custom/v1/",
      "http://upstream.example.invalid/custom/v1",
    ],
  ] as const)(
    "prepares the platform URL prefix without duplicating protocol paths (%s)",
    async (resourceType, baseUrl, expected) => {
      const target = resolveManagedSiteMigrationCapability(
        SITE_TYPES.SUB2API,
      )!.target!
      const prepared = await target.prepare({
        ...migrationSource,
        resourceType,
        baseUrl,
      })
      expect(prepared.projection.baseUrl).toBe(expected)
      expect(prepared.adjustments.normalizedBaseUrl).toBe(true)
    },
  )

  it.each([
    "",
    "file:///private",
    "https://user:password@upstream.example.invalid",
    "https://upstream.example.invalid?key=private",
  ])("blocks an unusable upstream URL during preview: %s", async (baseUrl) => {
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    await expect(
      target.prepare({ ...migrationSource, baseUrl }),
    ).rejects.toThrow()
  })

  it("keeps an unrestricted model list unrestricted when creating the target", async () => {
    let body: unknown
    server.use(
      http.post(
        `${config.baseUrl}/api/v1/admin/accounts`,
        async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ code: 0, data: account })
        },
      ),
    )
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    await expect(target.create(createCommand({ models: [] }))).resolves.toEqual(
      { status: "created" },
    )
    expect(body).toMatchObject({
      credentials: { api_key: "source-key", base_url: migrationSource.baseUrl },
    })
    expect(
      (body as { credentials: Record<string, unknown> }).credentials,
    ).not.toHaveProperty("model_mapping")
  })

  it("revalidates the source scope at execution after the configured deployment changes", async () => {
    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.SUB2API,
      targetSiteType: SITE_TYPES.NEW_API,
      selections: [selection],
    })
    expect(preview.readyCount).toBe(1)
    await userPreferences.updateSub2ApiManagedSiteConfig({
      ...config,
      baseUrl: "https://other.example.invalid",
    })
    const requests: string[] = []
    server.use(
      http.all("*", ({ request }) => {
        requests.push(request.url)
        return HttpResponse.json({ code: 0, data: account })
      }),
    )
    await expect(
      executeManagedSiteMigration({ preview }),
    ).resolves.toMatchObject({
      attemptedCount: 0,
      createdCount: 0,
      skippedCount: 1,
      items: [
        {
          status: "skipped",
          blockingReasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
        },
      ],
    })
    expect(requests).toEqual([])
  })

  it("rejects a detail response for a different account before exporting credentials", async () => {
    let exports = 0
    server.use(
      http.get(`${config.baseUrl}/api/v1/admin/accounts/17`, () =>
        HttpResponse.json({ code: 0, data: { ...account, id: 99 } }),
      ),
      http.get(`${config.baseUrl}/api/v1/admin/accounts/data`, () => {
        exports += 1
        return HttpResponse.json({ code: 0, data: {} })
      }),
    )
    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.SUB2API,
      targetSiteType: SITE_TYPES.NEW_API,
      selections: [selection],
    })
    expect(preview.items[0]).toMatchObject({
      status: "blocked",
      blockingReasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
    })
    const source = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.source!
    await expect(source.resolveCredential(selection)).resolves.toEqual({
      status: "blocked",
      reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
    })
    expect(exports).toBe(0)
  })

  it.each(["", "sk-********"])(
    "reports an unavailable exported credential as missing (%s)",
    async (apiKey) => {
      server.use(
        http.get(`${config.baseUrl}/api/v1/admin/accounts/data`, () =>
          HttpResponse.json({
            code: 0,
            data: {
              accounts: [{ ...account, credentials: { api_key: apiKey } }],
            },
          }),
        ),
      )
      const source = resolveManagedSiteMigrationCapability(
        SITE_TYPES.SUB2API,
      )!.source!
      await expect(source.resolveCredential(selection)).resolves.toEqual({
        status: "blocked",
        reasonCode: blockers.SOURCE_KEY_MISSING,
      })
    },
  )

  it("honors cancellation before reading a source or creating a target", async () => {
    const requests: string[] = []
    server.use(
      http.all("*", ({ request }) => {
        requests.push(request.url)
        return HttpResponse.json({ code: 0, data: account })
      }),
    )
    const controller = new AbortController()
    controller.abort()
    const options = { signal: controller.signal }
    const capability = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!
    await expect(
      capability.source!.prepare(selection, options),
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      capability.source!.resolveCredential(selection, options),
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      capability.target!.prepare(migrationSource, options),
    ).rejects.toMatchObject({ name: "AbortError" })
    await expect(
      capability.target!.create(createCommand(), options),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(requests).toEqual([])
  })

  it("reports missing destination configuration before submitting an account", async () => {
    await userPreferences.updateSub2ApiManagedSiteConfig({
      baseUrl: "",
      adminToken: "",
    })
    const target = resolveManagedSiteMigrationCapability(
      SITE_TYPES.SUB2API,
    )!.target!
    await expect(target.create(createCommand())).resolves.toEqual({
      status: "failed",
      failureCode: "target_unavailable",
    })
  })
})
