import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type {
  SiteAnnouncementCheckResult,
  SiteAnnouncementPreferences,
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"

export interface SiteAnnouncementsCheckNowRequest {
  accountIds?: string[]
}

export interface SiteAnnouncementsMarkReadRequest {
  recordId: string
}

export interface SiteAnnouncementsMarkAllReadRequest {
  siteKey?: string
}

export interface SiteAnnouncementsUpdatePreferencesRequest {
  settings: Partial<SiteAnnouncementPreferences>
}

interface SiteAnnouncementsProtocolMap {
  [SiteAnnouncementsMessageTypes.GetStatus](): RuntimeMessageResponse<
    SiteAnnouncementSiteState[]
  >
  [SiteAnnouncementsMessageTypes.ListRecords](): RuntimeMessageResponse<
    SiteAnnouncementRecord[]
  >
  [SiteAnnouncementsMessageTypes.CheckNow](
    data?: SiteAnnouncementsCheckNowRequest,
  ): RuntimeMessageResponse<SiteAnnouncementCheckResult | null>
  [SiteAnnouncementsMessageTypes.MarkRead](
    data: SiteAnnouncementsMarkReadRequest,
  ): RuntimeMessageResponse<undefined>
  [SiteAnnouncementsMessageTypes.MarkAllRead](
    data: SiteAnnouncementsMarkAllReadRequest,
  ): RuntimeMessageResponse<number>
  [SiteAnnouncementsMessageTypes.UpdatePreferences](
    data: SiteAnnouncementsUpdatePreferencesRequest,
  ): RuntimeMessageResponse<SiteAnnouncementPreferences>
}

export const {
  sendMessage: sendSiteAnnouncementsMessage,
  onMessage: onSiteAnnouncementsMessage,
} = defineExtensionMessaging<SiteAnnouncementsProtocolMap>({
  logger: createRuntimeMessagingLogger("SiteAnnouncementsMessaging"),
})
