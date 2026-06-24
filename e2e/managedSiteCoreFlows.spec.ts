import type { BrowserContext, Route } from "@playwright/test"

import { ChannelType } from "~/constants"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { CHANNEL_STATUS, type ManagedSiteChannel } from "~/types/managedSite"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  expectPermissionOnboardingHidden,
  getPlasmoStorageRawValue,
  getServiceWorker,
  setPlasmoStorageValue,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

const MANAGED_SITE_BASE_URL = "https://managed-site.example.com"
const MANAGED_SITE_ADMIN_TOKEN = "managed-site-admin-token"
const MANAGED_SITE_USER_ID = "1"

const basicSettingsUrl = (
  extensionId: string,
  params?: Record<string, string>,
) => {
  const url = new URL(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  url.hash = MENU_ITEM_IDS.BASIC
  return url.toString()
}

const channelsUrl = (extensionId: string, params?: Record<string, string>) => {
  const url = new URL(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
  return url.toString()
}

const modelSyncUrl = (extensionId: string, params?: Record<string, string>) => {
  const url = new URL(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value)
  }

  url.hash = MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC
  return url.toString()
}

function createManagedSiteChannel(
  overrides: Partial<ManagedSiteChannel>,
): ManagedSiteChannel {
  return {
    id: 101,
    type: ChannelType.OpenAI,
    key: "",
    name: "Production OpenAI",
    base_url: "https://upstream-a.example.com/v1",
    models: "gpt-4o-mini",
    status: 1,
    weight: 1,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 1_700_000_000,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default,vip",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 1,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    ...overrides,
  }
}

async function seedManagedSitePreferences(
  context: BrowserContext,
  overrides: {
    modelRedirect?: Record<string, unknown>
  } = {},
) {
  const serviceWorker = await getServiceWorker(context)

  await seedUserPreferences(serviceWorker, {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: MANAGED_SITE_BASE_URL,
      adminToken: MANAGED_SITE_ADMIN_TOKEN,
      userId: MANAGED_SITE_USER_ID,
      username: "",
      password: "",
      totpSecret: "",
    },
    managedSiteModelSync: {
      enabled: false,
      interval: 24 * 60 * 60 * 1000,
      concurrency: 1,
      maxRetries: 0,
      rateLimit: {
        requestsPerMinute: 60,
        burst: 10,
      },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
    modelRedirect: {
      enabled: false,
      standardModels: [],
      pruneMissingTargetsOnModelSync: false,
      ...overrides.modelRedirect,
    },
  })
}

async function seedManagedSiteModelOptions(context: BrowserContext) {
  const serviceWorker = await getServiceWorker(context)

  await setPlasmoStorageValue(
    serviceWorker,
    "managedSiteModelSync_channelUpstreamModelsCache",
    ["gpt-4o-mini", "gpt-4.1-mini", "claude-3-5-sonnet"],
  )
}

async function readStoredPreferences(
  context: BrowserContext,
): Promise<Record<string, unknown>> {
  const serviceWorker = await getServiceWorker(context)
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    STORAGE_KEYS.USER_PREFERENCES,
  )

  if (typeof raw !== "string") {
    return {}
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function readStoredManagedSiteModelSync(
  context: BrowserContext,
): Promise<Record<string, unknown>> {
  const preferences = await readStoredPreferences(context)
  const modelSync = preferences.managedSiteModelSync

  if (!modelSync || typeof modelSync !== "object") {
    return {}
  }

  return modelSync as Record<string, unknown>
}

async function readStoredNewApiPreferences(
  context: BrowserContext,
): Promise<Record<string, unknown>> {
  const preferences = await readStoredPreferences(context)
  const newApi = preferences.newApi

  if (!newApi || typeof newApi !== "object") {
    return {}
  }

  return newApi as Record<string, unknown>
}

async function readStoredModelSyncExecution(context: BrowserContext): Promise<{
  items?: Array<{ channelId: number; ok: boolean; newModels?: string[] }>
}> {
  const serviceWorker = await getServiceWorker(context)
  const raw = await getPlasmoStorageRawValue<unknown>(
    serviceWorker,
    "managedSiteModelSync_lastExecution",
  )

  if (typeof raw !== "string") {
    return {}
  }

  try {
    return JSON.parse(raw) as {
      items?: Array<{ channelId: number; ok: boolean; newModels?: string[] }>
    }
  } catch {
    return {}
  }
}

async function stubManagedSiteAdminRoutes(
  context: BrowserContext,
  options: {
    channels?: ManagedSiteChannel[]
    fetchedModelsByChannelId?: Record<number, string[]>
  } = {},
) {
  const channels = options.channels ?? [
    createManagedSiteChannel({
      id: 101,
      name: "Production OpenAI",
      base_url: "https://upstream-a.example.com/v1",
      models: "gpt-4o-mini",
      group: "default,vip",
      status: 1,
      priority: 3,
      weight: 2,
    }),
    createManagedSiteChannel({
      id: 202,
      name: "Sandbox Anthropic",
      type: ChannelType.Anthropic,
      base_url: "https://upstream-b.example.com",
      models: "claude-3-5-sonnet",
      group: "default",
      status: 2,
      priority: 1,
      weight: 1,
    }),
  ]
  let nextChannelId = 303
  const createPayloads: unknown[] = []
  const updatePayloads: unknown[] = []
  const origin = new URL(MANAGED_SITE_BASE_URL).origin

  await context.route(`${origin}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    if (method === "GET" && url.pathname === "/api/channel/") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: {
            items: channels,
            total: channels.length,
            type_counts: {
              [String(ChannelType.OpenAI)]: 1,
              [String(ChannelType.Anthropic)]: 1,
            },
          },
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/group") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: ["default", "vip"],
        }),
      })
      return
    }

    if (method === "GET" && url.pathname === "/api/user/models") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: ["gpt-4o-mini", "gpt-4.1-mini", "claude-3-5-sonnet"],
        }),
      })
      return
    }

    if (
      method === "GET" &&
      url.pathname.startsWith("/api/channel/fetch_models/")
    ) {
      const channelId = Number(url.pathname.split("/").filter(Boolean).pop())
      const fetchedModels =
        options.fetchedModelsByChannelId?.[channelId] ??
        (channelId === 101
          ? ["gpt-4o-mini", "gpt-4.1-mini"]
          : channelId === 202
            ? ["claude-3-5-sonnet"]
            : null)

      if (!fetchedModels) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            message: `No fetched models configured for channel ${channelId}`,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "ok",
          data: fetchedModels,
        }),
      })
      return
    }

    if (method === "POST" && url.pathname === "/api/channel/") {
      const payload = request.postDataJSON()
      createPayloads.push(payload)

      const rawChannel =
        payload && typeof payload === "object" && "channel" in payload
          ? (payload as { channel?: Record<string, unknown> }).channel
          : (payload as Record<string, unknown>)
      const createdChannel = createManagedSiteChannel({
        id: nextChannelId,
        name:
          typeof rawChannel?.name === "string"
            ? rawChannel.name
            : `E2E Created Channel ${nextChannelId}`,
        key: typeof rawChannel?.key === "string" ? rawChannel.key : "",
        base_url:
          typeof rawChannel?.base_url === "string" ? rawChannel.base_url : "",
        models: typeof rawChannel?.models === "string" ? rawChannel.models : "",
        group:
          typeof rawChannel?.group === "string" ? rawChannel.group : "default",
        priority:
          typeof rawChannel?.priority === "number" ? rawChannel.priority : 0,
        weight: typeof rawChannel?.weight === "number" ? rawChannel.weight : 1,
        status:
          rawChannel?.status === CHANNEL_STATUS.ManuallyDisabled
            ? CHANNEL_STATUS.ManuallyDisabled
            : CHANNEL_STATUS.Enable,
      })
      nextChannelId += 1
      channels.push(createdChannel)

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "created",
          data: createdChannel,
        }),
      })
      return
    }

    if (method === "PUT" && url.pathname === "/api/channel/") {
      const payload = request.postDataJSON()
      updatePayloads.push(payload)

      const channel = channels.find(
        (item) => item.id === Number((payload as { id?: number }).id),
      )
      if (channel) {
        const updates = payload as Partial<ManagedSiteChannel>

        if (typeof updates.name === "string") channel.name = updates.name
        if (typeof updates.key === "string") channel.key = updates.key
        if (typeof updates.base_url === "string") {
          channel.base_url = updates.base_url
        }
        if (typeof updates.models === "string") channel.models = updates.models
        if (typeof updates.model_mapping === "string") {
          channel.model_mapping = updates.model_mapping
        }
        if (typeof updates.group === "string") channel.group = updates.group
        if (typeof updates.priority === "number") {
          channel.priority = updates.priority
        }
        if (typeof updates.weight === "number") channel.weight = updates.weight
        if (updates.status !== undefined) channel.status = updates.status
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "updated",
          data: null,
        }),
      })
      return
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/channel/")) {
      const channelId = Number(url.pathname.split("/").filter(Boolean).pop())
      const channelIndex = channels.findIndex((item) => item.id === channelId)

      if (channelIndex >= 0) {
        channels.splice(channelIndex, 1)
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "deleted",
          data: null,
        }),
      })
      return
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: `Unhandled managed-site E2E route: ${method} ${url.pathname}`,
      }),
    })
  })

  return {
    createPayloads,
    updatePayloads,
  }
}

test.beforeEach(async ({ context, page }) => {
  installExtensionPageGuards(page)
  await forceExtensionLanguage(page, "en")
  await stubLlmMetadataIndex(context)
})

test("shows managed-site setup guidance before channel and model-sync workflows are available", async ({
  extensionId,
  page,
}) => {
  await page.goto(channelsUrl(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Channels management" }),
  ).toBeVisible()
  await expect(
    page.getByText(
      "Please configure New API address, admin token, and user ID in basic settings first",
    ),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Add channel" })).toHaveCount(0)

  await page.goto(modelSyncUrl(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Model List Synchronization" }),
  ).toBeVisible()
  await expect(
    page.getByText(
      "Please configure New API address, admin token, and user ID in basic settings first",
    ),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Run All" })).toHaveCount(0)
})

test("configures New API managed-site credentials from settings and opens model sync", async ({
  context,
  extensionId,
  page,
}) => {
  await stubManagedSiteAdminRoutes(context)

  await page.goto(basicSettingsUrl(extensionId, { tab: "managedSite" }))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Managed Site Configuration" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "New API Integration Settings" }),
  ).toBeVisible()

  const baseUrlInput = page.locator("#new-api-base-url input")
  const adminTokenInput = page.locator("#new-api-admin-token input")
  const userIdInput = page.locator("#new-api-user-id input")
  const usernameInput = page.locator("#new-api-username input")
  const passwordInput = page.locator("#new-api-password input")
  const totpSecretInput = page.locator("#new-api-totp-secret input")

  await baseUrlInput.fill("")
  await baseUrlInput.fill(MANAGED_SITE_BASE_URL)
  await baseUrlInput.blur()
  await expect
    .poll(async () => (await readStoredNewApiPreferences(context)).baseUrl)
    .toBe(MANAGED_SITE_BASE_URL)

  await adminTokenInput.fill(MANAGED_SITE_ADMIN_TOKEN)
  await adminTokenInput.blur()
  await expect
    .poll(async () => (await readStoredNewApiPreferences(context)).adminToken)
    .toBe(MANAGED_SITE_ADMIN_TOKEN)

  await userIdInput.fill(MANAGED_SITE_USER_ID)
  await userIdInput.blur()
  await expect
    .poll(async () => (await readStoredNewApiPreferences(context)).userId)
    .toBe(MANAGED_SITE_USER_ID)

  await usernameInput.fill("new-api-admin")
  await usernameInput.blur()
  await expect
    .poll(async () => (await readStoredNewApiPreferences(context)).username)
    .toBe("new-api-admin")

  await passwordInput.fill("new-api-password")
  await passwordInput.blur()
  await expect
    .poll(async () => (await readStoredNewApiPreferences(context)).password)
    .toBe("new-api-password")

  await totpSecretInput.fill("JBSWY3DPEHPK3PXP")
  await totpSecretInput.blur()
  await expect
    .poll(async () => (await readStoredNewApiPreferences(context)).totpSecret)
    .toBe("JBSWY3DPEHPK3PXP")

  await expect
    .poll(async () => {
      const preferences = await readStoredPreferences(context)
      return {
        managedSiteType: preferences.managedSiteType,
        newApi: preferences.newApi,
      }
    })
    .toEqual(
      expect.objectContaining({
        managedSiteType: SITE_TYPES.NEW_API,
        newApi: expect.objectContaining({
          baseUrl: MANAGED_SITE_BASE_URL,
          adminToken: MANAGED_SITE_ADMIN_TOKEN,
          userId: MANAGED_SITE_USER_ID,
          username: "new-api-admin",
          password: "new-api-password",
          totpSecret: "JBSWY3DPEHPK3PXP",
        }),
      }),
    )

  await page
    .locator("#managed-site-model-sync-view-execution")
    .getByRole("button", { name: "Open" })
    .click()

  await expect(page).toHaveURL(/options\.html.*#managedSiteModelSync$/)
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Model List Synchronization" }),
  ).toBeVisible()
  await expect(
    page.getByText(
      "Please configure New API address, admin token, and user ID in basic settings first",
    ),
  ).toHaveCount(0)
})

test("configures managed-site model sync scheduling and allowed models", async ({
  context,
  extensionId,
  page,
}) => {
  await seedManagedSitePreferences(context)
  await seedManagedSiteModelOptions(context)
  await stubManagedSiteAdminRoutes(context)

  await page.goto(basicSettingsUrl(extensionId, { tab: "managedSite" }))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.locator("#managed-site-model-sync")).toContainText(
    "Model List Sync Settings",
  )
  await expect(
    page.getByText("Only models listed here will be written to each channel"),
  ).toBeVisible()

  await page.locator("#managed-site-model-sync-enable button").click()
  await expect
    .poll(async () => (await readStoredManagedSiteModelSync(context)).enabled)
    .toBe(true)

  const intervalInput = page.locator("#managed-site-model-sync-interval input")
  const concurrencyInput = page.locator(
    "#managed-site-model-sync-concurrency input",
  )
  const maxRetriesInput = page.locator(
    "#managed-site-model-sync-max-retries input",
  )
  const requestsPerMinuteInput = page.locator(
    "#managed-site-model-sync-requests-per-minute input",
  )
  const burstInput = page.locator("#managed-site-model-sync-burst input")
  const allowedModelsInput = page.getByRole("combobox", {
    name: /Search and select models/,
  })

  await intervalInput.fill("12")
  await expect
    .poll(async () => (await readStoredManagedSiteModelSync(context)).interval)
    .toBe(12 * 60 * 60 * 1000)

  await concurrencyInput.fill("3")
  await expect
    .poll(
      async () => (await readStoredManagedSiteModelSync(context)).concurrency,
    )
    .toBe(3)

  await maxRetriesInput.fill("2")
  await expect
    .poll(
      async () => (await readStoredManagedSiteModelSync(context)).maxRetries,
    )
    .toBe(2)

  await requestsPerMinuteInput.fill("30")
  await expect
    .poll(
      async () =>
        (
          (await readStoredManagedSiteModelSync(context)).rateLimit as
            | Record<string, unknown>
            | undefined
        )?.requestsPerMinute,
    )
    .toBe(30)

  await burstInput.fill("8")
  await expect
    .poll(
      async () =>
        (
          (await readStoredManagedSiteModelSync(context)).rateLimit as
            | Record<string, unknown>
            | undefined
        )?.burst,
    )
    .toBe(8)

  await expect(allowedModelsInput).toBeEnabled()
  await allowedModelsInput.fill("gpt-4.1-mini")
  await allowedModelsInput.press("Enter")

  await expect
    .poll(
      async () => (await readStoredManagedSiteModelSync(context)).allowedModels,
    )
    .toEqual(["gpt-4.1-mini"])

  await expect(
    page.getByLabel("Copy gpt-4.1-mini", { exact: true }),
  ).toBeVisible()

  await expect
    .poll(async () => readStoredManagedSiteModelSync(context))
    .toEqual(
      expect.objectContaining({
        enabled: true,
        interval: 12 * 60 * 60 * 1000,
        concurrency: 3,
        maxRetries: 2,
        rateLimit: {
          requestsPerMinute: 30,
          burst: 8,
        },
        allowedModels: ["gpt-4.1-mini"],
        globalChannelModelFilters: [],
      }),
    )
})

test("creates a managed-site channel from channel management", async ({
  context,
  extensionId,
  page,
}) => {
  await seedManagedSitePreferences(context)
  const { createPayloads } = await stubManagedSiteAdminRoutes(context)

  await page.goto(channelsUrl(extensionId))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Channels management" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Add channel" }).click()

  await expect(
    page.getByRole("heading", { name: "Create Channel" }),
  ).toBeVisible()

  await page
    .getByPlaceholder("Enter a descriptive channel name")
    .fill("E2E Created OpenAI")
  await page
    .getByPlaceholder("Enter the upstream provider API key")
    .fill("sk-e2e-created-channel")
  await page.getByPlaceholder("Select or type model names").fill("gpt-4.1-mini")
  await page.getByPlaceholder("Select or type model names").press("Enter")

  await expect(
    page.getByLabel("Copy gpt-4.1-mini", { exact: true }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Create Channel" }).click()

  await expect(page.getByText("Channel saved")).toBeVisible()
  await expect(page.getByText("E2E Created OpenAI")).toBeVisible()
  await expect(createPayloads).toContainEqual({
    mode: "single",
    channel: {
      name: "E2E Created OpenAI",
      type: ChannelType.OpenAI,
      key: "sk-e2e-created-channel",
      base_url: "",
      models: "gpt-4.1-mini",
      groups: ["default"],
      group: "default",
      priority: 0,
      weight: 0,
      status: 1,
    },
  })
})

test("edits a managed-site channel from row actions", async ({
  context,
  extensionId,
  page,
}) => {
  await seedManagedSitePreferences(context)
  const { updatePayloads } = await stubManagedSiteAdminRoutes(context)

  await page.goto(channelsUrl(extensionId, { search: "Production" }))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(page.getByText("Production OpenAI")).toBeVisible()
  await page.getByRole("button", { name: "Actions" }).click()
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()

  await expect(
    page.getByRole("heading", { name: "Edit Channel" }),
  ).toBeVisible()

  await page
    .getByPlaceholder("Enter a descriptive channel name")
    .fill("Production OpenAI Edited")
  const modelSearchInput = page.getByPlaceholder("Search...").first()
  await modelSearchInput.fill("gpt-4.1-mini")
  await modelSearchInput.press("Enter")

  await expect(
    page.getByLabel("Copy gpt-4.1-mini", { exact: true }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Save Changes" }).click()

  await expect(page.getByText("Channel updated")).toBeVisible()
  await expect(page.getByText("Production OpenAI Edited")).toBeVisible()
  expect(updatePayloads).toContainEqual(
    expect.objectContaining({
      id: 101,
      name: "Production OpenAI Edited",
      base_url: "https://upstream-a.example.com/v1",
      models: "gpt-4o-mini,gpt-4.1-mini",
      groups: ["default", "vip"],
      group: "default,vip",
      priority: 3,
      weight: 2,
      status: 1,
    }),
  )
})

test("loads managed-site channels, deep-links into manual model sync, and runs a selected sync", async ({
  context,
  extensionId,
  page,
}) => {
  await seedManagedSitePreferences(context)
  const { updatePayloads } = await stubManagedSiteAdminRoutes(context)

  await page.goto(channelsUrl(extensionId, { search: "Production" }))
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Channels management" }),
  ).toBeVisible()
  await expect(page.getByText("Production OpenAI")).toBeVisible()
  await expect(
    page.getByText("https://upstream-a.example.com/v1"),
  ).toBeVisible()
  await expect(page.getByText("Sandbox Anthropic")).toHaveCount(0)
  await expect(page.getByText("1 - 1 of 1 channels")).toBeVisible()

  await page.getByRole("button", { name: "Actions" }).click()
  await page
    .getByRole("menuitem", { name: "Open model sync interface" })
    .click()

  await expect(page).toHaveURL(
    /options\.html\?channelId=101&tab=manual#managedSiteModelSync$/,
  )
  await expect(
    page.getByRole("heading", { name: "Model List Synchronization" }),
  ).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "Manual Execution", selected: true }),
  ).toBeVisible()
  await expect(
    page.getByPlaceholder("Search channels by name or ID..."),
  ).toHaveValue("101")
  await expect(page.getByRole("cell", { name: "101" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Run Selected (1)" }),
  ).toBeEnabled()

  await page.getByRole("button", { name: "Run Selected (1)" }).click()

  await expect(page.getByText("Sync completed: 1/1 succeeded")).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "Execution History" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Manage channel: Production OpenAI" }),
  ).toBeVisible()
  await expect(page.getByText("Successful")).toBeVisible()

  expect(updatePayloads).toContainEqual({
    id: 101,
    models: "gpt-4o-mini,gpt-4.1-mini",
  })

  const storedExecution = await readStoredModelSyncExecution(context)

  expect(storedExecution.items).toEqual([
    expect.objectContaining({
      channelId: 101,
      ok: true,
      newModels: ["gpt-4o-mini", "gpt-4.1-mini"],
    }),
  ])
})

test("applies model redirect mapping during selected managed-site model sync through the background route", async ({
  context,
  extensionId,
  page,
}) => {
  await seedManagedSitePreferences(context, {
    modelRedirect: {
      enabled: true,
      standardModels: ["gpt-4o-mini"],
      pruneMissingTargetsOnModelSync: true,
    },
  })
  const { updatePayloads } = await stubManagedSiteAdminRoutes(context, {
    channels: [
      createManagedSiteChannel({
        id: 101,
        name: "Redirect OpenAI",
        base_url: "https://upstream-a.example.com/v1",
        models: "legacy-model",
        model_mapping: JSON.stringify({
          stale: "retired-model",
        }),
      }),
    ],
    fetchedModelsByChannelId: {
      101: ["openai/gpt-4o-mini:free", "gpt-4.1-mini"],
    },
  })

  await page.goto(
    modelSyncUrl(extensionId, { channelId: "101", tab: "manual" }),
  )
  await waitForExtensionRoot(page)
  await expectPermissionOnboardingHidden(page)

  await expect(
    page.getByRole("heading", { name: "Model List Synchronization" }),
  ).toBeVisible()
  await expect(page.getByRole("cell", { name: "101" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Run Selected (1)" }),
  ).toBeEnabled()

  await page.getByRole("button", { name: "Run Selected (1)" }).click()

  await expect(page.getByText("Sync completed: 1/1 succeeded")).toBeVisible()
  await expect(
    page.getByRole("tab", { name: "Execution History" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Manage channel: Redirect OpenAI" }),
  ).toBeVisible()
  await expect(page.getByText("Successful")).toBeVisible()

  expect(updatePayloads).toContainEqual({
    id: 101,
    models: "openai/gpt-4o-mini:free,gpt-4.1-mini",
  })
  expect(updatePayloads).toContainEqual({
    id: 101,
    models: "openai/gpt-4o-mini:free,gpt-4.1-mini,gpt-4o-mini",
    model_mapping: JSON.stringify({
      "gpt-4o-mini": "openai/gpt-4o-mini:free",
    }),
  })

  const storedExecution = await readStoredModelSyncExecution(context)

  expect(storedExecution.items).toEqual([
    expect.objectContaining({
      channelId: 101,
      ok: true,
      newModels: ["openai/gpt-4o-mini:free", "gpt-4.1-mini"],
    }),
  ])
})
