import type { BrowserContext, Page } from "@playwright/test"

import { CHANNEL_DIALOG_TEST_IDS } from "~/components/dialogs/ChannelDialog/testIds"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  AXON_HUB_PRIMARY_ID,
  DONE_HUB_PRIMARY_ID,
  openInterceptedAxonHubManagedSiteChannels,
  openInterceptedDoneHubManagedSiteChannels,
  openInterceptedNewApiManagedSiteChannels,
  openInterceptedOctopusManagedSiteChannels,
} from "~~/e2e/fixtures/managedSiteChannelsIntercepted"
import {
  channelRowByName,
  openManagedSiteChannelRowActions,
} from "~~/e2e/scenarios/managedSiteChannels"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

type BrowserParams = {
  context: BrowserContext
  page: Page
  extensionId: string
}

/** Provides native HTTP responses, including fields an older editor does not own. */
async function openSelectiveSite(
  params: BrowserParams,
  site: "veloera" | "claudeCodeHub" | "sub2api",
) {
  const origin = `https://${site.toLowerCase()}.example.invalid`
  let resource: Record<string, unknown> = {
    id: 17,
    name: "Minimal primary",
    type: 1,
    base_url: "https://upstream.example.invalid",
    models: "model-a",
    group: "default",
    priority: 3,
    weight: 2,
    status: 1,
    key: "",
    model_prefix: "keep-prefix",
    system_prompt: "keep-policy",
  }
  if (site === "claudeCodeHub")
    resource = {
      id: 17,
      name: "Minimal primary",
      url: "https://upstream.example.invalid",
      maskedKey: "sk-****",
      providerType: "claude",
      isEnabled: true,
      weight: 2,
      priority: 3,
      groupTag: "default",
      allowedModels: [{ matchType: "exact", pattern: "model-a" }],
      futurePolicy: { enabled: true },
    }
  if (site === "sub2api")
    resource = {
      id: 17,
      name: "Minimal primary",
      platform: "openai",
      type: "apikey",
      status: "active",
      concurrency: 3,
      priority: 2,
      notes: "Keep notes",
      credentials_status: { has_api_key: true },
      credentials: {
        base_url: "https://upstream.example.invalid",
        model_mapping: { "model-a": "model-a" },
        future_credential_option: true,
      },
    }
  await params.context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const isList =
      path ===
      (site === "veloera"
        ? "/api/channel/"
        : site === "claudeCodeHub"
          ? "/api/v1/providers"
          : "/api/v1/admin/accounts")
    let data: unknown
    if (["PUT", "PATCH"].includes(request.method())) {
      resource = { ...resource, ...request.postDataJSON() }
      data = resource
    } else if (path.includes("group")) {
      data = ["default"]
    } else if (isList) {
      data =
        site === "veloera"
          ? [resource]
          : { items: [resource], total: 1, pages: 1 }
    } else if (path.endsWith("/17")) {
      data = resource
    } else {
      await route.fulfill({ status: 404, body: "Unexpected fixture request" })
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        site === "claudeCodeHub"
          ? data
          : site === "sub2api"
            ? { code: 0, data }
            : { success: true, data },
      ),
    })
  })
  await forceExtensionLanguage(params.page, "en")
  const config = {
    baseUrl: origin,
    adminToken: "fixture-admin-token",
    userId: "1",
  }
  await seedUserPreferences(await getServiceWorker(params.context), {
    managedSiteType:
      site === "veloera"
        ? SITE_TYPES.VELOERA
        : site === "claudeCodeHub"
          ? SITE_TYPES.CLAUDE_CODE_HUB
          : SITE_TYPES.SUB2API,
    ...(site === "veloera"
      ? { veloera: config }
      : site === "claudeCodeHub"
        ? { claudeCodeHub: config }
        : { sub2apiManagedSite: config }),
  })
  await params.page.goto(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
  )
}

test.use({ viewport: { width: 1440, height: 1000 }, locale: "en-US" })

const cases = [
  {
    name: "AxonHub",
    open: openInterceptedAxonHubManagedSiteChannels,
    original: "Example primary",
    expected: { id: AXON_HUB_PRIMARY_ID, input: { name: "Minimal renamed" } },
  },
  {
    name: "DoneHub",
    open: openInterceptedDoneHubManagedSiteChannels,
    original: "DoneHub primary",
    expected: { id: DONE_HUB_PRIMARY_ID, name: "Minimal renamed" },
  },
  {
    name: "Octopus",
    open: openInterceptedOctopusManagedSiteChannels,
    original: "Example outbound",
    expected: { id: 17, name: "Minimal renamed" },
  },
  {
    name: "Veloera",
    open: (params: BrowserParams) => openSelectiveSite(params, "veloera"),
    original: "Minimal primary",
    expected: { id: 17, name: "Minimal renamed" },
  },
  {
    name: "Claude Code Hub",
    open: (params: BrowserParams) => openSelectiveSite(params, "claudeCodeHub"),
    original: "Minimal primary",
    expected: { name: "Minimal renamed" },
  },
  {
    name: "Sub2API",
    open: (params: BrowserParams) => openSelectiveSite(params, "sub2api"),
    original: "Minimal primary",
    expected: { name: "Minimal renamed" },
  },
] as const

for (const scenario of cases) {
  test(`${scenario.name} sends only the renamed field and required identity`, async ({
    context,
    page,
    extensionId,
  }) => {
    await scenario.open({ context, page, extensionId })
    await openManagedSiteChannelRowActions(page, scenario.original)
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await page
      .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
      .fill("Minimal renamed")
    const updates: unknown[] = []
    context.on("request", (request) => {
      if (
        ["PUT", "PATCH"].includes(request.method()) ||
        (request.method() === "POST" &&
          request.url().includes("/channel/update"))
      )
        updates.push(request.postDataJSON())
      else if (
        request.method() === "POST" &&
        request.postData()?.includes("mutation UpdateChannel(")
      )
        updates.push(request.postDataJSON().variables)
    })
    await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
    await expect(channelRowByName(page, "Minimal renamed")).toBeVisible()
    expect(updates).toEqual([scenario.expected])
  })
}

test("New API preserves required full-update fields and omits unchanged status and credentials", async ({
  context,
  page,
  extensionId,
}) => {
  await openInterceptedNewApiManagedSiteChannels({ context, page, extensionId })
  await openManagedSiteChannelRowActions(page, "Example primary")
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click()
  await page
    .getByTestId(CHANNEL_DIALOG_TEST_IDS.nameInput)
    .fill("Minimal renamed")
  const updates: unknown[] = []
  context.on("request", (request) => {
    if (request.method() === "PUT") updates.push(request.postDataJSON())
  })
  await page.getByTestId(CHANNEL_DIALOG_TEST_IDS.submitButton).click()
  await expect(channelRowByName(page, "Minimal renamed")).toBeVisible()
  expect(updates).toEqual([
    {
      id: 101,
      name: "Minimal renamed",
      type: 1,
      base_url: "https://upstream.example.invalid/v1",
      models: "model-a,model-b",
      group: "default,example",
      priority: 3,
      weight: 2,
    },
  ])
})
