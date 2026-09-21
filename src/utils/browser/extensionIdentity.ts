import {
  EMPTY_DEV_IDENTITY,
  getDevBadgeText,
  getDevIdentityColor,
  getDevIdentityColorIndex,
  getDevPathTail,
  type BakedDevIdentity,
  type DevIdentity,
} from "~/utils/core/devIdentity"
import { isDevelopmentMode } from "~/utils/core/environment"

import { getRuntimeId } from "./browserApi"

declare global {
  /**
   * Build identity baked by `wxt.config.ts` for `serve` builds, and `null` in
   * every other build so local paths never ship in release artifacts.
   */
  var __AAH_DEV_IDENTITY__: BakedDevIdentity | null | undefined
}

let cachedIdentity: DevIdentity | null = null

/**
 * Reads the baked identity, tolerating builds and test environments where the
 * constant was never defined.
 */
function readBakedDevIdentity(): BakedDevIdentity | null {
  const baked =
    typeof __AAH_DEV_IDENTITY__ === "undefined" ? null : __AAH_DEV_IDENTITY__
  if (!baked || typeof baked !== "object") return null
  if (typeof baked.projectPath !== "string" || !baked.projectPath.trim()) {
    return null
  }

  return baked
}

/** Composes the baked build facts with what the runtime can still report. */
function buildDevIdentity(): DevIdentity {
  if (!isDevelopmentMode()) return EMPTY_DEV_IDENTITY

  const baked = readBakedDevIdentity()
  const runtimeId = getRuntimeId()?.trim() || null
  const path = baked?.projectPath.trim() || null
  // The extension id is derived from the load path, so it keeps the instance
  // color stable even when the build baked no path.
  const seed = path ?? runtimeId
  const colorIndex = seed ? getDevIdentityColorIndex(seed) : 0

  return {
    path,
    pathTail: path ? getDevPathTail(path) : null,
    outputPath: baked?.outputPath ?? null,
    badgeText: getDevBadgeText(path, seed),
    color: getDevIdentityColor(colorIndex),
    colorIndex,
    builtAt: baked?.builtAt ?? null,
    browserTarget: baked?.browserTarget ?? null,
    source: baked ? "build" : runtimeId ? "runtime-id" : "none",
  }
}

/**
 * Identity of the running development build. Cached because none of it changes
 * while the extension stays loaded.
 */
export function getDevIdentity(): DevIdentity {
  cachedIdentity ??= buildDevIdentity()

  return cachedIdentity
}
