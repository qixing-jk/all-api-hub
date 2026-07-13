import {
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
} from "~/services/integrations/kiloCodeExport"
import {
  PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS,
  type ProductAnalyticsKiloCodeExportTarget,
} from "~/services/productAnalytics/contracts"

const ANALYTICS_TARGET_BY_EXPORT_TARGET = {
  [KILO_CODE_EXPORT_TARGETS.KiloV7]:
    PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.KiloV7,
  [KILO_CODE_EXPORT_TARGETS.Legacy]:
    PRODUCT_ANALYTICS_KILO_CODE_EXPORT_TARGETS.Legacy,
} as const satisfies Record<
  KiloCodeExportTarget,
  ProductAnalyticsKiloCodeExportTarget
>

/** Map a Kilo Code export target to the product analytics contract. */
export function getKiloCodeExportAnalyticsTarget(target: KiloCodeExportTarget) {
  return ANALYTICS_TARGET_BY_EXPORT_TARGET[target]
}
