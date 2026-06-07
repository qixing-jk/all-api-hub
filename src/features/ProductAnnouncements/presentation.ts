import type { TFunction } from "i18next"

import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

export const PRODUCT_ANNOUNCEMENT_SEVERITY_STYLES: Record<
  ProductAnnouncement["severity"],
  {
    badge: string
    icon: string
  }
> = {
  critical: {
    badge:
      "border-red-200/80 bg-red-500/10 text-red-700 dark:border-red-900/60 dark:bg-red-500/15 dark:text-red-300",
    icon: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  },
  warning: {
    badge:
      "border-amber-200/80 bg-amber-500/10 text-amber-700 dark:border-amber-900/60 dark:bg-amber-500/15 dark:text-amber-300",
    icon: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  },
  info: {
    badge:
      "border-blue-200/80 bg-blue-500/10 text-blue-700 dark:border-blue-900/60 dark:bg-blue-500/15 dark:text-blue-300",
    icon: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  },
}

/**
 * Returns localized copy for the fixed product announcement severity set.
 */
export function getProductAnnouncementSeverityLabel(
  severity: ProductAnnouncement["severity"],
  t: TFunction<"productAnnouncements">,
) {
  if (severity === "critical") {
    return t("labels.critical")
  }

  if (severity === "warning") {
    return t("labels.warning")
  }

  return t("labels.info")
}
