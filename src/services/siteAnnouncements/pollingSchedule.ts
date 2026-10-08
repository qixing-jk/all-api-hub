import type { SiteAccount } from "~/types"
import type { SiteAnnouncementSiteState } from "~/types/siteAnnouncements"
import { clampPollingIntervalMinutes } from "~/types/siteAnnouncements"
import { clearAlarm, createAlarm } from "~/utils/browser/alarms"

import { SITE_ANNOUNCEMENTS_ALARM_NAME } from "./constants"
import { resolveAnnouncementSources } from "./sources"

/**
 * Returns the timestamp when a site's cooldown expires, if it has been checked.
 */
export function getAnnouncementCooldownExpiresAt(params: {
  siteState: Pick<SiteAnnouncementSiteState, "lastCheckedAt">
  intervalMinutes: number
}): number | null {
  const lastCheckedAt = params.siteState.lastCheckedAt
  if (typeof lastCheckedAt !== "number") {
    return null
  }

  return (
    lastCheckedAt +
    clampPollingIntervalMinutes(params.intervalMinutes) * 60 * 1000
  )
}

/**
 * Returns whether a site announcement check is still inside its cooldown window.
 */
export function isWithinAnnouncementCooldown(params: {
  siteState: Pick<SiteAnnouncementSiteState, "lastCheckedAt">
  now: number
  intervalMinutes: number
}): boolean {
  const expiresAt = getAnnouncementCooldownExpiresAt(params)
  return expiresAt != null && params.now < expiresAt
}

/**
 * Recreates the site announcement alarm with a specific first-run delay.
 */
export async function rescheduleAnnouncementAlarm(params: {
  intervalMinutes: number
  delayInMinutes: number
}): Promise<void> {
  await clearAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
  await createAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME, {
    periodInMinutes: params.intervalMinutes,
    delayInMinutes: params.delayInMinutes,
  })
}

/**
 * Chooses the next alarm delay from independent source cooldowns.
 */
export function getAnnouncementAlarmDelayMinutes(params: {
  intervalMinutes: number
  siteStates: SiteAnnouncementSiteState[]
  accounts: SiteAccount[]
}): number {
  const now = Date.now()
  let nextDelayMinutes = Number.POSITIVE_INFINITY
  const sources = resolveAnnouncementSources(params.accounts)
  const enabledSiteKeys = new Set(sources.map((source) => source.siteKey))
  const siteKeysWithStatus = new Set(
    params.siteStates
      .filter((siteState) => enabledSiteKeys.has(siteState.siteKey))
      .map((siteState) => siteState.siteKey),
  )

  for (const source of sources) {
    if (!siteKeysWithStatus.has(source.siteKey)) {
      return 1
    }
  }

  for (const siteState of params.siteStates) {
    if (!enabledSiteKeys.has(siteState.siteKey)) {
      continue
    }

    const expiresAt = getAnnouncementCooldownExpiresAt({
      siteState,
      intervalMinutes: params.intervalMinutes,
    })
    if (expiresAt == null) {
      continue
    }

    nextDelayMinutes = Math.min(
      nextDelayMinutes,
      Math.max(1, Math.ceil((expiresAt - now) / 60_000)),
    )
  }

  return Number.isFinite(nextDelayMinutes) ? nextDelayMinutes : 1
}
