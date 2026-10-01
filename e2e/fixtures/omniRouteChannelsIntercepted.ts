import type { BrowserContext, Page, Route } from "@playwright/test"

import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  forceExtensionLanguage,
  seedUserPreferences,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"

/**
 * OmniRoute managed-site gateway stub.
 *
 * Only the contract points this integration actually depends on are modelled,
 * and they are written out longhand rather than reusing the production types so
 * that changing those types cannot quietly redefine what the fixture proves:
 *
 * - `GET /api/providers` masks `apiKey` (`first8****last4`) while
 *   `GET /api/providers/client` returns it in plaintext. The extension must
 *   never use the second route as a list source.
 * - A single resource is wrapped as `{ connection }`; collections use
 *   `{ connections, total }`.
 * - `POST /api/providers` persists `isActive: false`, appends the connection
 *   last by priority, and performs no reachability check.
 * - A prefix-addressed connection is created from a provider node and snapshots
 *   that node's `prefix`/`baseUrl`/`nodeName`; its `provider` is the node id.
 *
 * Origin is a reserved `.invalid` host: nothing here may resolve in DNS.
 */

export const OMNIROUTE_FIXTURE_ORIGIN = "https://omniroute.example.invalid"
const OMNIROUTE_FIXTURE_TOKEN = "oma_live_fixture_admin_token"

const OMNIROUTE_PRIMARY_ID = "conn-fixture-primary"
const OMNIROUTE_SECONDARY_ID = "conn-fixture-secondary"

const OMNIROUTE_PRIMARY_OVERRIDE = "https://upstream.example.invalid/v1"
export const OMNIROUTE_PRIMARY_ERROR = "Upstream refused the connection"

interface FixtureConnection {
  id: string
  provider: string
  name: string
  /** Plaintext credential; only the client route ever returns it. */
  apiKey: string
  providerSpecificData: Record<string, unknown> | null
  defaultModel: string | null
  isActive: boolean
  priority: number
  testStatus: string
  lastError: string | null
  updatedAt: string
}

interface FixtureProviderNode {
  id: string
  name: string
  prefix: string
  baseUrl: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const readString = (value: unknown): string =>
  typeof value === "string" ? value : ""

/**
 * Reproduces the gateway's placeholder. Values short enough that an 8/4 split
 * would disclose most of the secret are masked whole, which is what the
 * upstream formatter does as well.
 */
function maskApiKey(value: string): string {
  if (value.length <= 12) return "****"
  return `${value.slice(0, 8)}****${value.slice(-4)}`
}

let connections: FixtureConnection[] = []
let nodes: FixtureProviderNode[] = []
let listRequestCount = 0
let clientRequestCount = 0
let createRequestCount = 0
let createPayloads: Record<string, unknown>[] = []
let updatePayloads: Record<string, unknown>[] = []
let deletedConnectionIds: string[] = []
let nodeCreatePayloads: Record<string, unknown>[] = []
let deletedNodeIds: string[] = []
let clock = 0
let revealApiKeys = false
let lastListRows: Record<string, unknown>[] = []

const nextTimestamp = () =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, (clock += 1))).toISOString()

const seedConnections = (): FixtureConnection[] => {
  clock = 0
  return [
    {
      id: OMNIROUTE_PRIMARY_ID,
      provider: "openai",
      name: "Example primary",
      apiKey: "sk-omni-fixture-primary",
      providerSpecificData: { baseUrl: OMNIROUTE_PRIMARY_OVERRIDE },
      defaultModel: "model-alpha",
      isActive: true,
      priority: 3,
      testStatus: "error",
      lastError: OMNIROUTE_PRIMARY_ERROR,
      updatedAt: nextTimestamp(),
    },
    {
      id: OMNIROUTE_SECONDARY_ID,
      provider: "anthropic",
      name: "Example secondary",
      apiKey: "sk-omni-fixture-secondary",
      providerSpecificData: null,
      defaultModel: null,
      isActive: false,
      priority: 7,
      testStatus: "active",
      lastError: null,
      updatedAt: nextTimestamp(),
    },
  ]
}

/**
 * List route row.
 *
 * `revealApiKeys` models a deployment running with `ALLOW_API_KEY_REVEAL`, where
 * this same route answers with plaintext instead of the placeholder. The
 * extension must drop the value either way, so the flag exists to prove the
 * stronger claim rather than the easy one.
 */
