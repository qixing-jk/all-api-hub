import { useEffect, useState } from "react"

import { cn } from "~/lib/utils"
import aicodemirrorIcon from "~~/resources/partners/icons/aicodemirror.png"
import apimartIcon from "~~/resources/partners/icons/apimart.png"
import defaultSponsorIcon from "~~/resources/partners/icons/default.png"
import fennoIcon from "~~/resources/partners/icons/fenno-ai.png"
import packycodeIcon from "~~/resources/partners/icons/packycode.png"
import qiniuIcon from "~~/resources/partners/icons/qiniu-cloud-ai.png"
import suixiangIcon from "~~/resources/partners/icons/suixiang.png"
import volcengineIcon from "~~/resources/partners/icons/volcengine-coding-plan.png"
import xingchenIcon from "~~/resources/partners/icons/xingchen-ai.png"
import xuanshuIcon from "~~/resources/partners/icons/xuanshu-api.png"

export type SponsorBrandIconSize = "xs" | "sm" | "md" | "lg" | "xl"

export interface SponsorBrandIconProps {
  sponsorId?: string
  name: string
  websiteUrl?: string
  size?: SponsorBrandIconSize
  className?: string
}

/**
 * High-resolution local icons catalog for verified sponsors.
 * Bundled statically to ensure instant, offline-capable display.
 */
const LOCAL_SPONSOR_ICONS: Record<string, string> = {
  "qiniu-cloud-ai": qiniuIcon,
  "fenno-ai": fennoIcon,
  packycode: packycodeIcon,
  "xingchen-ai": xingchenIcon,
  "xuanshu-api": xuanshuIcon,
  aicodemirror: aicodemirrorIcon,
  suixiang: suixiangIcon,
  "volcengine-coding-plan": volcengineIcon,
  apimart: apimartIcon,
}

export const DEFAULT_SPONSOR_ICON = defaultSponsorIcon

const SIZE_CONTAINER_CLASSES: Record<SponsorBrandIconSize, string> = {
  xs: "h-5 w-5 text-3xs",
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-12 w-12 text-base",
}

/**
 * SponsorBrandIcon displays a standardized local sponsor brand icon.
 * If a specific icon is unavailable or fails to load, it falls back
 * directly to the bundled local default sponsor icon (100% offline-capable).
 */
export function SponsorBrandIcon({
  sponsorId,
  name: _name,
  size = "md",
  className,
}: SponsorBrandIconProps) {
  const localSrc = sponsorId ? LOCAL_SPONSOR_ICONS[sponsorId] : undefined
  const targetSrc = localSrc || defaultSponsorIcon

  const [currentSrc, setCurrentSrc] = useState(targetSrc)

  useEffect(() => {
    setCurrentSrc(targetSrc)
  }, [targetSrc])

  const handleImageError = () => {
    if (currentSrc !== defaultSponsorIcon) {
      setCurrentSrc(defaultSponsorIcon)
    }
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center select-none",
        size === "lg" || size === "xl" ? "rounded-lg" : "rounded-md",
        SIZE_CONTAINER_CLASSES[size],
        className,
      )}
      data-testid="sponsor-brand-icon"
    >
      <img
        src={currentSrc}
        alt=""
        aria-hidden="true"
        className={cn(
          "h-full w-full object-contain",
          size === "lg" || size === "xl" ? "rounded-lg" : "rounded-md",
        )}
        onError={handleImageError}
        loading="lazy"
        decoding="async"
        data-testid="sponsor-brand-image"
      />
    </div>
  )
}
