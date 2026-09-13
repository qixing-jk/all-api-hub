import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { CLI_PROXY_API_PROVIDER_KINDS } from "~/services/apiService/cliProxyApi"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { axonHubDetail } from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const cases = [
  {
    site: SITE_TYPES.NEW_API,
    configKey: "newApi",
    prepare: ["list", "detail", "secret"],
    cleanup: ["detail", "secret"],
    verify: [],
  },
  {
    site: SITE_TYPES.CLAUDE_CODE_HUB,
    configKey: "claudeCodeHub",
    prepare: ["list", "detail", "secret"],
    cleanup: ["detail", "secret"],
    verify: [],
  },
  {
    site: SITE_TYPES.SUB2API,
    configKey: "sub2apiManagedSite",
    prepare: ["list", "detail", "secret"],
    cleanup: ["detail", "secret"],
    verify: [],
  },
  {
    site: SITE_TYPES.AXON_HUB,
    configKey: "axonHub",
    prepare: ["list", "detail"],
    cleanup: ["detail"],
    verify: [],
  },
  {
    site: SITE_TYPES.OCTOPUS,
    configKey: "octopus",
    prepare: ["list", "list"],
    cleanup: ["list"],
    verify: [],
  },
  {
    site: SITE_TYPES.CLI_PROXY_API,
    configKey: "cliProxyApi",
    prepare: [
      ...CLI_PROXY_API_PROVIDER_KINDS.map((kind) => `list:${kind}`),
      "list:openai-compatibility",
    ],
    cleanup: ["list:openai-compatibility", "list:openai-compatibility"],
    verify: ["list:openai-compatibility"],
  },
]