const toListRow = (connection: FixtureConnection) => ({
  id: connection.id,
  provider: connection.provider,
  name: connection.name,
  apiKey: revealApiKeys ? connection.apiKey : maskApiKey(connection.apiKey),
  providerSpecificData: connection.providerSpecificData,
  defaultModel: connection.defaultModel,
  isActive: connection.isActive,
  priority: connection.priority,
  testStatus: connection.testStatus,
  ...(connection.lastError ? { lastError: connection.lastError } : {}),
  updatedAt: connection.updatedAt,
})

/** Detail route row: also masked, but with the credential field present. */
const toDetailRow = (connection: FixtureConnection) => toListRow(connection)

const toCreatedRow = (connection: FixtureConnection) => {
  // The create handler strips the credential from its own response.
  const { apiKey: _apiKey, ...row } = toDetailRow(connection)
  return row
}

const toClientRow = (connection: FixtureConnection) => ({
  ...toListRow(connection),
  apiKey: connection.apiKey,
})

export function getOmniRouteListRequestCount() {
  return listRequestCount
}

/** Reads of the plaintext client route; the workspace must never need one. */
export function getOmniRouteClientRequestCount() {
  return clientRequestCount
}

export function getOmniRouteCreatePayloads() {
  return createPayloads
}

export function getOmniRouteUpdatePayloads() {
  return updatePayloads
}

export function getOmniRouteDeletedConnectionIds() {
  return deletedConnectionIds
}

export function getOmniRouteNodeCreatePayloads() {
  return nodeCreatePayloads
}

export function getOmniRouteDeletedNodeIds() {
  return deletedNodeIds
}

/**
 * The rows the list route last answered with, so a test can confirm the gateway
 * really did send a value and that the page dropped it anyway.
 */
export function getOmniRouteLastListRows() {
  return lastListRows
}

async function fulfill(route: Route, status: number, json: unknown) {
  await route.fulfill({ status, json })
}

