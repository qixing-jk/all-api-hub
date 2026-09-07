import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { type ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import {
  type ManagedSiteRuntimeConfig,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/runtimeConfig"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"

const TARGET_FINGERPRINT_VERSION = "managed-site-token-import-target:v1"

export interface ManagedSiteTokenBatchImportTargetSummary {
  siteType: ManagedSiteType
  baseUrl: string
}

export interface ManagedSiteTokenBatchImportTarget {
  managedSite: ManagedSiteCapabilities
  config: ManagedSiteRuntimeConfigValue
  targetSummary: ManagedSiteTokenBatchImportTargetSummary
  targetFingerprint: string
}

/** Encodes fields without delimiter ambiguity before hashing the target identity. */
function serializeTargetIdentity(parts: string[]): string {
  return [TARGET_FINGERPRINT_VERSION, ...parts]
    .map((part) => `${new TextEncoder().encode(part).byteLength}:${part}`)
    .join("")
}

/** Returns a stable lowercase hexadecimal SHA-256 digest of UTF-8 bytes. */
async function digestTargetIdentity(serializedIdentity: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serializedIdentity),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Returns the configured principal used by the persisted v1 repair receipt. */
function getImportTargetPrincipal(
  runtimeConfig: ManagedSiteRuntimeConfig,
): string {
  switch (runtimeConfig.siteType) {
    case SITE_TYPES.OCTOPUS:
      return runtimeConfig.config.username.trim()
    case SITE_TYPES.AXON_HUB:
      return runtimeConfig.config.email.trim()
    case SITE_TYPES.CLAUDE_CODE_HUB:
    case SITE_TYPES.SUB2API:
      return "admin"
    default:
      return runtimeConfig.config.userId.trim()
  }
}

/**
 * Builds an import target from one captured runtime-config snapshot.
 *
 * The returned summary is suitable for local display, while only the one-way
 * fingerprint is intended for persisted repair receipts.
 */
export async function createManagedSiteTokenBatchImportTarget(
  runtimeConfig: ManagedSiteRuntimeConfig,
): Promise<ManagedSiteTokenBatchImportTarget> {
  const normalizedBaseUrl = normalizeManagedSiteChannelBaseUrl(
    runtimeConfig.config.baseUrl,
  )
  const targetSummary = {
    siteType: runtimeConfig.siteType,
    baseUrl: normalizedBaseUrl,
  }
  const serializedIdentity = serializeTargetIdentity([
    "siteType",
    targetSummary.siteType,
    "normalizedBaseUrl",
    targetSummary.baseUrl,
    // This field label is persisted in v1 receipt hashes; keep its wire spelling.
    "compatibleUserId",
    getImportTargetPrincipal(runtimeConfig),
  ])

  return {
    managedSite: getManagedSiteCapabilities(runtimeConfig.siteType),
    config: runtimeConfig.config,
    targetSummary,
    targetFingerprint: await digestTargetIdentity(serializedIdentity),
  }
}
