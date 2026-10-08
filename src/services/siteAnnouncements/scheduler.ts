import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { userPreferences } from "~/services/preferences/userPreferences"
import { SiteAnnouncementCheckWorkflow } from "~/services/siteAnnouncements/checkWorkflow"
import {
  getAnnouncementAlarmDelayMinutes,
  rescheduleAnnouncementAlarm,
} from "~/services/siteAnnouncements/pollingSchedule"
import type { SiteAnnouncementPreferences } from "~/types/siteAnnouncements"
import {
  clampNotificationMaxAgeDays,
  clampPollingIntervalMinutes,
  normalizeSiteAnnouncementPreferences,
  SITE_ANNOUNCEMENT_CHECK_TRIGGERS,
} from "~/types/siteAnnouncements"
import {
  clearAlarm,
  getAlarm,
  hasAlarmsAPI,
  onAlarm,
} from "~/utils/browser/alarms"
import { createLogger } from "~/utils/core/logger"

import { SITE_ANNOUNCEMENTS_ALARM_NAME } from "./constants"
import { siteAnnouncementStorage } from "./storage"

const logger = createLogger("SiteAnnouncementScheduler")
class SiteAnnouncementScheduler {
  private isInitialized = false
  private readonly checkWorkflow = new SiteAnnouncementCheckWorkflow(
    rescheduleAnnouncementAlarm,
  )

  async initialize() {
    if (this.isInitialized) {
      return
    }

    onAlarm(async (alarm) => {
      if (alarm.name !== SITE_ANNOUNCEMENTS_ALARM_NAME) {
        return
      }

      await this.checkWorkflow.run({
        trigger: SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Alarm,
      })
    })

    await this.applyScheduleFromPreferences()
    this.isInitialized = true
  }

  private async applySchedule(
    config: SiteAnnouncementPreferences,
  ): Promise<void> {
    if (!hasAlarmsAPI()) {
      logger.warn("Alarms API unavailable; site announcement polling disabled")
      return
    }

    const intervalMinutes = clampPollingIntervalMinutes(config.intervalMinutes)

    if (!config.enabled) {
      await clearAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
      return
    }

    const siteStates = await siteAnnouncementStorage.getStatus()
    const accounts = await accountQueries.getEnabledAccounts()
    const delayInMinutes = getAnnouncementAlarmDelayMinutes({
      intervalMinutes,
      siteStates,
      accounts,
    })
    const existingAlarm = await getAlarm(SITE_ANNOUNCEMENTS_ALARM_NAME)
    if (
      existingAlarm &&
      existingAlarm.periodInMinutes != null &&
      Math.abs(existingAlarm.periodInMinutes - intervalMinutes) < 0.001 &&
      existingAlarm.scheduledTime != null &&
      existingAlarm.scheduledTime <= Date.now() + delayInMinutes * 60_000
    ) {
      return
    }

    await rescheduleAnnouncementAlarm({
      intervalMinutes,
      delayInMinutes,
    })
  }

  private async applyScheduleFromPreferences(): Promise<void> {
    const prefs = await userPreferences.getPreferences()
    await this.applySchedule(
      normalizeSiteAnnouncementPreferences(prefs.siteAnnouncementNotifications),
    )
  }

  async reconcileScheduleFromPreferences(): Promise<void> {
    await this.applyScheduleFromPreferences()
  }

  async updateSettings(
    updates: Partial<SiteAnnouncementPreferences>,
  ): Promise<SiteAnnouncementPreferences> {
    const prefs = await userPreferences.getPreferences()
    const current = normalizeSiteAnnouncementPreferences(
      prefs.siteAnnouncementNotifications,
    )
    const next: SiteAnnouncementPreferences = {
      ...current,
      ...updates,
      intervalMinutes: clampPollingIntervalMinutes(
        updates.intervalMinutes ?? current.intervalMinutes,
      ),
      notificationMaxAgeDays: clampNotificationMaxAgeDays(
        updates.notificationMaxAgeDays ?? current.notificationMaxAgeDays,
      ),
    }

    await userPreferences.savePreferences({
      siteAnnouncementNotifications: next,
    })
    await this.applySchedule(next)
    return next
  }

  async runManualCheck(accountIds?: string[]) {
    return await this.checkWorkflow.run({
      trigger: SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Manual,
      accountIds,
    })
  }
}

export const siteAnnouncementScheduler = new SiteAnnouncementScheduler()
