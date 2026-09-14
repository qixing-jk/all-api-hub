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
      "border-destructive-border bg-destructive-soft text-destructive-soft-foreground",
    icon: "bg-destructive-soft text-destructive-soft-foreground",
  },
  warning: {
    badge: "border-warning-border bg-warning-soft text-warning-soft-foreground",
    icon: "bg-warning-soft text-warning-soft-foreground",
  },
  info: {
    badge: "border-info-border bg-info-soft text-info-soft-foreground",
    icon: "bg-info-soft text-info-soft-foreground",
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
