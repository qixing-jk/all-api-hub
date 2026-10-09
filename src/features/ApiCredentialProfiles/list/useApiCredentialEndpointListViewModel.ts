import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import {
  API_CREDENTIAL_PROFILES_VIEW_VARIANTS,
  type ApiCredentialProfilesViewVariant,
} from "~/features/ApiCredentialProfiles/contracts"
import { useIsDesktop } from "~/hooks/useMediaQuery"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

type ListOptions = {
  profiles: ApiCredentialProfile[]
  variant: ApiCredentialProfilesViewVariant
  isFiltering: boolean
  guidedImportEntry?: { profileId: string; request: number }
  targetProfile?: { profileId: string; request: number }
}
export type ApiCredentialEndpointGroup = {
  baseUrl: string
  profiles: ApiCredentialProfile[]
}
const DESKTOP_PANEL_BOTTOM_SPACE_PX = 24
const DESKTOP_PANEL_MIN_HEIGHT_PX = 240

/**
 * Groups the already-normalized persisted profiles by their canonical Base URL.
 */
function groupProfilesByBaseUrl(
  profiles: ApiCredentialProfile[],
): ApiCredentialEndpointGroup[] {
  const groups = new Map<string, ApiCredentialEndpointGroup>()

  for (const profile of profiles) {
    const existing = groups.get(profile.baseUrl)
    if (existing) {
      existing.profiles.push(profile)
    } else {
      groups.set(profile.baseUrl, {
        baseUrl: profile.baseUrl,
        profiles: [profile],
      })
    }
  }

  return Array.from(groups.values())
}

/** Owns endpoint selection, one-time focus requests and responsive panel measurement. */
export function useApiCredentialEndpointListViewModel({
  profiles,
  variant,
  isFiltering,
  guidedImportEntry,
  targetProfile,
}: ListOptions) {
  const isDesktop = useIsDesktop()
  const panelRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => groupProfilesByBaseUrl(profiles), [profiles])
  const useViewportCap =
    variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Options && isDesktop
  const useSidebar = groups.length > 1 && useViewportCap && !isFiltering
  const [selectedBaseUrl, setSelectedBaseUrl] = useState(
    () => groups[0]?.baseUrl ?? "",
  )
  const handledGuidedImportRequestRef = useRef<number | null>(null)
  const handledTargetRequestRef = useRef<number | null>(null)
  const selectedGroup =
    groups.find((group) => group.baseUrl === selectedBaseUrl) ?? groups[0]
  const guidedGroup = guidedImportEntry
    ? groups.find((group) =>
        group.profiles.some(
          (profile) => profile.id === guidedImportEntry.profileId,
        ),
      )
    : undefined
  const targetGroup = targetProfile
    ? groups.find((group) =>
        group.profiles.some(
          (profile) => profile.id === targetProfile.profileId,
        ),
      )
    : undefined
  useLayoutEffect(() => {
    if (!useViewportCap || !panelRef.current) return

    const panel = panelRef.current
    const updateHeight = () => {
      const visibleTop = Math.max(0, panel.getBoundingClientRect().top)
      const available = Math.floor(
        window.innerHeight - visibleTop - DESKTOP_PANEL_BOTTOM_SPACE_PX,
      )
      const height = `${Math.max(DESKTOP_PANEL_MIN_HEIGHT_PX, available)}px`
      if (
        panel.style.getPropertyValue("--api-credential-panel-max-height") !==
        height
      ) {
        panel.style.setProperty("--api-credential-panel-max-height", height)
      }
    }

    updateHeight()
    window.addEventListener("resize", updateHeight)
    window.addEventListener("scroll", updateHeight, true)
    const page = panel.closest("[data-api-credential-page]")
    const observer =
      page && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateHeight)
        : null
    if (page) observer?.observe(page)

    return () => {
      window.removeEventListener("resize", updateHeight)
      window.removeEventListener("scroll", updateHeight, true)
      observer?.disconnect()
    }
  }, [groups.length, isFiltering, useViewportCap])

  useEffect(() => {
    if (
      targetProfile &&
      targetGroup &&
      handledTargetRequestRef.current !== targetProfile.request
    ) {
      handledTargetRequestRef.current = targetProfile.request
      if (targetGroup.baseUrl !== selectedBaseUrl) {
        setSelectedBaseUrl(targetGroup.baseUrl)
      }
      return
    }

    if (
      guidedImportEntry &&
      guidedGroup &&
      handledGuidedImportRequestRef.current !== guidedImportEntry.request
    ) {
      handledGuidedImportRequestRef.current = guidedImportEntry.request
      if (guidedGroup.baseUrl !== selectedBaseUrl) {
        setSelectedBaseUrl(guidedGroup.baseUrl)
      }
      return
    }

    if (selectedGroup && selectedGroup.baseUrl !== selectedBaseUrl) {
      setSelectedBaseUrl(selectedGroup.baseUrl)
    }
  }, [
    guidedGroup,
    guidedImportEntry,
    selectedBaseUrl,
    selectedGroup,
    targetGroup,
    targetProfile,
  ])

  return {
    panelRef,
    groups,
    useViewportCap,
    useSidebar,
    setSelectedBaseUrl,
    selectedGroup,
  }
}
