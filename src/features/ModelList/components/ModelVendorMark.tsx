import { CpuChipIcon } from "@heroicons/react/24/outline"
import { CircleHelp } from "lucide-react"
import type { ReactNode } from "react"

import { InitialsIcon } from "~/components/icons/InitialsIcon"
import { COLORS } from "~/constants/designTokens"
import {
  getModelVendorPresentation,
  type ModelVendorPresentationInput,
} from "~/features/ModelList/modelVendorPresentation"
import { cn } from "~/lib/utils"

interface ModelVendorMarkProps {
  vendor: ModelVendorPresentationInput
  variant: "compact" | "badge"
  className?: string
}

const COMPACT_SIZE = 16
const BADGE_SIZE = 28

interface ModelVendorBadgeSurfaceProps {
  children: ReactNode
  className?: string
}

/** Provides one neutral, theme-aware badge silhouette for every vendor kind. */
function ModelVendorBadgeSurface({
  children,
  className,
}: ModelVendorBadgeSurfaceProps) {
  return (
    <span
      aria-hidden={true}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border",
        COLORS.background.tertiary,
        COLORS.text.secondary,
        COLORS.border.subtle,
        className,
      )}
      data-slot="model-vendor-badge"
      style={{ height: BADGE_SIZE, width: BADGE_SIZE }}
    >
      {children}
    </span>
  )
}

/** Renders a library-owned brand mark or a neutral local identity fallback. */
export function ModelVendorMark({
  vendor,
  variant,
  className,
}: ModelVendorMarkProps) {
  const presentation = getModelVendorPresentation(vendor)

  if (presentation.kind === "brand") {
    const BrandMark = presentation.Brand.Color ?? presentation.Brand.Mark

    if (variant === "badge") {
      return (
        <ModelVendorBadgeSurface className={className}>
          <BrandMark
            aria-hidden={true}
            className="size-4"
            size={COMPACT_SIZE}
          />
        </ModelVendorBadgeSurface>
      )
    }

    return (
      <BrandMark
        aria-hidden={true}
        className={cn("size-4 shrink-0", className)}
        size={COMPACT_SIZE}
      />
    )
  }

  if (presentation.kind === "initials") {
    if (variant === "badge") {
      return (
        <ModelVendorBadgeSurface className={className}>
          <span
            aria-hidden={true}
            className={cn(
              "inline-flex size-4 items-center justify-center leading-none font-semibold tracking-tight select-none",
              presentation.initials.length === 1 ? "text-xs" : "text-[11px]",
            )}
          >
            {presentation.initials}
          </span>
        </ModelVendorBadgeSurface>
      )
    }

    return (
      <InitialsIcon
        aria-hidden={true}
        className={className}
        initials={presentation.initials}
        style={{ height: COMPACT_SIZE, width: COMPACT_SIZE }}
      />
    )
  }

  const FallbackIcon =
    presentation.kind === "unknown" ? CircleHelp : CpuChipIcon

  if (variant === "compact") {
    return (
      <FallbackIcon
        aria-hidden={true}
        className={cn("size-4 shrink-0 text-current", className)}
        size={COMPACT_SIZE}
      />
    )
  }

  return (
    <ModelVendorBadgeSurface className={className}>
      <FallbackIcon aria-hidden={true} className="size-4" size={COMPACT_SIZE} />
    </ModelVendorBadgeSurface>
  )
}