for (const scenario of cases) {
  test(`${scenario.site} linked cleanup uses only its required request phases`, async ({
    context,
    page,
    extensionId,
  }) => {
    installExtensionPageGuards(page)
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
    const worker = await getServiceWorker(context)
    await seedStoredAccounts(worker, [createStoredAccount()])
    await stubNewApiSiteRoutes(context, {
      initialTokens: [
        {
          id: 1,
          user_id: 1,
          key: "sk-existing-token",
          name: "Request count key",
          status: 1,
          created_time: 0,
          accessed_time: 0,
          expired_time: -1,
          remain_quota: -1,
          unlimited_quota: true,
          used_quota: 0,
          model_limits_enabled: false,
          model_limits: "",
          allow_ips: "",
          group: "default",
        },
      ],
    })
    const origin = "https://cleanup-requests.example.invalid"
    await seedUserPreferences(worker, {
      managedSiteType: scenario.site,
      [scenario.configKey]: {
        baseUrl: origin,
        adminToken: "fixture-admin",
        userId: "1",
        username: "fixture-user",
        email: "fixture@example.invalid",
        totpSecret: "JBSWY3DPEHPK3PXP",
        password: "fixture-password",
      },
    })
    let phase: "idle" | "prepare" | "cleanup" | "verify" = "idle"
    const reads = {
      prepare: [] as string[],
      cleanup: [] as string[],
      verify: [] as string[],
    }
    const seenPaths: string[] = []
    let deleted = false
    const record = (label: string) => {
      if (phase !== "idle") reads[phase].push(label)
    }
    await context.route("https://example.com/api/token/*", async (route) => {
      if (route.request().method() === "DELETE") phase = "cleanup"
      await route.fallback()
    })
    const key = "sk-existing-token"
    const base = "https://example.com/v1"
    const channel = {
      id: 17,
      name: "Request count channel",
      type: 1,
      status: 1,
      key,
      base_url: base,
      models: "model-a",
      group: "default",
      priority: 0,
      weight: 1,
    }
    const cch = {
      id: 17,
      name: channel.name,
      url: base,
      maskedKey: "sk-****",
      providerType: "claude",
      isEnabled: true,
      weight: 1,
      priority: 1,
      groupTag: "default",
      allowedModels: [],
    }
    const sub = {
      id: 17,
      name: channel.name,
      platform: "openai",
      type: "apikey",
      status: "active",
      concurrency: 1,
      priority: 1,
      credentials_status: { has_api_key: true },
      credentials: { base_url: base, model_mapping: {} },
    }
    const axon = axonHubDetail({
      id: "opaque-channel",
      name: channel.name,
      baseURL: base,
      supportedModels: ["model-a"],
      tags: [],
      apiKeys: [key],
    })
    const octopus = {
      base_urls: [{ url: base }],
      keys: [{ id: 1, channel_id: 17, enabled: true, channel_key: key }],
      id: 17,
      name: channel.name,
      type: 0,
      enabled: true,
      base_url: base,
      key,
      model: "model-a",
      proxy: false,
      auto_sync: false,
      custom_header: [],
    }
    const cpa = {
      name: channel.name,
      "base-url": base,
      "api-key-entries": [{ "api-key": key }],
      models: [{ name: "model-a" }],
    }
    await context.route(`${origin}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      seenPaths.push(`${method} ${path}`)
      let data: unknown = []
      if (scenario.site === SITE_TYPES.AXON_HUB) {
        if (path !== "/admin/graphql") {
          await route.fulfill({ json: { token: "fixture-session" } })
          return
        }
        const query = request.postDataJSON().query as string
        if (query.includes("ListAxonHubChannelPage")) {
          record("list")
          data = {
            queryChannels: {
              edges: deleted ? [] : [{ node: axon, cursor: "one" }],
              pageInfo: { hasNextPage: false, endCursor: null },
              totalCount: deleted ? 0 : 1,
            },
          }
        } else if (query.includes("GetAxonHubChannel")) {
          record("detail")
          data = { node: axon }
        } else if (query.includes("DeleteChannel")) {
          deleted = true
          phase = "verify"
          data = { deleteChannel: true }
        } else
          throw new Error(`Unexpected AxonHub operation: ${query.slice(0, 70)}`)
        await route.fulfill({ json: { data } })
        return
      }
      if (scenario.site === SITE_TYPES.CLI_PROXY_API) {
        const kind = path.split("/").at(-1)!
        if (method === "GET") {
          record(`list:${kind}`)
          data = {
            [kind]: kind === "openai-compatibility" && !deleted ? [cpa] : [],
          }
        } else if (method === "DELETE") {
          deleted = true
          phase = "verify"
          data = { status: "ok" }
        } else throw new Error(`Unexpected CPA request: ${method} ${path}`)
        await route.fulfill({ json: data })
        return
      }
      if (method === "DELETE" || path.includes("/delete/")) {
        deleted = true
        phase = "verify"
        data = null
      } else if (
        path.endsWith("/key") ||
        path.endsWith("/key:reveal") ||
        path.endsWith("/accounts/data")
      ) {
        record("secret")
        data =
          scenario.site === SITE_TYPES.SUB2API
            ? {
                accounts: [
                  { ...sub, credentials: { ...sub.credentials, api_key: key } },
                ],
              }
            : { key }
      } else if (/\/17$/.test(path)) {
        record("detail")
        data =
          scenario.site === SITE_TYPES.CLAUDE_CODE_HUB
            ? cch
            : scenario.site === SITE_TYPES.SUB2API
              ? sub
              : channel
      } else if (path === "/api/channel/" || path === "/api/channel/search") {
        record("list")
        data = { items: deleted ? [] : [channel], total: deleted ? 0 : 1 }
      } else if (
        path === "/api/v1/providers" ||
        path === "/api/v1/admin/accounts"
      ) {
        record("list")
        data = {
          items: deleted
            ? []
            : [scenario.site === SITE_TYPES.SUB2API ? sub : cch],
          total: deleted ? 0 : 1,
          pages: 1,
        }
      } else if (path === "/api/v1/channel/list") {
        record("list")
        data = deleted ? [] : [octopus]
      } else if (path === "/api/v1/user/login")
        data = { token: "fixture-session", expire_at: "2099-01-01T00:00:00Z" }
      else if (path.includes("group")) data = ["default"]
      else if (path === "/api/verify")
        data = { expires_at: Math.floor(Date.now() / 1000) + 600 }
      else if (path.includes("status") || path.includes("passkey"))
        data = { enabled: path.includes("2fa") }
      else
        throw new Error(
          `Unexpected ${scenario.site} request: ${method} ${path}`,
        )
      await route.fulfill({
        json:
          scenario.site === SITE_TYPES.CLAUDE_CODE_HUB
            ? data
            : scenario.site === SITE_TYPES.SUB2API
              ? { code: 0, data }
              : scenario.site === SITE_TYPES.OCTOPUS
                ? { code: 200, data }
                : { success: true, data },
      })
    })
    await page.goto(
      `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}#keys?accountId=e2e-account-1`,
    )
    await waitForExtensionRoot(page)
    await expect(
      page.getByRole("heading", { name: "Request count key" }),
    ).toBeVisible()
    await page.getByRole("button", { name: "Delete Key", exact: true }).click()
    await expect(
      page.getByRole("checkbox", {
        name: "Also clean up matching channels on the current managed site",
      }),
    ).toBeChecked()
    phase = "prepare"
    await page
      .getByTestId(KEY_MANAGEMENT_TEST_IDS.deleteTokenConfirmButton)
      .click()
    await expect(page.getByRole("heading", { name: "Request count key" }))
      .toHaveCount(0)
      .catch((error) => {
        throw new Error(
          `${String(error)}\n${JSON.stringify({ reads, seenPaths })}`,
        )
      })
    expect(deleted).toBe(true)
    for (const step of ["prepare", "cleanup", "verify"] as const)
      expect([...reads[step]].sort(), `${scenario.site}: ${step}`).toEqual(
        [...scenario[step]].sort(),
      )
    await expect(
      page.getByRole("button", { name: "Retry cleanup", exact: true }),
    ).toHaveCount(0)
  })
}
