type TranslateFn = (key: string) => string

export const STATUS_VARIANTS: Record<
  number,
  {
    className: string
    variant?: "secondary" | "destructive" | "outline"
  }
> = {
  0: { className: "", variant: "secondary" },
  1: {
    className: "border-emerald-200 text-emerald-700",
    variant: "secondary",
  },
  2: {
    className: "border-amber-200 text-amber-800",
    variant: "outline",
  },
  3: {
    className: "",
    variant: "destructive",
  },
}

/**
 * Resolve the localized label for a managed-site channel status code.
 */
export function getManagedSiteChannelStatusLabel(
  t: TranslateFn,
  status: number,
): string {
  switch (status) {
    case 1:
      return t("managedSiteChannels:statusLabels.enabled")
    case 2:
      return t("managedSiteChannels:statusLabels.manualPause")
    case 3:
      return t("managedSiteChannels:statusLabels.autoDisabled")
    default:
      return t("managedSiteChannels:statusLabels.unknown")
  }
}
