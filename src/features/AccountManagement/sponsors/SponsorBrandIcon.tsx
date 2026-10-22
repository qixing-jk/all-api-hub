import { useMemo, useState } from "react"

import { cn } from "~/lib/utils"
import api88Icon from "~~/resources/partners/icons/88api.jpg"
import aicodemirrorIcon from "~~/resources/partners/icons/aicodemirror.png"
import apimartIcon from "~~/resources/partners/icons/apimart.png"
import defaultSponsorIcon from "~~/resources/partners/icons/default.png"
import fennoIcon from "~~/resources/partners/icons/fenno-ai.png"
import packycodeIcon from "~~/resources/partners/icons/packycode.png"
import qiniuIcon from "~~/resources/partners/icons/qiniu-cloud-ai.png"
import suixiangIcon from "~~/resources/partners/icons/suixiang.png"
import volcengineIcon from "~~/resources/partners/icons/volcengine-coding-plan.png"
import xingchenIcon from "~~/resources/partners/icons/xingchen-ai.png"

import { SPONSOR_REMOTE_ICON_BASE_URL } from "./constants"

export const SPONSOR_BRAND_ICON_SIZES = {
  Xs: "xs",
  Sm: "sm",
  Md: "md",
  Lg: "lg",
  Xl: "xl",
} as const

export type SponsorBrandIconSize =
  (typeof SPONSOR_BRAND_ICON_SIZES)[keyof typeof SPONSOR_BRAND_ICON_SIZES]

export interface SponsorBrandIconProps {
  sponsorId?: string
  name: string
  websiteUrl?: string
  iconUrl?: string
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
  aicodemirror: aicodemirrorIcon,
  suixiang: suixiangIcon,
  "volcengine-coding-plan": volcengineIcon,
  apimart: apimartIcon,
  "88api": api88Icon,
}

export const DEFAULT_SPONSOR_ICON = defaultSponsorIcon

const SPONSOR_REMOTE_ICON_EXTENSIONS = [".png", ".jpg"] as const

const SIZE_CONTAINER_CLASSES: Record<SponsorBrandIconSize, string> = {
  [SPONSOR_BRAND_ICON_SIZES.Xs]: "h-5 w-5 text-3xs",
  [SPONSOR_BRAND_ICON_SIZES.Sm]: "h-6 w-6 text-xs",
  [SPONSOR_BRAND_ICON_SIZES.Md]: "h-8 w-8 text-xs",
  [SPONSOR_BRAND_ICON_SIZES.Lg]: "h-10 w-10 text-sm",
  [SPONSOR_BRAND_ICON_SIZES.Xl]: "h-12 w-12 text-base",
}

/**
 * Builds an ordered list of candidate icon URLs to resolve:
 * 1. Explicit cloud-controlled iconUrl (if specified)
 * 2. Bundled local static asset (instant offline display)
 * 3. Remote convention URLs from repository asset storage (.png, then .jpg)
 * 4. Local bundled default fallback icon
 */
function getSponsorIconCandidates({
  sponsorId,
  iconUrl,
}: {
  sponsorId?: string
  iconUrl?: string
}): string[] {
  const candidates: string[] = []

  const trimmedIconUrl = iconUrl?.trim()
  if (trimmedIconUrl) {
    candidates.push(trimmedIconUrl)
  }

  const localSrc = sponsorId ? LOCAL_SPONSOR_ICONS[sponsorId] : undefined
  if (localSrc) {
    candidates.push(localSrc)
  } else if (sponsorId) {
    for (const extension of SPONSOR_REMOTE_ICON_EXTENSIONS) {
      candidates.push(
        `${SPONSOR_REMOTE_ICON_BASE_URL}/${sponsorId}${extension}`,
      )
    }
  }

  candidates.push(defaultSponsorIcon)

  return Array.from(new Set(candidates))
}

/**
 * SponsorBrandIcon displays a standardized sponsor brand icon with layered fallback:
 * 1. Explicit cloud iconUrl (if provided)
 * 2. Bundled local static asset (for verified offline display)
 * 3. Remote convention URL (for unbundled cloud sponsors)
 * 4. Bundled local default sponsor icon (guaranteed fallback)
 */
export function SponsorBrandIcon({
  sponsorId,
  name: _name,
  iconUrl,
  size = SPONSOR_BRAND_ICON_SIZES.Md,
  className,
}: SponsorBrandIconProps) {
  const candidates = useMemo(
    () => getSponsorIconCandidates({ sponsorId, iconUrl }),
    [sponsorId, iconUrl],
  )

  const sourceKey = `${sponsorId ?? ""}|${iconUrl ?? ""}`
  const [prevSourceKey, setPrevSourceKey] = useState(sourceKey)
  const [candidateIndex, setCandidateIndex] = useState(0)

  if (sourceKey !== prevSourceKey) {
    setPrevSourceKey(sourceKey)
    setCandidateIndex(0)
  }

  const currentSrc = candidates[candidateIndex] ?? defaultSponsorIcon

  const handleImageError = () => {
    setCandidateIndex((prevIndex) => {
      if (prevIndex < candidates.length - 1) {
        return prevIndex + 1
      }
      return prevIndex
    })
  }

  const roundedClass =
    size === SPONSOR_BRAND_ICON_SIZES.Lg || size === SPONSOR_BRAND_ICON_SIZES.Xl
      ? "rounded-lg"
      : "rounded-md"

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center select-none",
        roundedClass,
        SIZE_CONTAINER_CLASSES[size],
        className,
      )}
      data-testid="sponsor-brand-icon"
    >
      <img
        src={currentSrc}
        alt=""
        aria-hidden="true"
        className={cn("h-full w-full object-contain", roundedClass)}
        onError={handleImageError}
        loading="lazy"
        decoding="async"
        data-testid="sponsor-brand-image"
      />
    </div>
  )
}
