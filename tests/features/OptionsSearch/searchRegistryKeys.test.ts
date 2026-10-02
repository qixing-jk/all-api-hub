import fs from "node:fs"
import path from "node:path"
import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { OPTIONS_SEARCH_REGISTRY } from "~/features/OptionsSearch/registry"

function loadZhCnLocales(): Record<string, Record<string, unknown>> {
  const localesDir = path.resolve(process.cwd(), "src/locales/zh-CN")
  const locales: Record<string, Record<string, unknown>> = {}
  for (const file of fs.readdirSync(localesDir)) {
    if (file.endsWith(".json")) {
      const ns = file.replace(".json", "")
      locales[ns] = JSON.parse(
        fs.readFileSync(path.join(localesDir, file), "utf8"),
      )
    }
  }
  return locales
}

function resolveKeyPath(
  locales: Record<string, Record<string, unknown>>,
  fullKey: string,
): { exists: boolean; reason?: string } {
  if (fullKey.startsWith("__page:")) {
    return { exists: true }
  }

  let namespace = "common"
  let keyPath = fullKey
  if (fullKey.includes(":")) {
    const parts = fullKey.split(":")
    namespace = parts[0]!
    keyPath = parts.slice(1).join(":")
  }

  const nsData = locales[namespace]
  if (!nsData) {
    return { exists: false, reason: `Namespace "${namespace}" not found` }
  }

  const segments = keyPath.split(".")
  let current: unknown = nsData
  for (const segment of segments) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== "object" ||
      !(segment in current)
    ) {
      return {
        exists: false,
        reason: `Segment "${segment}" missing in namespace "${namespace}" for key "${fullKey}"`,
      }
    }
    current = (current as Record<string, unknown>)[segment]
  }

  if (typeof current !== "string" && typeof current !== "number") {
    return {
      exists: false,
      reason: `Key "${fullKey}" resolved to non-primitive type: ${typeof current}`,
    }
  }

  return { exists: true }
}

describe("OptionsSearch registry i18n keys integrity", () => {
  const locales = loadZhCnLocales()

  it("verifies that all search item keys exist in the primary locale (zh-CN)", () => {
    const errors: string[] = []

    for (const item of OPTIONS_SEARCH_REGISTRY) {
      const fields = [
        { field: "titleKey", keys: [item.titleKey] },
        {
          field: "descriptionKey",
          keys: item.descriptionKey ? [item.descriptionKey] : [],
        },
        { field: "breadcrumbsKey", keys: item.breadcrumbsKeys ?? [] },
        { field: "keywordKey", keys: item.keywordKeys ?? [] },
      ]
      for (const { field, keys } of fields) {
        for (const key of keys) {
          const check = resolveKeyPath(locales, key)
          if (!check.exists) {
            errors.push(
              `[Item: ${item.id}] ${field} "${key}" is invalid: ${check.reason}`,
            )
          }
        }
      }
    }

    expect(
      errors,
      `Found missing or invalid i18n keys in OPTIONS_SEARCH_REGISTRY:\n${errors.join("\n")}`,
    ).toEqual([])
  })

  it("verifies that all shield automatic feature titleKeys exist in zh-CN", async () => {
    const { SHIELD_AUTOMATIC_FEATURE_ITEMS } = await import(
      "~/features/BasicSettings/components/tabs/Refresh/automaticFeatureSettings"
    )
    const errors: string[] = []

    for (const item of SHIELD_AUTOMATIC_FEATURE_ITEMS) {
      const check = resolveKeyPath(locales, item.titleKey)
      if (!check.exists) {
        errors.push(
          `[ShieldFeature: ${item.feature}] titleKey "${item.titleKey}" is invalid: ${check.reason}`,
        )
      }
    }

    expect(
      errors,
      `Found missing or invalid i18n keys in SHIELD_AUTOMATIC_FEATURE_ITEMS:\n${errors.join("\n")}`,
    ).toEqual([])
  })

  it("verifies that all optional permission display keys exist in zh-CN", async () => {
    const { getOptionalPermissionTitle, getOptionalPermissionDescription } =
      await import("~/services/permissions/permissionDisplay")
    const { OPTIONAL_PERMISSION_IDS } = await import(
      "~/services/permissions/permissionManager"
    )

    const errors: string[] = []
    const mockT = ((key: string) => key) as TFunction

    for (const permission of Object.values(OPTIONAL_PERMISSION_IDS)) {
      const titleKey = getOptionalPermissionTitle(mockT, permission)
      const titleCheck = resolveKeyPath(locales, titleKey)
      if (!titleCheck.exists) {
        errors.push(
          `[Permission: ${permission}] title key "${titleKey}" is invalid: ${titleCheck.reason}`,
        )
      }

      const descKey = getOptionalPermissionDescription(mockT, permission)
      const descCheck = resolveKeyPath(locales, descKey)
      if (!descCheck.exists) {
        errors.push(
          `[Permission: ${permission}] desc key "${descKey}" is invalid: ${descCheck.reason}`,
        )
      }
    }

    expect(
      errors,
      `Found missing or invalid i18n keys in optional permissions:\n${errors.join("\n")}`,
    ).toEqual([])
  })
})
