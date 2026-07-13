import { describe, expect, it } from "vitest"

import {
  KILO_CODE_EXPORT_TARGET_OPTIONS,
  KILO_CODE_EXPORT_TARGETS,
} from "~/services/integrations/kiloCodeExport"
import { getKiloCodeExportAnalyticsTarget } from "~/services/integrations/kiloCodeExportAnalytics"
import { PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS } from "~/services/productAnalytics/contracts"

describe("Kilo Code export analytics", () => {
  it("exposes each supported export target as an option", () => {
    expect(KILO_CODE_EXPORT_TARGET_OPTIONS).toEqual([
      KILO_CODE_EXPORT_TARGETS.KiloV7,
      KILO_CODE_EXPORT_TARGETS.Legacy,
    ])
  })

  it.each([
    [
      KILO_CODE_EXPORT_TARGETS.KiloV7,
      PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
    ],
    [
      KILO_CODE_EXPORT_TARGETS.Legacy,
      PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.Legacy,
    ],
  ] as const)("maps %s to the analytics contract", (target, expected) => {
    expect(getKiloCodeExportAnalyticsTarget(target)).toBe(expected)
  })
})
