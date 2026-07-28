import type { BrowserContext, Page, Route } from "@playwright/test"

import { ChannelType } from "~/constants"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

const INTERCEPTED_MANAGED_SITE_ORIGIN = "https://managed.example.invalid"
const INTERCEPTED_MANAGED_SITE_TARGET_ORIGIN =
  "https://managed-target.example.invalid"

const channel = (overrides: Partial<ManagedSiteChannel>): ManagedSiteChannel =>
  ({
    id: 101,
    name: "Example primary",
    type: ChannelType.OpenAI,
    key: "sk-example",
    base_url: "https://upstream.example.invalid/v1",
    models: "model-a,model-b",
    group: "default,example",
    status: 1,
    priority: 3,
    weight: 2,
    ...overrides,
  }) as ManagedSiteChannel

const interceptedManagedSiteChannels = [
  channel({}),
  channel({
    id: 202,
    name: "Example secondary",
    type: ChannelType.Anthropic,
    base_url: "https://secondary.example.invalid/v1",
    models: "model-c",
    group: "default",
    status: 2,
    priority: 1,
    weight: 1,
  }),
]

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

async function installManagedSiteChannelsIntercepts(context: BrowserContext) {
  await context.route(
    `${INTERCEPTED_MANAGED_SITE_ORIGIN}/**`,
    async (route) => {
      const path = new URL(route.request().url()).pathname

      if (path === "/api/channel/") {
        await fulfill(route, {
          success: true,
          message: "ok",
          data: { items: interceptedManagedSiteChannels, total: 2 },
        })
        return
      }

      if (path === "/api/group") {
        await fulfill(route, { success: true, data: ["default", "example"] })
        return
      }

      if (path === "/api/user/models") {
        await fulfill(route, {
          success: true,
          data: ["model-a", "model-b", "model-c"],
        })
        return
      }

      await route.fulfill({ status: 404, body: "fixture route not configured" })
    },
  )
}

export async function openInterceptedManagedSiteChannels(params: {
  context: BrowserContext
  page: Page
  extensionId: string
}) {
  await forceExtensionLanguage(params.page, "en")
  await installManagedSiteChannelsIntercepts(params.context)
  await seedUserPreferences(await getServiceWorker(params.context), {
    managedSiteType: SITE_TYPES.NEW_API,
    newApi: {
      baseUrl: INTERCEPTED_MANAGED_SITE_ORIGIN,
      adminToken: "fixture-admin-token",
      userId: "1",
      username: "",
      password: "",
      totpSecret: "",
    },
    doneHub: {
      baseUrl: INTERCEPTED_MANAGED_SITE_TARGET_ORIGIN,
      adminToken: "fixture-target-admin-token",
      userId: "9",
    },
  })

  const url = new URL(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}`,
  )
  url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
  await params.page.goto(url.toString())
}
