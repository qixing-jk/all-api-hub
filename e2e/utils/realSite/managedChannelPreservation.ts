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
  const data = siteType === SITE_TYPES.CLAUDE_CODE_HUB ? body : body.data
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
        if (request.method() !== "GET") return false
        const path = url.pathname
        const isDetail =
          /\/api\/channel\/\d+$/u.test(path) ||
          /\/api\/v1\/providers\/\d+$/u.test(path) ||
          /\/api\/v1\/admin\/accounts\/\d+$/u.test(path) ||
          (params.siteType === SITE_TYPES.OCTOPUS &&
            /\/api\/v1\/channel\/(?:list|detail\/\d+)$/u.test(path))
        if (!isDetail) return false
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
  const updateTimestamp =
    siteType === SITE_TYPES.AXON_HUB || siteType === SITE_TYPES.CLAUDE_CODE_HUB
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
