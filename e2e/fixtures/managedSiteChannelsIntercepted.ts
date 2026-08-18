import type { BrowserContext, Page, Route } from "@playwright/test"

import { ChannelType } from "~/constants"
import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { OCTOPUS_COOKIE_SESSION_STATUS_PATH } from "~/constants/octopus"
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
const INTERCEPTED_AXON_HUB_ORIGIN = "https://axonhub.example.invalid"
const INTERCEPTED_OCTOPUS_ORIGIN = "https://octopus.example.invalid"
const INTERCEPTED_OCTOPUS_COOKIE = "auth=octopus-cookie-session"

const AXON_HUB_PRIMARY_ID = "gid://axonhub/Channel/opaque-primary"
const AXON_HUB_SECONDARY_ID = "gid://axonhub/Channel/opaque-secondary"
const AXON_HUB_CREATED_ID = "gid://axonhub/Channel/opaque-created"
const AXON_HUB_NEXT_CURSOR = "axonhub-cursor-page-2"
const AXON_HUB_CREATED_CURSOR = "axonhub-cursor-page-3"

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

let interceptedAxonHubPrimaryName = "Example primary"
let interceptedAxonHubPrimaryTags = ["fixture-tag"]
let interceptedAxonHubUpdateVariables: Record<string, unknown> | null = null
let interceptedAxonHubListRequestCount = 0
let interceptedAxonHubDeleteRequestCount = 0
let interceptedOctopusCookieHeader: string | null = null
let interceptedOctopusRootRequestCount = 0
let interceptedOctopusStatusRequestCount = 0
let interceptedAxonHubCreatedChannel: {
  name: string
  baseURL: string
  supportedModels: string[]
  tags: string[]
} | null = null

const axonHubSummary = (params: {
  id: string
  name: string
  tags: readonly string[]
  baseURL: string
  supportedModels: readonly string[]
}) => ({
  id: params.id,
  type: "openai",
  baseURL: params.baseURL,
  name: params.name,
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  tags: [...params.tags],
  supportedModels: [...params.supportedModels],
})

const axonHubSettings = () => ({
  extraModelPrefix: null,
  modelMappings: [],
  autoTrimedModelPrefixes: [],
  hideOriginalModels: null,
  hideMappedModels: null,
  lowercaseModelId: null,
  proxy: { type: "URL", url: null, username: null, password: null },
  transformOptions: {
    forceArrayInstructions: false,
    forceArrayInputs: false,
    replaceDeveloperRoleWithSystem: false,
    reasoningEffortMapping: null,
  },
  headerOverrideOperations: [],
  bodyOverrideOperations: [],
  passThroughUserAgent: null,
  passThroughBody: null,
  rateLimit: {
    rpm: null,
    tpm: null,
    maxConcurrent: null,
    queueSize: null,
    queueTimeoutMs: null,
  },
  retryableStatusCodes: [],
  retryableErrorPatterns: [],
  providerQuota: { opencodeGo: { workspaceId: null, authCookie: null } },
})

const axonHubDetail = (params: {
  id: string
  name: string
  tags: readonly string[]
  baseURL: string
  supportedModels: readonly string[]
}) => ({
  __typename: "Channel",
  id: params.id,
  createdAt: "2026-07-20T00:00:00Z",
  updatedAt: "2026-07-20T00:00:00Z",
  type: "openai",
  baseURL: params.baseURL,
  name: params.name,
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  policies: { stream: null },
  credentials: {
    apiKey: null,
    apiKeys: ["sk-axonhub-fixture"],
    gcp: null,
    oauth: null,
  },
  supportedModels: [...params.supportedModels],
  autoSyncSupportedModels: false,
  autoSyncModelPattern: null,
  manualModels: [...params.supportedModels],
  tags: [...params.tags],
  defaultTestModel: params.supportedModels[0] ?? "model-alpha",
  settings: axonHubSettings(),
  orderingWeight: 0,
  errorMessage: null,
  remark: null,
  endpoints: null,
  disabledAPIKeys: null,
})

function getAxonHubPrimarySummary() {
  return axonHubSummary({
    id: AXON_HUB_PRIMARY_ID,
    name: interceptedAxonHubPrimaryName,
    tags: interceptedAxonHubPrimaryTags,
    baseURL: "https://upstream.example.invalid/v1",
    supportedModels: ["model-alpha"],
  })
}

function getAxonHubSecondarySummary() {
  return axonHubSummary({
    id: AXON_HUB_SECONDARY_ID,
    name: "Example secondary",
    tags: ["secondary-tag"],
    baseURL: "https://secondary.example.invalid/v1",
    supportedModels: ["model-beta"],
  })
}

function getAxonHubCreatedSummary() {
  if (!interceptedAxonHubCreatedChannel) return null

  return axonHubSummary({
    id: AXON_HUB_CREATED_ID,
    ...interceptedAxonHubCreatedChannel,
  })
}