async function stubOmniRouteManagedSiteChannels(params: {
  context: BrowserContext
  /** Models a deployment with `ALLOW_API_KEY_REVEAL`, which unmasks the list. */
  revealApiKeys?: boolean
}) {
  connections = seedConnections()
  nodes = []
  listRequestCount = 0
  clientRequestCount = 0
  createRequestCount = 0
  createPayloads = []
  updatePayloads = []
  deletedConnectionIds = []
  nodeCreatePayloads = []
  deletedNodeIds = []
  revealApiKeys = params.revealApiKeys ?? false
  lastListRows = []

  await params.context.route(
    `${OMNIROUTE_FIXTURE_ORIGIN}/**`,
    async (route) => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      const method = request.method()
      const segments = pathname.split("/").filter(Boolean)

      if (pathname === "/api/cli/whoami" && method === "GET") {
        await fulfill(route, 200, {
          authenticated: true,
          viaAccessToken: true,
          scope: "admin",
        })
        return
      }

      if (pathname === "/api/cli/connect" && method === "POST") {
        await fulfill(route, 200, {
          success: true,
          token: OMNIROUTE_FIXTURE_TOKEN,
          scope: "admin",
        })
        return
      }

      if (pathname === "/api/models" && method === "GET") {
        await fulfill(route, 200, {
          models: [
            { provider: "openai", model: "model-alpha" },
            { provider: "openai", model: "model-beta" },
            { provider: "anthropic", model: "model-gamma" },
          ],
        })
        return
      }

      // Must be matched before `/api/providers/{id}`, which would also accept
      // "client" as an id.
      if (pathname === "/api/providers/client" && method === "GET") {
        clientRequestCount += 1
        await fulfill(route, 200, connections.map(toClientRow))
        return
      }

      if (pathname === "/api/providers") {
        if (method === "GET") {
          listRequestCount += 1
          const url = new URL(request.url())
          const limit = Number(url.searchParams.get("limit") ?? "0")
          const offset = Number(url.searchParams.get("offset") ?? "0")
          const page =
            limit > 0 ? connections.slice(offset, offset + limit) : connections
          lastListRows = page.map(toListRow)
          await fulfill(route, 200, {
            connections: lastListRows,
            total: connections.length,
          })
          return
        }

        if (method === "POST") {
          createRequestCount += 1
          const body = JSON.parse(request.postData() ?? "{}") as Record<
            string,
            unknown
          >
          createPayloads.push(body)

          const provider = readString(body.provider)
          const node = nodes.find((candidate) => candidate.id === provider)
          const created: FixtureConnection = {
            id: `conn-created-${createRequestCount}`,
            provider,
            name: readString(body.name),
            apiKey: readString(body.apiKey),
            // A node-backed connection inherits the node's snapshot; a plain
            // connection stores only the caller's override.
            providerSpecificData: node
              ? {
                  prefix: node.prefix,
                  baseUrl: node.baseUrl,
                  nodeName: node.name,
                }
              : isRecord(body.providerSpecificData)
                ? body.providerSpecificData
                : null,
            defaultModel: readString(body.defaultModel) || null,
            // The route never accepts the field and always persists `false`; its
            // own connection test decides when the connection is advertised.
            isActive: false,
            priority:
              connections.reduce(
                (highest, candidate) => Math.max(highest, candidate.priority),
                0,
              ) + 1,
            testStatus: "unknown",
            lastError: null,
            updatedAt: nextTimestamp(),
          }
          connections.push(created)
          await fulfill(route, 201, { connection: toCreatedRow(created) })
          return
        }
      }

      if (pathname === "/api/provider-nodes" && method === "POST") {
        const body = JSON.parse(request.postData() ?? "{}") as Record<
          string,
          unknown
        >
        nodeCreatePayloads.push(body)
        const created: FixtureProviderNode = {
          id: `node-created-${nodeCreatePayloads.length}`,
          name: readString(body.name),
          prefix: readString(body.prefix),
          baseUrl: readString(body.baseUrl),
        }
        nodes.push(created)
        await fulfill(route, 201, { node: { ...created } })
        return
      }

      if (
        segments.length === 3 &&
        segments[0] === "api" &&
        segments[1] === "provider-nodes" &&
        method === "DELETE"
      ) {
        const id = decodeURIComponent(segments[2] ?? "")
        deletedNodeIds.push(id)
        nodes = nodes.filter((candidate) => candidate.id !== id)
        await fulfill(route, 200, { success: true })
        return
      }

      if (
        segments.length === 3 &&
        segments[0] === "api" &&
        segments[1] === "providers"
      ) {
        const id = decodeURIComponent(segments[2] ?? "")
        const target = connections.find((candidate) => candidate.id === id)
        if (!target) {
          await fulfill(route, 404, { error: "Provider connection not found" })
          return
        }

        if (method === "GET") {
          await fulfill(route, 200, {
            connection: toDetailRow(target),
          })
          return
        }

        if (method === "PATCH") {
          const body = JSON.parse(request.postData() ?? "{}") as Record<
            string,
            unknown
          >
          updatePayloads.push(body)
          if (body.name !== undefined) target.name = readString(body.name)
          if (body.apiKey !== undefined) target.apiKey = readString(body.apiKey)
          if (body.defaultModel !== undefined)
            target.defaultModel = readString(body.defaultModel) || null
          if (body.isActive !== undefined)
            target.isActive = Boolean(body.isActive)
          if (body.priority !== undefined)
            target.priority = Number(body.priority)
          if (isRecord(body.providerSpecificData))
            target.providerSpecificData = body.providerSpecificData
          target.updatedAt = nextTimestamp()
          await fulfill(route, 200, { connection: toDetailRow(target) })
          return
        }

        if (method === "DELETE") {
          deletedConnectionIds.push(id)
          connections = connections.filter((candidate) => candidate.id !== id)
          await fulfill(route, 200, { success: true })
          return
        }
      }

      await route.fulfill({
        status: 404,
        body: "fixture route not configured",
      })
    },
  )
}

function managedSiteChannelsUrl(extensionId: string) {
  const url = new URL(`chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`)
  url.hash = MENU_ITEM_IDS.MANAGED_SITE_CHANNELS
  return url.toString()
}

/**
 * Opens the native OmniRoute channel workspace against the stub, with isolated
 * connection state and a stored admin-scoped token.
 */
export async function openInterceptedOmniRouteManagedSiteChannels(params: {
  context: BrowserContext
  page: Page
  extensionId: string
  /** Models a deployment with `ALLOW_API_KEY_REVEAL`, which unmasks the list. */
  revealApiKeys?: boolean
}) {
  await forceExtensionLanguage(params.page, "en")
  await stubOmniRouteManagedSiteChannels({
    context: params.context,
    revealApiKeys: params.revealApiKeys,
  })
  await seedUserPreferences(await getServiceWorker(params.context), {
    managedSiteType: SITE_TYPES.OMNIROUTE,
    omniroute: {
      baseUrl: OMNIROUTE_FIXTURE_ORIGIN,
      token: OMNIROUTE_FIXTURE_TOKEN,
    },
  })
  await params.page.goto(managedSiteChannelsUrl(params.extensionId))
}
