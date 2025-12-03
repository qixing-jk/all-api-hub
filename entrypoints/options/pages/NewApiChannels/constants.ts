export const STATUS_VARIANTS: Record<
  number,
  {
    labelKey: string
    className: string
    variant?: "secondary" | "destructive" | "outline"
  }
> = {
  0: { labelKey: "statusLabels.unknown", className: "", variant: "secondary" },
  1: {
    labelKey: "statusLabels.enabled",
    className: "border-emerald-200 text-emerald-700",
    variant: "secondary",
  },
  2: {
    labelKey: "statusLabels.manualPause",
    className: "border-amber-200 text-amber-800",
    variant: "outline",
  },
  3: {
    labelKey: "statusLabels.autoDisabled",
    className: "",
    variant: "destructive",
  },
}
