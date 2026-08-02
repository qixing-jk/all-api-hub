import type { ManagedSiteType } from "~/constants/siteType"
import {
  getManagedSiteServiceForType,
  type ManagedSiteConfig,
  type ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import {
  getManagedSiteLegacyAdminConfig,
  type ManagedSiteRuntimeConfig,
} from "~/services/managedSites/runtimeConfig"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"

const TARGET_FINGERPRINT_VERSION = "managed-site-token-import-target:v1"

export interface ManagedSiteTokenBatchImportTargetSummary {
  siteType: ManagedSiteType
  baseUrl: string
  compatibleUserId: string
}

export interface ManagedSiteTokenBatchImportTarget {
  service: ManagedSiteService
  config: ManagedSiteConfig
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

/**
 * Builds an import target from one captured runtime-config snapshot.
 *
 * The returned summary is suitable for local display, while only the one-way
 * fingerprint is intended for persisted repair receipts.
 */
export async function createManagedSiteTokenBatchImportTarget(
  runtimeConfig: ManagedSiteRuntimeConfig,
): Promise<ManagedSiteTokenBatchImportTarget> {
  const legacyConfig = getManagedSiteLegacyAdminConfig(runtimeConfig)
  const normalizedBaseUrl = normalizeManagedSiteChannelBaseUrl(
    legacyConfig.baseUrl,
  )
  const compatibleUserId = legacyConfig.userId.trim()
  const targetSummary = {
    siteType: runtimeConfig.siteType,
    baseUrl: normalizedBaseUrl,
    compatibleUserId,
  }
  const serializedIdentity = serializeTargetIdentity([
    "siteType",
    targetSummary.siteType,
    "normalizedBaseUrl",
    targetSummary.baseUrl,
    "compatibleUserId",
    targetSummary.compatibleUserId,
  ])

  return {
    service: getManagedSiteServiceForType(runtimeConfig.siteType),
    config: runtimeConfig.config,
    targetSummary,
    targetFingerprint: await digestTargetIdentity(serializedIdentity),
  }
}