function getAxonHubPrimaryDetail() {
  return axonHubDetail({
    id: AXON_HUB_PRIMARY_ID,
    name: interceptedAxonHubPrimaryName,
    tags: interceptedAxonHubPrimaryTags,
    baseURL: "https://upstream.example.invalid/v1",
    supportedModels: ["model-alpha"],
  })
}

function getAxonHubCreatedDetail() {
  if (!interceptedAxonHubCreatedChannel) return null

  return axonHubDetail({
    id: AXON_HUB_CREATED_ID,
    ...interceptedAxonHubCreatedChannel,
  })
}

export function getInterceptedAxonHubUpdateVariables() {
  return interceptedAxonHubUpdateVariables
}

export function getInterceptedAxonHubListRequestCount() {
  return interceptedAxonHubListRequestCount
}

export function getInterceptedAxonHubDeleteRequestCount() {
  return interceptedAxonHubDeleteRequestCount
}

export function getInterceptedOctopusCookieHeader() {
  return interceptedOctopusCookieHeader
}

export function getInterceptedOctopusRootRequestCount() {
  return interceptedOctopusRootRequestCount
}

export function getInterceptedOctopusStatusRequestCount() {
  return interceptedOctopusStatusRequestCount
}

async function fulfill(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

async function fulfillGraphQLError(route: Route, message: string) {
  await route.fulfill({
    status: 400,
    contentType: "application/json",
    body: JSON.stringify({ errors: [{ message }] }),
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

async function installAxonHubIntercepts(context: BrowserContext) {
  interceptedAxonHubPrimaryName = "Example primary"
  interceptedAxonHubPrimaryTags = ["fixture-tag"]
  interceptedAxonHubUpdateVariables = null
  interceptedAxonHubListRequestCount = 0
  interceptedAxonHubDeleteRequestCount = 0
  interceptedAxonHubCreatedChannel = null

  await context.route(`${INTERCEPTED_AXON_HUB_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/admin/auth/signin") {
      await fulfill(route, { token: "axonhub-fixture-session" })
      return
    }

    if (url.pathname !== "/admin/graphql") {
      await route.fulfill({ status: 404, body: "fixture route not configured" })
      return
    }

    const body = JSON.parse(route.request().postData() ?? "{}") as {
      query?: string
      variables?: Record<string, unknown>
    }
    const query = body.query ?? ""

    if (query.includes("query ListAxonHubChannelPage")) {
      interceptedAxonHubListRequestCount += 1
      const input = body.variables?.input as
        | { after?: string | null }
        | undefined
      const after = input?.after
      const createdSummary = getAxonHubCreatedSummary()
      const summaries = [
        getAxonHubPrimarySummary(),
        getAxonHubSecondarySummary(),
        ...(createdSummary ? [createdSummary] : []),
      ]
      const pageIndex =
        after === undefined || after === null
          ? 0
          : after === AXON_HUB_NEXT_CURSOR
            ? 1
            : after === AXON_HUB_CREATED_CURSOR
              ? 2
              : -1
      if (pageIndex < 0 || pageIndex >= summaries.length) {
        await fulfillGraphQLError(route, "Unsupported fixture page cursor.")
        return
      }
      const hasNextPage = pageIndex < summaries.length - 1
      const endCursor = hasNextPage
        ? pageIndex === 0
          ? AXON_HUB_NEXT_CURSOR
          : AXON_HUB_CREATED_CURSOR
        : null
      await fulfill(route, {
        data: {
          queryChannels: {
            edges: [
              {
                node: summaries[pageIndex],
                cursor: `axonhub-edge-${pageIndex + 1}`,
              },
            ],
            pageInfo: {
              hasNextPage,
              endCursor,
            },
            totalCount: summaries.length,
          },
        },
      })
      return
    }

    if (query.includes("query GetAxonHubChannel")) {
      const id = body.variables?.id
      if (
        id !== AXON_HUB_PRIMARY_ID &&
        id !== AXON_HUB_SECONDARY_ID &&
        (id !== AXON_HUB_CREATED_ID || !interceptedAxonHubCreatedChannel)
      ) {
        await fulfillGraphQLError(route, "Unknown fixture channel ID.")
        return
      }
      await fulfill(route, {
        data: {
          node:
            id === AXON_HUB_PRIMARY_ID
              ? getAxonHubPrimaryDetail()
              : id === AXON_HUB_SECONDARY_ID
                ? axonHubDetail({
                    id: AXON_HUB_SECONDARY_ID,
                    name: "Example secondary",
                    tags: ["secondary-tag"],
                    baseURL: "https://secondary.example.invalid/v1",
                    supportedModels: ["model-beta"],
                  })
                : getAxonHubCreatedDetail(),
        },
      })
      return
    }

    if (query.includes("mutation CreateChannel(")) {
      const input = (body.variables?.input ?? {}) as {
        name?: string
        baseURL?: string | null
        supportedModels?: string[]
        tags?: string[] | null
      }
      interceptedAxonHubCreatedChannel = {
        name: input.name ?? "Fixture created channel",
        baseURL: input.baseURL ?? "https://upstream.example.invalid/v1",
        supportedModels: input.supportedModels ?? ["model-alpha"],
        tags: input.tags ?? [],
      }
      await fulfill(route, {
        data: { createChannel: getAxonHubCreatedDetail() },
      })
      return
    }

    if (query.includes("mutation UpdateChannel(")) {
      interceptedAxonHubUpdateVariables = body.variables ?? null
      const id = body.variables?.id
      const input = (body.variables?.input ?? {}) as {
        name?: string
        tags?: string[]
      }
      if (id === AXON_HUB_CREATED_ID && interceptedAxonHubCreatedChannel) {
        if (typeof input.name === "string") {
          interceptedAxonHubCreatedChannel.name = input.name
        }
        if (Array.isArray(input.tags)) {
          interceptedAxonHubCreatedChannel.tags = input.tags
        }
      } else {
        if (typeof input.name === "string") {
          interceptedAxonHubPrimaryName = input.name
        }
        if (Array.isArray(input.tags)) {
          interceptedAxonHubPrimaryTags = input.tags
        }
      }
      await fulfill(route, {
        data: {
          updateChannel:
            id === AXON_HUB_CREATED_ID
              ? getAxonHubCreatedDetail()
              : getAxonHubPrimaryDetail(),
        },
      })
      return
    }

    if (query.includes("mutation UpdateChannelStatus(")) {
      await fulfill(route, {
        data: {
          updateChannelStatus: {
            __typename: "Channel",
            id: body.variables?.id,
            status: body.variables?.status,
          },
        },
      })
      return
    }

    if (query.includes("mutation DeleteChannel(")) {
      interceptedAxonHubDeleteRequestCount += 1
      const deleted =
        body.variables?.id === AXON_HUB_CREATED_ID &&
        interceptedAxonHubCreatedChannel !== null
      if (deleted) interceptedAxonHubCreatedChannel = null
      await fulfill(route, { data: { deleteChannel: deleted } })
      return
    }

    await route.fulfill({
      status: 400,
      body: "unexpected AxonHub GraphQL operation",
    })
  })
}

async function installOctopusCookieAuthIntercepts(context: BrowserContext) {
  interceptedOctopusCookieHeader = null
  interceptedOctopusRootRequestCount = 0
  interceptedOctopusStatusRequestCount = 0

  await context.route(`${INTERCEPTED_OCTOPUS_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path === "/") {
      interceptedOctopusRootRequestCount += 1
      await route.fulfill({
        status: 403,
        contentType: "text/html",
        body: '<!doctype html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
      })
      return
    }

    if (path === OCTOPUS_COOKIE_SESSION_STATUS_PATH) {
      if (request.method() === "GET" && request.resourceType() === "document") {
        interceptedOctopusStatusRequestCount += 1
      }
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: 401, message: "unauthorized" }),
      })
      return
    }

    if (path === "/api/v1/user/login" && request.method() === "POST") {
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-credentials": "true",
          "access-control-allow-origin": request.headers().origin ?? "null",
          "content-type": "application/json",
          "set-cookie": `${INTERCEPTED_OCTOPUS_COOKIE}; Path=/; Max-Age=900`,
        },
        body: JSON.stringify({
          code: 200,
          message: "success",
          data: "login successfully",
        }),
      })
      return
    }

    if (path === "/api/v1/channel/list") {
      interceptedOctopusCookieHeader = request.headers().cookie ?? null
      if (
        !interceptedOctopusCookieHeader?.includes(INTERCEPTED_OCTOPUS_COOKIE)
      ) {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ code: 401, message: "unauthorized" }),
        })
        return
      }

      await fulfill(route, { code: 200, data: [] })
      return
    }

    await route.fulfill({ status: 404, body: "fixture route not configured" })
  })
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

export async function openInterceptedAxonHubManagedSiteChannels(params: {
  context: BrowserContext
  page: Page
  extensionId: string
}) {
  await forceExtensionLanguage(params.page, "en")
  await installAxonHubIntercepts(params.context)
  await seedUserPreferences(await getServiceWorker(params.context), {
    managedSiteType: SITE_TYPES.AXON_HUB,
    axonHub: {
      baseUrl: INTERCEPTED_AXON_HUB_ORIGIN,
      email: "admin@example.invalid",
      password: "fixture-password",
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

export async function openInterceptedOctopusManagedSiteChannels(params: {
  context: BrowserContext
  page: Page
  extensionId: string
}) {
  await forceExtensionLanguage(params.page, "en")
  await installOctopusCookieAuthIntercepts(params.context)
  await seedUserPreferences(await getServiceWorker(params.context), {
    managedSiteType: SITE_TYPES.OCTOPUS,
    octopus: {
      baseUrl: INTERCEPTED_OCTOPUS_ORIGIN,
      username: "admin",
      password: "credential-placeholder",
    },
  })

  const url = new URL(
    `chrome-extension://${params.extensionId}/${OPTIONS_PAGE_PATH}`,
  )
  url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
  await params.page.goto(url.toString())
}
