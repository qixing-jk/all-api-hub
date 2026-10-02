import { isDeepStrictEqual } from "node:util"
import type { Page } from "@playwright/test"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"

type Snapshot = Record<string, unknown>
const isRecord = (value: unknown): value is Snapshot =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Retains the server response rather than the extension's editable projection. */
export function extractManagedChannelSnapshot(
  siteType: ManagedSiteType,
  body: unknown,
  name: string,
): Snapshot | null {
  if (!isRecord(body) || body.success === false || body.errors) return null
  const data =
    siteType === SITE_TYPES.CLAUDE_CODE_HUB
      ? body
      : siteType === SITE_TYPES.OMNIROUTE
        ? // OmniRoute wraps a single resource as `{ connection }`, unlike the
          // `{ data }` envelope the New API family shares.
          body.connection
        : body.data
  const candidate =
    siteType === SITE_TYPES.AXON_HUB
      ? isRecord(data)
        ? data.node
        : undefined
      : Array.isArray(data)
        ? data.find((item) => isRecord(item) && item.name === name)
        : data
  return isRecord(candidate) &&
    candidate.name === name &&
    (typeof candidate.id === "number" || typeof candidate.id === "string")
    ? candidate
    : null
}

/**
 * Recognizes the per-resource read a native editor triggers, which is the
 * evidence source for the rename-preservation check. Inventory routes are
 * deliberately excluded: they return masked projections of every channel.
 *
 * The caller additionally pins the response to the managed site's own origin,
 * so these paths only need to distinguish detail from inventory within one site.
 */
export function isManagedChannelDetailRead(
  siteType: ManagedSiteType,
  method: string,
  path: string,
): boolean {
  if (method !== "GET") return false
  return (
    /\/api\/channel\/\d+$/u.test(path) ||
    /\/api\/v1\/providers\/\d+$/u.test(path) ||
    /\/api\/v1\/admin\/accounts\/\d+$/u.test(path) ||
    (siteType === SITE_TYPES.OMNIROUTE &&
      /\/api\/providers\/[^/]+$/u.test(path)) ||
    (siteType === SITE_TYPES.OCTOPUS &&
      /\/api\/v1\/channel\/(?:list|detail\/\d+)$/u.test(path))
  )
}

/** Collects a fresh native read triggered by opening the test resource's editor. */
export async function captureManagedChannelSnapshot(params: {
  page: Page
  siteType: ManagedSiteType
  baseUrl: string
  name: string
  read: () => Promise<void>
}): Promise<Snapshot> {
  const origin = new URL(params.baseUrl).origin
  let snapshot: Snapshot | null = null
  const response = params.page.context().waitForEvent("response", {
    timeout: 30_000,
    predicate: async (response) => {
      const request = response.request()
      const url = new URL(response.url())
      if (url.origin !== origin || !response.ok()) return false
      if (params.siteType === SITE_TYPES.AXON_HUB) {
        if (
          url.pathname !== "/admin/graphql" ||
          !/query GetAxonHubChannel(?:Core)?\(/u.test(request.postData() ?? "")
        )
          return false
      } else {
        if (
          !isManagedChannelDetailRead(
            params.siteType,
            request.method(),
            url.pathname,
          )
        )
          return false
      }
      try {
        const candidate = extractManagedChannelSnapshot(
          params.siteType,
          await response.json(),
          params.name,
        )
        if (!candidate) return false
        snapshot = candidate
        return true
      } catch {
        return false
      }
    },
  })
  await Promise.all([response, params.read()])
  if (!snapshot) throw new Error("No native channel detail was captured")
  return snapshot
}

/** Reports field names only: native snapshots can contain real credentials. */
export function assertManagedChannelPreserved(
  siteType: ManagedSiteType,
  before: Snapshot,
  after: Snapshot,
): void {
  // A rename always bumps the provider's own row timestamp, and each family
  // spells it its own way.
  const updateTimestamp = [
    SITE_TYPES.AXON_HUB,
    SITE_TYPES.CLAUDE_CODE_HUB,
    SITE_TYPES.OMNIROUTE,
  ].some((candidate) => candidate === siteType)
    ? "updatedAt"
    : "updated_at"
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => field !== "name" && field !== updateTimestamp)
    .filter(
      (field) =>
        Object.hasOwn(before, field) !== Object.hasOwn(after, field) ||
        !isDeepStrictEqual(before[field], after[field]),
    )
    .sort()
  if (changed.length)
    throw new Error(`Unrelated channel fields changed: ${changed.join(", ")}`)
}
